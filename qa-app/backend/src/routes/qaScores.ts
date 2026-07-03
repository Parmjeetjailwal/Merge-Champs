import { Router } from 'express';
import { prisma } from '../db';
import { config } from '../config';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole } from '../middleware/roles';
import { computeQaTotal, round2, toPeriod } from '../lib/calc';

export const qaScoresRouter = Router();

export interface QaMemberSummary {
  employeeId: string;
  name: string;
  ticketsEvaluated: number;
  avgTimeliness: number;
  avgDocumentation: number;
  avgTotalScore: number;
  tickets: {
    jiraTicketKey: string;
    timelinessScore: number;
    documentationScore: number;
    totalScore: number;
    evaluationDate: string;
  }[];
}

export interface QaReportPayload {
  reportId: string | null;
  period: string;
  generatedAt: string;
  teamMembers: QaMemberSummary[];
}

/** Aggregates QA scores for a period into the PMI-ready report structure. */
export async function buildQaReportPayload(period: string): Promise<QaReportPayload> {
  const scores = await prisma.qAScore.findMany({
    where: { period },
    include: { agent: true },
    orderBy: { evaluationDate: 'asc' },
  });

  const byMember = new Map<string, QaMemberSummary>();
  for (const s of scores) {
    let m = byMember.get(s.employeeId);
    if (!m) {
      m = {
        employeeId: s.employeeId,
        name: s.agent.name,
        ticketsEvaluated: 0,
        avgTimeliness: 0,
        avgDocumentation: 0,
        avgTotalScore: 0,
        tickets: [],
      };
      byMember.set(s.employeeId, m);
    }
    m.tickets.push({
      jiraTicketKey: s.jiraTicketKey,
      timelinessScore: s.timelinessScore,
      documentationScore: s.documentationScore,
      totalScore: s.totalScore,
      evaluationDate: s.evaluationDate.toISOString().slice(0, 10),
    });
  }

  const teamMembers = [...byMember.values()].map((m) => {
    const n = m.tickets.length;
    const sum = (sel: (t: QaMemberSummary['tickets'][number]) => number) =>
      m.tickets.reduce((acc, t) => acc + sel(t), 0);
    return {
      ...m,
      ticketsEvaluated: n,
      avgTimeliness: n ? round2(sum((t) => t.timelinessScore) / n) : 0,
      avgDocumentation: n ? round2(sum((t) => t.documentationScore) / n) : 0,
      avgTotalScore: n ? round2(sum((t) => t.totalScore) / n) : 0,
    };
  });
  teamMembers.sort((a, b) => a.name.localeCompare(b.name));

  return { reportId: null, period, generatedAt: new Date().toISOString(), teamMembers };
}

// GET /api/qa-scores?period=YYYY-MM
qaScoresRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const where = req.query.period ? { period: String(req.query.period) } : {};
    const scores = await prisma.qAScore.findMany({
      where,
      include: { agent: true, evaluator: true },
      orderBy: { evaluationDate: 'desc' },
    });
    res.json(scores);
  })
);

// GET /api/qa-scores/periods
qaScoresRouter.get(
  '/periods',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.qAScore.findMany({
      distinct: ['period'],
      select: { period: true },
      orderBy: { period: 'desc' },
    });
    res.json(rows.map((r) => r.period));
  })
);

// POST /api/qa-scores  (single object or array)
qaScoresRouter.post(
  '/',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const body = Array.isArray(req.body) ? req.body : [req.body];
    const created = [];
    for (const item of body) {
      const { employeeId, jiraTicketKey, timelinessScore, documentationScore, evaluationDate, evaluatorId, comments } =
        item ?? {};
      if (!employeeId || !jiraTicketKey) {
        return res.status(400).json({ error: 'employeeId and jiraTicketKey are required.' });
      }
      const t = Number(timelinessScore);
      const d = Number(documentationScore);
      if (!Number.isFinite(t) || !Number.isFinite(d)) {
        return res.status(400).json({ error: 'timelinessScore and documentationScore must be numbers.' });
      }
      const evalDate = evaluationDate ? new Date(evaluationDate) : new Date();
      const totalScore = computeQaTotal(t, d, config.qa);
      const score = await prisma.qAScore.create({
        data: {
          employeeId,
          jiraTicketKey,
          timelinessScore: t,
          documentationScore: d,
          totalScore,
          evaluationDate: evalDate,
          period: toPeriod(evalDate),
          evaluatorId: evaluatorId ?? null,
          comments: comments ?? null,
        },
        include: { agent: true },
      });
      created.push(score);
    }
    res.status(201).json(created);
  })
);

// GET /api/qa-scores/report?period=YYYY-MM  -> builds + persists a report
qaScoresRouter.get(
  '/report',
  asyncHandler(async (req, res) => {
    const period = req.query.period ? String(req.query.period) : toPeriod(new Date());
    const payload = await buildQaReportPayload(period);
    const report = await prisma.qAReport.create({
      data: { period, payload: JSON.stringify(payload) },
    });
    payload.reportId = report.id;
    res.json({
      reportId: report.id,
      exportedToPMI: report.exportedToPMI,
      weighting: { timeliness: config.qa.timeliness, documentation: config.qa.documentation, scaleMax: config.qa.scaleMax },
      payload,
    });
  })
);

// GET /api/qa-scores/report/export.csv?period=YYYY-MM
qaScoresRouter.get(
  '/report/export.csv',
  asyncHandler(async (req, res) => {
    const period = req.query.period ? String(req.query.period) : toPeriod(new Date());
    const payload = await buildQaReportPayload(period);
    const header = 'employeeId,name,ticketsEvaluated,avgTimeliness,avgDocumentation,avgTotalScore';
    const lines = payload.teamMembers.map((m) =>
      [m.employeeId, `"${m.name}"`, m.ticketsEvaluated, m.avgTimeliness, m.avgDocumentation, m.avgTotalScore].join(',')
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="qa-report-${period}.csv"`);
    res.send([header, ...lines].join('\n'));
  })
);

// POST /api/qa-scores/report/:id/send-pmi
qaScoresRouter.post(
  '/report/:id/send-pmi',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const report = await prisma.qAReport.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: 'Report not found.' });

    let pmiReference = `local-${Date.now()}`;
    let delivered = false;
    if (config.pmiApiUrl) {
      try {
        const resp = await fetch(config.pmiApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: report.payload,
        });
        delivered = resp.ok;
        pmiReference = `pmi-${resp.status}-${Date.now()}`;
      } catch (err) {
        return res.status(502).json({ error: `Failed to reach PMI application: ${(err as Error).message}` });
      }
    }

    const updated = await prisma.qAReport.update({
      where: { id: report.id },
      data: { exportedToPMI: true, pmiReference },
    });
    res.json({
      exportedToPMI: updated.exportedToPMI,
      pmiReference: updated.pmiReference,
      delivered,
      note: config.pmiApiUrl
        ? 'Report POSTed to PMI_API_URL.'
        : 'PMI_API_URL not configured — report marked as exported and available as JSON/CSV.',
    });
  })
);
