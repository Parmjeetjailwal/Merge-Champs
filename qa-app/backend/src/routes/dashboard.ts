import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { round2, toPeriod } from '../lib/calc';
import { buildPeriodView } from './timeUtilization';
import { buildMaintenanceView } from './maintenance';
import { buildCallQaView } from './callQa';
import { buildCaseQaView } from './caseQa';
import { getSettings } from '../settings';
import { resolveRole, canAccessSection } from '../middleware/roles';

export const dashboardRouter = Router();

function previousPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function avgUtil(records: { utilizationPercent: number }[]): number {
  return records.length ? round2(records.reduce((a, r) => a + r.utilizationPercent, 0) / records.length) : 0;
}

function onTimePercent(activities: { status: string }[]): number {
  if (!activities.length) return 0;
  const within = activities.filter((a) => a.status === 'WithinTime').length;
  return Math.round((within / activities.length) * 100);
}

// GET /api/dashboard?period=YYYY-MM  -> summary for all five landing-page widgets
dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const period = req.query.period ? String(req.query.period) : toPeriod(new Date());
    const prev = previousPeriod(period);
    const settings = await getSettings();
    const role = resolveRole(req);
    const canTime = canAccessSection(role, 'time-utilization');
    const canCall = canAccessSection(role, 'call-qa');
    const canCase = canAccessSection(role, 'case-qa');
    const canKt = canAccessSection(role, 'kt');
    const canMaint = canAccessSection(role, 'maintenance');

    const [timeView, maintenanceView, callView, caseView, joinees, prevTime, prevMaint, prevCall, prevCase] =
      await Promise.all([
        buildPeriodView(period),
        buildMaintenanceView(period),
        buildCallQaView(period),
        buildCaseQaView(period),
        prisma.joinee.findMany({ include: { topics: true }, orderBy: { joinDate: 'desc' } }),
        buildPeriodView(prev),
        buildMaintenanceView(prev),
        buildCallQaView(prev),
        buildCaseQaView(prev),
      ]);

    const agentsAvg = (agents: { avgScore: number }[]) =>
      agents.length ? round2(agents.reduce((a, m) => a + m.avgScore, 0) / agents.length) : 0;

    const callAvg = agentsAvg(callView.perAgent);
    const caseAvg = agentsAvg(caseView.perAgent);
    const utilAvg = avgUtil(timeView.records as { utilizationPercent: number }[]);
    const maintOnTime = onTimePercent(maintenanceView.activities as { status: string }[]);

    const deltas = {
      utilization: round2(utilAvg - avgUtil(prevTime.records as { utilizationPercent: number }[])),
      callQa: round2(callAvg - agentsAvg(prevCall.perAgent)),
      caseQa: round2(caseAvg - agentsAvg(prevCase.perAgent)),
      maintenanceOnTime: maintOnTime - onTimePercent(prevMaint.activities as { status: string }[]),
    };

    const target = settings.timeUtilization.targetPercent;

    // Failed SLA cases: Call/Case QC evaluations that did not pass (incl. critical fails).
    const failedCases = [...callView.evaluations, ...caseView.evaluations]
      .filter((e) => !e.passed)
      .map((e) => ({
        caseNo: e.caseNo,
        kind: e.kind,
        section: e.kind === 'CALL' ? 'Call QA' : 'Case QA',
        owner: (e.kind === 'CALL' ? e.callHandledBy?.name : e.caseOwner?.name) ?? '—',
        product: e.product ?? null,
        adherence: e.overallAdherence,
        target: e.target,
        criticalFailed: e.criticalFailed,
      }))
      .sort((a, b) => (a.adherence ?? 0) - (b.adherence ?? 0))
      .slice(0, 12);

    const ktSummary = joinees.map((j) => {
      const total = j.topics.length;
      const completed = j.topics.filter((t) => t.status === 'Completed').length;
      return {
        id: j.id,
        name: j.name,
        completed,
        total,
        percent: total ? Math.round((completed / total) * 100) : 0,
      };
    });

    res.json({
      period,
      previousPeriod: prev,
      visible: {
        timeUtilization: canTime,
        kt: canKt,
        maintenance: canMaint,
        callQa: canCall,
        caseQa: canCase,
        failedSla: canCall || canCase,
      },
      deltas,
      timeUtilization: canTime
        ? {
            top: timeView.top,
            bottom: timeView.bottom,
            count: timeView.records.length,
            averageUtilization: utilAvg,
            target,
          }
        : null,
      kt: canKt ? { joinees: ktSummary } : null,
      maintenance: canMaint
        ? {
            topMaintainer: maintenanceView.topMaintainer,
            missedTimeline: maintenanceView.missedTimeline,
            onTimePercent: maintOnTime,
          }
        : null,
      callQa: canCall
        ? {
            averageScore: callAvg,
            topImprovementArea: callView.topImprovementArea,
            perAgent: callView.perAgent,
          }
        : null,
      caseQa: canCase
        ? {
            averageScore: caseAvg,
            topImprovementArea: caseView.topImprovementArea,
            perAgent: caseView.perAgent,
          }
        : null,
      failedSla: canCall || canCase ? { count: failedCases.length, cases: failedCases } : null,
    });
  })
);
