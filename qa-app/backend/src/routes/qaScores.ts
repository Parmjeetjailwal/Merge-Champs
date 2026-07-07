import { Router } from 'express';
import { prisma } from '../db';
import { config } from '../config';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole } from '../middleware/roles';
import { computeQaTotal, round2, toPeriod } from '../lib/calc';
import { getSettings } from '../settings';
import PDFDocument from 'pdfkit';
import multer from 'multer';
import { parseSheet, getField, toNumber, toDate, resolveEmployee } from '../lib/import';

export const qaScoresRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

export interface QaMemberSummary {
  employeeId: string;
  name: string;
  ticketsEvaluated: number;
  avgTimeliness: number;
  avgDocumentation: number;
  avgTotalScore: number;
  avgCallScore?: number;
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

  const settings = await getSettings();
  if (settings.pmi.includeCallScores) {
    const calls = await prisma.callQcEvaluation.findMany({ where: { period } });
    const byAgent = new Map<string, { sum: number; n: number }>();
    const add = (id: string | null, v: number | null) => {
      if (!id || v === null) return;
      const g = byAgent.get(id) ?? { sum: 0, n: 0 };
      g.sum += v;
      g.n++;
      byAgent.set(id, g);
    };
    for (const c of calls) {
      add(c.callHandledById, c.overallAdherence);
      add(c.caseOwnerId, c.overallAdherence);
    }
    for (const m of teamMembers) {
      const g = byAgent.get(m.employeeId);
      if (g && g.n) m.avgCallScore = round2(g.sum / g.n);
    }
  }

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

// GET /api/qa-scores/trend -> avg total score per period (last 12)
qaScoresRouter.get(
  '/trend',
  asyncHandler(async (_req, res) => {
    const scores = await prisma.qAScore.findMany({ orderBy: { period: 'asc' } });
    const byPeriod = new Map<string, { sum: number; n: number }>();
    for (const s of scores) {
      const g = byPeriod.get(s.period) ?? { sum: 0, n: 0 };
      g.sum += s.totalScore;
      g.n++;
      byPeriod.set(s.period, g);
    }
    const trend = [...byPeriod.entries()]
      .map(([period, g]) => ({ period, value: round2(g.sum / g.n) }))
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-12);
    res.json(trend);
  })
);

// POST /api/qa-scores  (single object or array)
qaScoresRouter.post(
  '/',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const body = Array.isArray(req.body) ? req.body : [req.body];
    const settings = await getSettings();
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
      const totalScore = computeQaTotal(t, d, settings.qa);
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

// POST /api/qa-scores/upload  (multipart field: file)
qaScoresRouter.post(
  '/upload',
  requireRole('Admin', 'QA Lead'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = (req as unknown as { file?: { buffer: Buffer } }).file;
    if (!file) return res.status(400).json({ error: 'No file uploaded (form field "file").' });
    const rows = parseSheet(file.buffer);
    const settings = await getSettings();
    const errors: { row: number; message: string }[] = [];
    let inserted = 0;
    for (let i = 0; i < rows.length; i++) {
      const rowNo = i + 2;
      const row = rows[i];
      const name = getField(row, ['Team Member', 'Employee Name', 'Name', 'Employee', 'Agent']);
      const idOrEmail = getField(row, ['Email', 'Employee ID', 'EmployeeID', 'ID']);
      const ticket = getField(row, ['Jira Ticket Key', 'Ticket Key', 'Ticket', 'Jira', 'Key']);
      const t = toNumber(getField(row, ['Timeliness', 'Timeliness Score', 'Timely Response']));
      const d = toNumber(getField(row, ['Documentation', 'Documentation Score', 'Docs']));
      const comments = getField(row, ['Comments', 'Comment']);
      if (!name && !idOrEmail) {
        errors.push({ row: rowNo, message: 'Missing team member.' });
        continue;
      }
      if (!ticket) {
        errors.push({ row: rowNo, message: 'Missing Jira ticket key.' });
        continue;
      }
      if (t === null || d === null) {
        errors.push({ row: rowNo, message: 'Timeliness and Documentation must be numbers.' });
        continue;
      }
      const employee = await resolveEmployee(name, idOrEmail);
      if (!employee) {
        errors.push({ row: rowNo, message: 'Could not resolve employee.' });
        continue;
      }
      const when = toDate(getField(row, ['Evaluation Date', 'Date'])) ?? new Date();
      await prisma.qAScore.create({
        data: {
          employeeId: employee.id,
          jiraTicketKey: String(ticket).trim(),
          timelinessScore: t,
          documentationScore: d,
          totalScore: computeQaTotal(t, d, settings.qa),
          evaluationDate: when,
          period: toPeriod(when),
          comments: comments ? String(comments) : null,
        },
      });
      inserted++;
    }
    res.json({ inserted, errors, totalRows: rows.length });
  })
);

// PATCH /api/qa-scores/:id  -> edit a score (recomputes total + period)
qaScoresRouter.patch(
  '/:id',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.qAScore.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Score not found.' });
    const { jiraTicketKey, timelinessScore, documentationScore, evaluationDate, comments } = req.body ?? {};
    const t = timelinessScore === undefined || timelinessScore === '' ? existing.timelinessScore : Number(timelinessScore);
    const d =
      documentationScore === undefined || documentationScore === '' ? existing.documentationScore : Number(documentationScore);
    if (!Number.isFinite(t) || !Number.isFinite(d)) {
      return res.status(400).json({ error: 'timelinessScore and documentationScore must be numbers.' });
    }
    const evalDate = evaluationDate ? new Date(evaluationDate) : existing.evaluationDate;
    const settings = await getSettings();
    const updated = await prisma.qAScore.update({
      where: { id: existing.id },
      data: {
        jiraTicketKey: jiraTicketKey ?? existing.jiraTicketKey,
        timelinessScore: t,
        documentationScore: d,
        totalScore: computeQaTotal(t, d, settings.qa),
        evaluationDate: evalDate,
        period: toPeriod(evalDate),
        comments: comments ?? existing.comments,
      },
      include: { agent: true },
    });
    res.json(updated);
  })
);

// DELETE /api/qa-scores/:id
qaScoresRouter.delete(
  '/:id',
  requireRole('Admin', 'QA Lead'),
  asyncHandler(async (req, res) => {
    await prisma.qAScore.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

// GET /api/qa-scores/report?period=YYYY-MM  -> builds + persists a report
qaScoresRouter.get(
  '/report',
  asyncHandler(async (req, res) => {
    const period = req.query.period ? String(req.query.period) : toPeriod(new Date());
    const settings = await getSettings();
    const payload = await buildQaReportPayload(period);
    const report = await prisma.qAReport.create({
      data: { period, payload: JSON.stringify(payload) },
    });
    payload.reportId = report.id;
    res.json({
      reportId: report.id,
      exportedToPMI: report.exportedToPMI,
      weighting: { timeliness: settings.qa.timeliness, documentation: settings.qa.documentation, scaleMax: settings.qa.scaleMax },
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

// GET /api/qa-scores/report/export.pdf?period=YYYY-MM
qaScoresRouter.get(
  '/report/export.pdf',
  asyncHandler(async (req, res) => {
    const period = req.query.period ? String(req.query.period) : toPeriod(new Date());
    const payload = await buildQaReportPayload(period);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="qa-report-${period}.pdf"`);
    const doc = new PDFDocument({ margin: 44, size: 'A4' });
    doc.pipe(res);
    doc.fontSize(20).fillColor('#111').text(`QA Report`);
    doc.fontSize(12).fillColor('#2563eb').text(`Period ${period}`);
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#666').text(`Generated ${new Date().toLocaleString()}`);
    doc.moveDown();
    if (payload.teamMembers.length === 0) {
      doc.fillColor('#000').fontSize(12).text('No data for this period.');
    }
    payload.teamMembers.forEach((m) => {
      doc.fillColor('#111').fontSize(13).text(m.name);
      const line = `Tickets ${m.ticketsEvaluated}  ·  Avg timeliness ${m.avgTimeliness}  ·  Avg documentation ${m.avgDocumentation}  ·  Avg total ${m.avgTotalScore}${
        m.avgCallScore !== undefined ? `  ·  Avg call ${m.avgCallScore}` : ''
      }`;
      doc.fillColor('#444').fontSize(10).text(line);
      doc.moveDown(0.6);
    });
    doc.end();
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

// GET /api/qa-scores/reports  -> saved report history
qaScoresRouter.get(
  '/reports',
  asyncHandler(async (_req, res) => {
    const reports = await prisma.qAReport.findMany({
      orderBy: { generatedAt: 'desc' },
      select: { id: true, period: true, generatedAt: true, exportedToPMI: true, pmiReference: true },
    });
    res.json(reports);
  })
);
