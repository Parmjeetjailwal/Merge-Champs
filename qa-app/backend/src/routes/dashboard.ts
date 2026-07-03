import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { round2, toPeriod } from '../lib/calc';
import { buildPeriodView } from './timeUtilization';
import { buildQaReportPayload } from './qaScores';
import { buildMaintenanceView } from './maintenance';
import { buildCallQaView } from './callQa';

export const dashboardRouter = Router();

// GET /api/dashboard?period=YYYY-MM  -> summary for all five landing-page widgets
dashboardRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const period = req.query.period ? String(req.query.period) : toPeriod(new Date());

    const [timeView, qaPayload, maintenanceView, callView, joinees] = await Promise.all([
      buildPeriodView(period),
      buildQaReportPayload(period),
      buildMaintenanceView(period),
      buildCallQaView(period),
      prisma.joinee.findMany({ include: { topics: true }, orderBy: { joinDate: 'desc' } }),
    ]);

    // QA summary: overall average across members
    const qaAvg =
      qaPayload.teamMembers.length > 0
        ? round2(qaPayload.teamMembers.reduce((a, m) => a + m.avgTotalScore, 0) / qaPayload.teamMembers.length)
        : 0;

    // Call QA summary: overall average across agents
    const callAvg =
      callView.perAgent.length > 0
        ? round2(callView.perAgent.reduce((a, m) => a + m.avgScore, 0) / callView.perAgent.length)
        : 0;

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
      timeUtilization: {
        top: timeView.top,
        bottom: timeView.bottom,
        count: timeView.records.length,
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
      },
      callQa: {
        averageScore: callAvg,
        topImprovementArea: callView.topImprovementArea,
        perAgent: callView.perAgent,
      },
    });
  })
);
