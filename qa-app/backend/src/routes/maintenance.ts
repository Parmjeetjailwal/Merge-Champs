import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole } from '../middleware/roles';
import { maintenanceStatus, topByCount, toPeriod, type CountedMember } from '../lib/calc';
import multer from 'multer';
import { parseSheet, getField, toDate, resolveEmployee } from '../lib/import';

export const maintenanceRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export interface MaintenanceView {
  month: string | null;
  activities: unknown[];
  topMaintainer: (CountedMember & { withinTime: number; exceeded: number }) | null;
  missedTimeline: {
    employeeId: string;
    name: string;
    exceededCount: number;
    activities: { title: string; exceededByMinutes: number }[];
  }[];
}

export async function buildMaintenanceView(month: string | null): Promise<MaintenanceView> {
  if (!month) return { month: null, activities: [], topMaintainer: null, missedTimeline: [] };

  const activities = await prisma.maintenanceActivity.findMany({
    where: { month },
    include: { employee: true },
    orderBy: { scheduledStart: 'asc' },
  });

  const counts = new Map<string, CountedMember & { withinTime: number; exceeded: number }>();
  const missed = new Map<
    string,
    { employeeId: string; name: string; exceededCount: number; activities: { title: string; exceededByMinutes: number }[] }
  >();

  for (const a of activities) {
    const c =
      counts.get(a.employeeId) ??
      { employeeId: a.employeeId, name: a.employee.name, count: 0, withinTime: 0, exceeded: 0 };
    c.count++;
    if (a.status === 'Exceeded') {
      c.exceeded++;
      const m =
        missed.get(a.employeeId) ??
        { employeeId: a.employeeId, name: a.employee.name, exceededCount: 0, activities: [] };
      m.exceededCount++;
      m.activities.push({ title: a.title, exceededByMinutes: a.exceededByMinutes });
      missed.set(a.employeeId, m);
    } else {
      c.withinTime++;
    }
    counts.set(a.employeeId, c);
  }

  const top = topByCount([...counts.values()]);
  const topMaintainer = top ? counts.get(top.employeeId) ?? null : null;

  return {
    month,
    activities,
    topMaintainer,
    missedTimeline: [...missed.values()].sort((a, b) => b.exceededCount - a.exceededCount),
  };
}

// GET /api/maintenance/months
maintenanceRouter.get(
  '/months',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.maintenanceActivity.findMany({
      distinct: ['month'],
      select: { month: true },
      orderBy: { month: 'desc' },
    });
    res.json(rows.map((r) => r.month));
  })
);

// GET /api/maintenance/trend -> on-time % per month (last 12)
maintenanceRouter.get(
  '/trend',
  asyncHandler(async (_req, res) => {
    const activities = await prisma.maintenanceActivity.findMany({ orderBy: { month: 'asc' } });
    const byMonth = new Map<string, { within: number; total: number }>();
    for (const a of activities) {
      const g = byMonth.get(a.month) ?? { within: 0, total: 0 };
      g.total++;
      if (a.status === 'WithinTime') g.within++;
      byMonth.set(a.month, g);
    }
    const trend = [...byMonth.entries()]
      .map(([period, g]) => ({ period, value: g.total ? Math.round((g.within / g.total) * 100) : 0 }))
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-12);
    res.json(trend);
  })
);

// GET /api/maintenance?month=YYYY-MM
maintenanceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    let month = req.query.month ? String(req.query.month) : null;
    if (!month) {
      const latest = await prisma.maintenanceActivity.findFirst({ orderBy: { month: 'desc' } });
      month = latest?.month ?? null;
    }
    res.json(await buildMaintenanceView(month));
  })
);

// POST /api/maintenance
maintenanceRouter.post(
  '/',
  requireRole('Admin', 'Maintenance'),
  asyncHandler(async (req, res) => {
    const { title, employeeId, scheduledStart, scheduledEnd, actualStart, actualEnd } = req.body ?? {};
    if (!title || !employeeId || !scheduledStart || !scheduledEnd || !actualStart || !actualEnd) {
      return res
        .status(400)
        .json({ error: 'title, employeeId, scheduledStart, scheduledEnd, actualStart and actualEnd are required.' });
    }
    const ss = new Date(scheduledStart);
    const se = new Date(scheduledEnd);
    const as = new Date(actualStart);
    const ae = new Date(actualEnd);
    if ([ss, se, as, ae].some((d) => Number.isNaN(d.getTime()))) {
      return res.status(400).json({ error: 'All date/time fields must be valid dates.' });
    }
    const { status, exceededByMinutes } = maintenanceStatus(ss, se, as, ae);
    const activity = await prisma.maintenanceActivity.create({
      data: {
        title,
        employeeId,
        scheduledStart: ss,
        scheduledEnd: se,
        actualStart: as,
        actualEnd: ae,
        status,
        exceededByMinutes,
        month: toPeriod(ss),
      },
      include: { employee: true },
    });
    res.status(201).json(activity);
  })
);

// POST /api/maintenance/upload  (multipart field: file)
maintenanceRouter.post(
  '/upload',
  requireRole('Admin', 'Maintenance'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = (req as unknown as { file?: { buffer: Buffer } }).file;
    if (!file) return res.status(400).json({ error: 'No file uploaded (form field "file").' });
    const rows = parseSheet(file.buffer);
    const errors: { row: number; message: string }[] = [];
    let inserted = 0;
    for (let i = 0; i < rows.length; i++) {
      const rowNo = i + 2;
      const row = rows[i];
      const title = getField(row, ['Title', 'Activity', 'Description']);
      const name = getField(row, ['Team Member', 'Employee', 'Name', 'Assigned To']);
      const idOrEmail = getField(row, ['Email', 'Employee ID']);
      const ss = toDate(getField(row, ['Scheduled Start']));
      const se = toDate(getField(row, ['Scheduled End']));
      const as = toDate(getField(row, ['Actual Start']));
      const ae = toDate(getField(row, ['Actual End']));
      if (!title) {
        errors.push({ row: rowNo, message: 'Missing title.' });
        continue;
      }
      if (!name && !idOrEmail) {
        errors.push({ row: rowNo, message: 'Missing team member.' });
        continue;
      }
      if (!ss || !se || !as || !ae) {
        errors.push({ row: rowNo, message: 'Scheduled/Actual start and end are required and must be valid dates.' });
        continue;
      }
      const employee = await resolveEmployee(name, idOrEmail);
      if (!employee) {
        errors.push({ row: rowNo, message: 'Could not resolve employee.' });
        continue;
      }
      const { status, exceededByMinutes } = maintenanceStatus(ss, se, as, ae);
      await prisma.maintenanceActivity.create({
        data: {
          title: String(title).trim(),
          employeeId: employee.id,
          scheduledStart: ss,
          scheduledEnd: se,
          actualStart: as,
          actualEnd: ae,
          status,
          exceededByMinutes,
          month: toPeriod(ss),
        },
      });
      inserted++;
    }
    res.json({ inserted, errors, totalRows: rows.length });
  })
);

// PATCH /api/maintenance/:id  -> edit an activity (recomputes status + month)
maintenanceRouter.patch(
  '/:id',
  requireRole('Admin', 'Maintenance'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.maintenanceActivity.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Activity not found.' });
    const { title, employeeId, scheduledStart, scheduledEnd, actualStart, actualEnd } = req.body ?? {};
    const ss = scheduledStart ? new Date(scheduledStart) : existing.scheduledStart;
    const se = scheduledEnd ? new Date(scheduledEnd) : existing.scheduledEnd;
    const as = actualStart ? new Date(actualStart) : existing.actualStart;
    const ae = actualEnd ? new Date(actualEnd) : existing.actualEnd;
    if ([ss, se, as, ae].some((d) => Number.isNaN(d.getTime()))) {
      return res.status(400).json({ error: 'All date/time fields must be valid dates.' });
    }
    const { status, exceededByMinutes } = maintenanceStatus(ss, se, as, ae);
    const updated = await prisma.maintenanceActivity.update({
      where: { id: existing.id },
      data: {
        title: title ?? existing.title,
        employeeId: employeeId ?? existing.employeeId,
        scheduledStart: ss,
        scheduledEnd: se,
        actualStart: as,
        actualEnd: ae,
        status,
        exceededByMinutes,
        month: toPeriod(ss),
      },
      include: { employee: true },
    });
    res.json(updated);
  })
);

// DELETE /api/maintenance/:id
maintenanceRouter.delete(
  '/:id',
  requireRole('Admin', 'Maintenance'),
  asyncHandler(async (req, res) => {
    await prisma.maintenanceActivity.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
