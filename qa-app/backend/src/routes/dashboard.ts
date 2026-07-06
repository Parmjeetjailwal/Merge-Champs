import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { round2, toPeriod } from '../lib/calc';
import { buildPeriodView } from './timeUtilization';
import { buildQaReportPayload } from './qaScores';
import { buildMaintenanceView } from './maintenance';
import { buildCallQaView } from './callQa';
import { getSettings } from '../settings';

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

    const [timeView, qaPayload, maintenanceView, callView, joinees, prevTime, prevQa, prevMaint, prevCall, overdueTopics] =
      await Promise.all([
        buildPeriodView(period),
        buildQaReportPayload(period),
        buildMaintenanceView(period),
        buildCallQaView(period),
        prisma.joinee.findMany({ include: { topics: true }, orderBy: { joinDate: 'desc' } }),
        buildPeriodView(prev),
        buildQaReportPayload(prev),
        buildMaintenanceView(prev),
        buildCallQaView(prev),
        prisma.kTTopic.findMany({ where: { status: 'Pending', targetDate: { lt: new Date() } }, include: { joinee: true } }),
      ]);

    const membersAvg = (members: { avgTotalScore: number }[]) =>
      members.length ? round2(members.reduce((a, m) => a + m.avgTotalScore, 0) / members.length) : 0;
    const agentsAvg = (agents: { avgScore: number }[]) =>
      agents.length ? round2(agents.reduce((a, m) => a + m.avgScore, 0) / agents.length) : 0;

    const qaAvg = membersAvg(qaPayload.teamMembers);
    const callAvg = agentsAvg(callView.perAgent);
    const utilAvg = avgUtil(timeView.records as { utilizationPercent: number }[]);
    const maintOnTime = onTimePercent(maintenanceView.activities as { status: string }[]);

    const deltas = {
      utilization: round2(utilAvg - avgUtil(prevTime.records as { utilizationPercent: number }[])),
      qa: round2(qaAvg - membersAvg(prevQa.teamMembers)),
      callQa: round2(callAvg - agentsAvg(prevCall.perAgent)),
      maintenanceOnTime: maintOnTime - onTimePercent(prevMaint.activities as { status: string }[]),
    };

    const target = settings.timeUtilization.targetPercent;
    const belowTarget = (timeView.records as { employee: { name: string }; utilizationPercent: number }[])
      .filter((r) => r.utilizationPercent < target)
      .map((r) => ({ name: r.employee.name, utilizationPercent: r.utilizationPercent }));

    const callBreaches = (callView.evaluations as { passed: boolean }[]).filter((e) => !e.passed).length;

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
      deltas,
      timeUtilization: {
        top: timeView.top,
        bottom: timeView.bottom,
        count: timeView.records.length,
        averageUtilization: utilAvg,
        target,
      },
      qa: {
        averageScore: qaAvg,
        members: qaPayload.teamMembers.map((m) => ({
          employeeId: m.employeeId,
          name: m.name,
          avgTotalScore: m.avgTotalScore,
          ticketsEvaluated: m.ticketsEvaluated,
        })),
      },
      kt: { joinees: ktSummary },
      maintenance: {
        topMaintainer: maintenanceView.topMaintainer,
        missedTimeline: maintenanceView.missedTimeline,
        onTimePercent: maintOnTime,
      },
      callQa: {
        averageScore: callAvg,
        topImprovementArea: callView.topImprovementArea,
        perAgent: callView.perAgent,
      },
      alerts: {
        belowTarget: { target, employees: belowTarget },
        overdueKT: overdueTopics.map((t) => ({ joinee: t.joinee.name, topic: t.topicName })),
        repeatMissers: maintenanceView.missedTimeline.filter((m) => m.exceededCount > 1),
        callBreaches,
      },
    });
  })
);
