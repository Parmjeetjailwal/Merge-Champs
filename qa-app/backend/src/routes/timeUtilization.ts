import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole } from '../middleware/roles';
import { computeUtilizationPercent, pickN, round2 } from '../lib/calc';

export const timeUtilizationRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/** Reads a field from a parsed row by trying several header aliases (case-insensitive). */
function getField(row: Record<string, unknown>, aliases: string[]): unknown {
  const normalized = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) {
    normalized.set(k.trim().toLowerCase(), v);
  }
  for (const a of aliases) {
    const hit = normalized.get(a.toLowerCase());
    if (hit !== undefined && hit !== null && String(hit).trim() !== '') return hit;
  }
  return undefined;
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

interface TopBottom {
  period: string | null;
  records: unknown[];
  top: unknown[];
  bottom: unknown[];
}

export async function buildPeriodView(period: string | null): Promise<TopBottom> {
  if (!period) return { period: null, records: [], top: [], bottom: [] };
  const records = await prisma.timeUtilizationRecord.findMany({
    where: { period },
    include: { employee: true },
    orderBy: { utilizationPercent: 'desc' },
  });
  const top = pickN(records, (r) => r.utilizationPercent, 2, 'desc', (r) => r.employee.name);
  const bottom = pickN(records, (r) => r.utilizationPercent, 2, 'asc', (r) => r.employee.name);
  return { period, records, top, bottom };
}

// GET /api/time-utilization/periods -> distinct periods (most recent first)
timeUtilizationRouter.get(
  '/periods',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.timeUtilizationRecord.findMany({
      distinct: ['period'],
      select: { period: true },
      orderBy: { period: 'desc' },
    });
    res.json(rows.map((r) => r.period));
  })
);

// GET /api/time-utilization/trend -> avg utilization per period (last 12)
timeUtilizationRouter.get(
  '/trend',
  asyncHandler(async (_req, res) => {
    const records = await prisma.timeUtilizationRecord.findMany({ orderBy: { period: 'asc' } });
    const byPeriod = new Map<string, { sum: number; n: number }>();
    for (const r of records) {
      const g = byPeriod.get(r.period) ?? { sum: 0, n: 0 };
      g.sum += r.utilizationPercent;
      g.n++;
      byPeriod.set(r.period, g);
    }
    const trend = [...byPeriod.entries()]
      .map(([period, g]) => ({ period, value: round2(g.sum / g.n) }))
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-12);
    res.json(trend);
  })
);

// GET /api/time-utilization?period=YYYY-MM -> records + top 2 / bottom 2
timeUtilizationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    let period = req.query.period ? String(req.query.period) : null;
    if (!period) {
      const latest = await prisma.timeUtilizationRecord.findFirst({ orderBy: { period: 'desc' } });
      period = latest?.period ?? null;
    }
    res.json(await buildPeriodView(period));
  })
);

// POST /api/time-utilization/upload  (multipart form field: file)
timeUtilizationRouter.post(
  '/upload',
  requireRole('Admin', 'QA Lead'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = (req as unknown as { file?: { buffer: Buffer; originalname: string } }).file;
    if (!file) return res.status(400).json({ error: 'No file uploaded (form field "file").' });

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    const errors: { row: number; message: string }[] = [];
    let inserted = 0;
    let updated = 0;
    const periods = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rowNo = i + 2; // account for header row
      const row = rows[i];

      const name = getField(row, ['Employee Name', 'Name', 'Employee']);
      const idOrEmail = getField(row, ['Email', 'Employee ID', 'EmployeeID', 'ID']);
      const team = getField(row, ['Team']);
      const periodRaw = getField(row, ['Period', 'Month']);
      const planned = toNumber(getField(row, ['Planned Hours', 'PlannedHours', 'Planned']));
      const actual = toNumber(
        getField(row, ['Actual/Billable Hours', 'Actual Hours', 'Billable Hours', 'Actual', 'Billable'])
      );

      if (!name && !idOrEmail) {
        errors.push({ row: rowNo, message: 'Missing employee name/email.' });
        continue;
      }
      if (!periodRaw) {
        errors.push({ row: rowNo, message: 'Missing period.' });
        continue;
      }
      if (planned === null || actual === null) {
        errors.push({ row: rowNo, message: 'Planned Hours and Actual/Billable Hours must be numbers.' });
        continue;
      }

      const period = String(periodRaw).trim();
      const emailStr = idOrEmail ? String(idOrEmail).trim() : '';

      // Match by email first, then by name; create the employee if not found.
      let employee = null;
      if (emailStr.includes('@')) {
        employee = await prisma.employee.findUnique({ where: { email: emailStr } });
      }
      if (!employee && name) {
        employee = await prisma.employee.findFirst({ where: { name: String(name).trim() } });
      }
      if (!employee) {
        employee = await prisma.employee.create({
          data: {
            name: String(name ?? emailStr).trim(),
            email: emailStr.includes('@') ? emailStr : `${String(name).trim().toLowerCase().replace(/\s+/g, '.')}@example.com`,
            team: team ? String(team).trim() : null,
            role: 'Team Member',
          },
        });
      }

      const utilizationPercent = computeUtilizationPercent(planned, actual);
      const existing = await prisma.timeUtilizationRecord.findUnique({
        where: { employeeId_period: { employeeId: employee.id, period } },
      });
      await prisma.timeUtilizationRecord.upsert({
        where: { employeeId_period: { employeeId: employee.id, period } },
        create: {
          employeeId: employee.id,
          period,
          plannedHours: planned,
          actualHours: actual,
          utilizationPercent,
          sourceFile: file.originalname,
        },
        update: {
          plannedHours: planned,
          actualHours: actual,
          utilizationPercent,
          sourceFile: file.originalname,
        },
      });
      if (existing) updated++;
      else inserted++;
      periods.add(period);
    }

    const latestPeriod = [...periods].sort().reverse()[0] ?? null;
    res.json({
      inserted,
      updated,
      errors,
      totalRows: rows.length,
      view: await buildPeriodView(latestPeriod),
    });
  })
);

// POST /api/time-utilization  -> manually add/replace a single record
timeUtilizationRouter.post(
  '/',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const { employeeId, period, plannedHours, actualHours } = req.body ?? {};
    const planned = Number(plannedHours);
    const actual = Number(actualHours);
    if (!employeeId || !period || !Number.isFinite(planned) || !Number.isFinite(actual)) {
      return res.status(400).json({ error: 'employeeId, period, plannedHours and actualHours are required.' });
    }
    const utilizationPercent = computeUtilizationPercent(planned, actual);
    const record = await prisma.timeUtilizationRecord.upsert({
      where: { employeeId_period: { employeeId, period: String(period) } },
      create: { employeeId, period: String(period), plannedHours: planned, actualHours: actual, utilizationPercent, sourceFile: 'manual' },
      update: { plannedHours: planned, actualHours: actual, utilizationPercent, sourceFile: 'manual' },
      include: { employee: true },
    });
    res.status(201).json(record);
  })
);

// PATCH /api/time-utilization/:id
timeUtilizationRouter.patch(
  '/:id',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.timeUtilizationRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Record not found.' });
    const planned = req.body?.plannedHours === undefined ? existing.plannedHours : Number(req.body.plannedHours);
    const actual = req.body?.actualHours === undefined ? existing.actualHours : Number(req.body.actualHours);
    if (!Number.isFinite(planned) || !Number.isFinite(actual)) {
      return res.status(400).json({ error: 'plannedHours and actualHours must be numbers.' });
    }
    const updated = await prisma.timeUtilizationRecord.update({
      where: { id: existing.id },
      data: { plannedHours: planned, actualHours: actual, utilizationPercent: computeUtilizationPercent(planned, actual) },
      include: { employee: true },
    });
    res.json(updated);
  })
);

// DELETE /api/time-utilization/:id
timeUtilizationRouter.delete(
  '/:id',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    await prisma.timeUtilizationRecord.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
