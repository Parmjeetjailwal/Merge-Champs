import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole } from '../middleware/roles';
import { maintenanceStatus, topByCount, toPeriod, type CountedMember } from '../lib/calc';

export const maintenanceRouter = Router();

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
  requireRole('Admin', 'QA Lead'),
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
