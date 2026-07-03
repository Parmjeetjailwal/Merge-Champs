import { Router } from 'express';
import { prisma } from '../db';
import { config } from '../config';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole } from '../middleware/roles';
import { computeCallQaTotal, round2, toPeriod } from '../lib/calc';

export const callQaRouter = Router();

const PARAM_LABELS: Record<string, string> = {
  opening: 'Call Opening',
  info: 'Required Information Captured',
  deadAir: 'No Dead Air',
  closing: 'Call Closing',
};

export interface CallQaView {
  period: string | null;
  evaluations: unknown[];
  perAgent: { employeeId: string; name: string; evaluations: number; avgScore: number }[];
  perParameter: { key: string; label: string; avg: number }[];
  topImprovementArea: { key: string; label: string; avg: number } | null;
  thresholds: { caseCreationSecs: number; callCloseSecs: number };
}

export async function buildCallQaView(period: string | null): Promise<CallQaView> {
  const thresholds = {
    caseCreationSecs: config.callQa.caseCreationThresholdSecs,
    callCloseSecs: config.callQa.callCloseThresholdSecs,
  };
  if (!period) {
    return { period: null, evaluations: [], perAgent: [], perParameter: [], topImprovementArea: null, thresholds };
  }

  const evaluations = await prisma.callQAEvaluation.findMany({
    where: { period },
    include: { agent: true, analyst: true },
    orderBy: { callDate: 'desc' },
  });

  // Per-agent average total score
  const agentMap = new Map<string, { employeeId: string; name: string; total: number; count: number }>();
  for (const e of evaluations) {
    const a = agentMap.get(e.employeeId) ?? { employeeId: e.employeeId, name: e.agent.name, total: 0, count: 0 };
    a.total += e.totalScore;
    a.count++;
    agentMap.set(e.employeeId, a);
  }
  const perAgent = [...agentMap.values()]
    .map((a) => ({ employeeId: a.employeeId, name: a.name, evaluations: a.count, avgScore: round2(a.total / a.count) }))
    .sort((a, b) => b.avgScore - a.avgScore);

  // Per-parameter averages (normalised to the configured scale)
  const n = evaluations.length;
  const sum = { opening: 0, info: 0, deadAir: 0, closing: 0 };
  for (const e of evaluations) {
    sum.opening += e.callOpeningScore;
    sum.info += e.infoCapturedScore;
    sum.deadAir += e.deadAirScore;
    sum.closing += e.callClosingScore;
  }
  const perParameter = (['opening', 'info', 'deadAir', 'closing'] as const).map((key) => ({
    key,
    label: PARAM_LABELS[key],
    avg: n ? round2(sum[key] / n) : 0,
  }));
  const topImprovementArea = n ? [...perParameter].sort((a, b) => a.avg - b.avg)[0] : null;

  return { period, evaluations, perAgent, perParameter, topImprovementArea, thresholds };
}

// GET /api/call-qa/periods
callQaRouter.get(
  '/periods',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.callQAEvaluation.findMany({
      distinct: ['period'],
      select: { period: true },
      orderBy: { period: 'desc' },
    });
    res.json(rows.map((r) => r.period));
  })
);

// GET /api/call-qa?period=YYYY-MM
callQaRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    let period = req.query.period ? String(req.query.period) : null;
    if (!period) {
      const latest = await prisma.callQAEvaluation.findFirst({ orderBy: { period: 'desc' } });
      period = latest?.period ?? null;
    }
    res.json(await buildCallQaView(period));
  })
);

// POST /api/call-qa
callQaRouter.post(
  '/',
  requireRole('Admin', 'Call QA Analyst'),
  asyncHandler(async (req, res) => {
    const {
      employeeId,
      callReference,
      callDate,
      analystId,
      callOpeningScore,
      infoCapturedScore,
      deadAirScore,
      deadAirIncidents,
      callClosingScore,
      caseCreationTimeSecs,
      callCloseTimeSecs,
      comments,
    } = req.body ?? {};

    if (!employeeId || !callReference) {
      return res.status(400).json({ error: 'employeeId and callReference are required.' });
    }
    const scores = {
      opening: Number(callOpeningScore),
      info: Number(infoCapturedScore),
      deadAir: Number(deadAirScore),
      closing: Number(callClosingScore),
    };
    if (Object.values(scores).some((v) => !Number.isFinite(v))) {
      return res.status(400).json({ error: 'All four quality parameter scores must be numbers.' });
    }
    const caseSecs = Number(caseCreationTimeSecs) || 0;
    const closeSecs = Number(callCloseTimeSecs) || 0;
    const date = callDate ? new Date(callDate) : new Date();

    const totalScore = computeCallQaTotal(scores, config.callQa);
    const evaluation = await prisma.callQAEvaluation.create({
      data: {
        employeeId,
        callReference,
        callDate: date,
        analystId: analystId ?? null,
        callOpeningScore: scores.opening,
        infoCapturedScore: scores.info,
        deadAirScore: scores.deadAir,
        deadAirIncidents: Number(deadAirIncidents) || 0,
        callClosingScore: scores.closing,
        caseCreationTimeSecs: caseSecs,
        caseCreationBreached: caseSecs > config.callQa.caseCreationThresholdSecs,
        callCloseTimeSecs: closeSecs,
        callCloseBreached: closeSecs > config.callQa.callCloseThresholdSecs,
        totalScore,
        period: toPeriod(date),
        comments: comments ?? null,
      },
      include: { agent: true, analyst: true },
    });
    res.status(201).json(evaluation);
  })
);
