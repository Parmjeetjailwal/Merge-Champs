import { Router } from 'express';
import { prisma } from '../db';
import { getSettings } from '../settings';
import { asyncHandler } from '../lib/asyncHandler';
import { requireRole } from '../middleware/roles';
import { computeQcResult, normalizeQcAnswer, round2, toPeriod, type QcAnswer } from '../lib/calc';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { parseSheet, getField, toDate, resolveEmployee } from '../lib/import';

export type QcSection = 'CALL' | 'CASE';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const ANSWER_VALUES: QcAnswer[] = ['YES', 'NO', 'NA'];

const evalInclude = {
  callHandledBy: true,
  caseOwner: true,
  analyst: true,
  answers: { include: { parameter: true } },
} as const;

type EvalWithRelations = Awaited<ReturnType<typeof loadEvaluation>>;

function loadEvaluation(id: string) {
  return prisma.callQcEvaluation.findUnique({ where: { id }, include: evalInclude });
}

/** Section-specific labels/behaviour shared between the two QC scorecards. */
interface SectionConfig {
  section: QcSection;
  /** The person a QC of this section is attributed to. */
  personField: 'callHandledById' | 'caseOwnerId';
  personLabel: string;
  slug: string; // used in export filenames / sheet names
  personColumns: string[]; // Excel column aliases for the person name
  personEmailColumns: string[]; // Excel column aliases for the person email
}

const CONFIGS: Record<QcSection, SectionConfig> = {
  CALL: {
    section: 'CALL',
    personField: 'callHandledById',
    personLabel: 'Call handled by',
    slug: 'call-qc',
    personColumns: ['Call Handled By', 'Call handled by?', 'Call Handler', 'Agent'],
    personEmailColumns: ['Call Handler Email', 'Handler Email'],
  },
  CASE: {
    section: 'CASE',
    personField: 'caseOwnerId',
    personLabel: 'Case owner',
    slug: 'case-qc',
    personColumns: ['Case Owner', 'Owner', 'Case handled by'],
    personEmailColumns: ['Case Owner Email', 'Owner Email'],
  },
};

/** Flattens a persisted evaluation into the shape the frontend consumes. */
export function enrichEvaluation(e: NonNullable<EvalWithRelations>) {
  return {
    id: e.id,
    kind: e.kind,
    srNo: e.srNo,
    product: e.product,
    caseNo: e.caseNo,
    callDateTime: e.callDateTime,
    ticketCreatedDateTime: e.ticketCreatedDateTime,
    userName: e.userName,
    callHandledById: e.callHandledById,
    callHandledBy: e.callHandledBy,
    caseOwnerId: e.caseOwnerId,
    caseOwner: e.caseOwner,
    analystId: e.analystId,
    analyst: e.analyst,
    customerEscalation: e.customerEscalation,
    callScore: e.callScore,
    callMax: e.callMax,
    callAdherence: e.callAdherence,
    caseScore: e.caseScore,
    caseMax: e.caseMax,
    caseAdherence: e.caseAdherence,
    overallScore: e.overallScore,
    overallMax: e.overallMax,
    overallAdherence: e.overallAdherence,
    target: e.target,
    passed: e.passed,
    findings: e.findings,
    actionPlan: e.actionPlan,
    period: e.period,
    createdAt: e.createdAt,
    criticalFailed: e.answers.some((a) => a.parameter.critical && a.answer === 'NO'),
    answers: e.answers
      .map((a) => ({
        parameterId: a.parameterId,
        code: a.parameter.code,
        section: a.parameter.section,
        text: a.parameter.text,
        order: a.parameter.order,
        critical: a.parameter.critical,
        answer: a.answer,
        comment: a.comment,
      }))
      .sort((a, b) => a.order - b.order),
  };
}

export interface QcView {
  section: QcSection;
  period: string | null;
  target: number;
  evaluations: ReturnType<typeof enrichEvaluation>[];
  averageScore: number;
  passRate: number;
  perAgent: { employeeId: string; name: string; evaluations: number; avgScore: number }[];
  perParameter: { key: string; label: string; section: string; avg: number; applicable: number; critical: boolean }[];
  topImprovementArea: { key: string; label: string; avg: number } | null;
}

export async function buildQcView(section: QcSection, period: string | null): Promise<QcView> {
  const settings = await getSettings();
  const target = (section === 'CALL' ? settings.callQc : settings.caseQc).target;
  if (!period) {
    return { section, period: null, target, evaluations: [], averageScore: 0, passRate: 0, perAgent: [], perParameter: [], topImprovementArea: null };
  }

  const [rawEvals, parameters] = await Promise.all([
    prisma.callQcEvaluation.findMany({ where: { period, kind: section }, include: evalInclude, orderBy: { createdAt: 'desc' } }),
    prisma.qcParameter.findMany({ where: { active: true, section }, orderBy: { order: 'asc' } }),
  ]);
  const evaluations = rawEvals.map(enrichEvaluation);

  const scored = evaluations.filter((e) => e.overallAdherence !== null);
  const averageScore = scored.length
    ? round2(scored.reduce((a, e) => a + (e.overallAdherence ?? 0), 0) / scored.length)
    : 0;
  const passRate = evaluations.length
    ? Math.round((evaluations.filter((e) => e.passed).length / evaluations.length) * 100)
    : 0;

  // Per-agent: attribute this section's adherence to its owner.
  const agentMap = new Map<string, { employeeId: string; name: string; sum: number; n: number; evals: Set<string> }>();
  const addAgent = (empId: string, name: string, value: number | null, evalId: string) => {
    const a = agentMap.get(empId) ?? { employeeId: empId, name, sum: 0, n: 0, evals: new Set<string>() };
    a.evals.add(evalId);
    if (value !== null) {
      a.sum += value;
      a.n++;
    }
    agentMap.set(empId, a);
  };
  for (const e of evaluations) {
    if (section === 'CALL' && e.callHandledById && e.callHandledBy) addAgent(e.callHandledById, e.callHandledBy.name, e.callAdherence, e.id);
    else if (section === 'CASE' && e.caseOwnerId && e.caseOwner) addAgent(e.caseOwnerId, e.caseOwner.name, e.caseAdherence, e.id);
  }
  const perAgent = [...agentMap.values()]
    .map((a) => ({ employeeId: a.employeeId, name: a.name, evaluations: a.evals.size, avgScore: a.n ? round2(a.sum / a.n) : 0 }))
    .sort((a, b) => b.avgScore - a.avgScore || a.name.localeCompare(b.name));

  const paramStats = new Map<string, { yes: number; no: number }>();
  for (const e of evaluations) {
    for (const ans of e.answers) {
      const s = paramStats.get(ans.parameterId) ?? { yes: 0, no: 0 };
      if (ans.answer === 'YES') s.yes++;
      else if (ans.answer === 'NO') s.no++;
      paramStats.set(ans.parameterId, s);
    }
  }
  const perParameter = parameters.map((p) => {
    const s = paramStats.get(p.id) ?? { yes: 0, no: 0 };
    const applicable = s.yes + s.no;
    return { key: p.code, label: p.text, section: p.section, applicable, critical: p.critical, avg: applicable ? round2((s.yes / applicable) * 100) : 100 };
  });
  const rated = perParameter.filter((p) => p.applicable > 0);
  const topImprovementArea = rated.length
    ? (() => {
        const worst = [...rated].sort((a, b) => a.avg - b.avg || a.key.localeCompare(b.key))[0];
        return { key: worst.key, label: worst.label, avg: worst.avg };
      })()
    : null;

  return { section, period, target, evaluations, averageScore, passRate, perAgent, perParameter, topImprovementArea };
}

interface IncomingAnswer {
  parameterId?: string;
  code?: string;
  answer?: string;
  comment?: string;
}

/** Validates answers for one section; throws a 400 error when incomplete/invalid. */
async function resolveAnswers(section: QcSection, incoming: IncomingAnswer[]) {
  const parameters = await prisma.qcParameter.findMany({ where: { active: true, section }, orderBy: { order: 'asc' } });
  const byId = new Map(parameters.map((p) => [p.id, p]));
  const byCode = new Map(parameters.map((p) => [p.code, p]));

  const answerByParam = new Map<string, { answer: QcAnswer; comment: string | null }>();
  for (const raw of incoming ?? []) {
    const param = (raw.parameterId && byId.get(raw.parameterId)) || (raw.code && byCode.get(raw.code));
    if (!param) continue;
    const answer = normalizeQcAnswer(raw.answer);
    if (!answer || !ANSWER_VALUES.includes(answer)) {
      const err = new Error(`Invalid answer for ${param.code}. Use Yes, No, or NA.`) as Error & { status?: number };
      err.status = 400;
      throw err;
    }
    answerByParam.set(param.id, { answer, comment: raw.comment ? String(raw.comment).slice(0, 1000) : null });
  }

  const missing = parameters.filter((p) => !answerByParam.has(p.id)).map((p) => p.code);
  if (missing.length) {
    const err = new Error(`All parameters must be answered. Missing: ${missing.join(', ')}.`) as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const answers: QcAnswer[] = [];
  const rows: { parameterId: string; answer: QcAnswer; comment: string | null }[] = [];
  let criticalFailed = false;
  for (const p of parameters) {
    const a = answerByParam.get(p.id)!;
    rows.push({ parameterId: p.id, answer: a.answer, comment: a.comment });
    answers.push(a.answer);
    if (p.critical && a.answer === 'NO') criticalFailed = true;
  }
  return { answers, rows, criticalFailed };
}

async function nextSrNo(section: QcSection, period: string): Promise<number> {
  const top = await prisma.callQcEvaluation.findFirst({ where: { period, kind: section }, orderBy: { srNo: 'desc' }, select: { srNo: true } });
  return (top?.srNo ?? 0) + 1;
}

/** Splits a per-section answer list into the (callAnswers, caseAnswers) tuple computeQcResult expects. */
function sectionTuple(section: QcSection, answers: QcAnswer[]): [QcAnswer[], QcAnswer[]] {
  return section === 'CALL' ? [answers, []] : [[], answers];
}

/** Builds a fully-wired Express router for one QC section. */
export function createQcRouter(section: QcSection): Router {
  const cfg = CONFIGS[section];
  const router = Router();

  // GET /parameters -> active parameters grouped by section (both, so pages can pick their own)
  router.get(
    '/parameters',
    asyncHandler(async (req, res) => {
      const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
      const where = includeInactive ? {} : { active: true };
      const parameters = await prisma.qcParameter.findMany({ where, orderBy: [{ section: 'asc' }, { order: 'asc' }] });
      const withSerial = <T extends { section: string }>(list: T[]) => list.map((p, i) => ({ ...p, serial: i + 1 }));
      res.json({
        call: withSerial(parameters.filter((p) => p.section === 'CALL')),
        case: withSerial(parameters.filter((p) => p.section === 'CASE')),
      });
    })
  );

  // GET /periods
  router.get(
    '/periods',
    asyncHandler(async (_req, res) => {
      const rows = await prisma.callQcEvaluation.findMany({ where: { kind: section }, distinct: ['period'], select: { period: true }, orderBy: { period: 'desc' } });
      res.json(rows.map((r) => r.period));
    })
  );

  // GET /trend -> avg overall adherence per period (last 12)
  router.get(
    '/trend',
    asyncHandler(async (_req, res) => {
      const evals = await prisma.callQcEvaluation.findMany({ where: { kind: section }, orderBy: { period: 'asc' } });
      const byPeriod = new Map<string, { sum: number; n: number }>();
      for (const ev of evals) {
        if (ev.overallAdherence === null) continue;
        const g = byPeriod.get(ev.period) ?? { sum: 0, n: 0 };
        g.sum += ev.overallAdherence;
        g.n++;
        byPeriod.set(ev.period, g);
      }
      const trend = [...byPeriod.entries()]
        .map(([period, g]) => ({ period, value: round2(g.sum / g.n) }))
        .sort((a, b) => a.period.localeCompare(b.period))
        .slice(-12);
      res.json(trend);
    })
  );

  // GET /export?period=YYYY-MM&ids=a,b
  router.get(
    '/export',
    asyncHandler(async (req, res) => {
      let period = req.query.period ? String(req.query.period) : null;
      if (!period) {
        const latest = await prisma.callQcEvaluation.findFirst({ where: { kind: section }, orderBy: { period: 'desc' } });
        period = latest?.period ?? null;
      }
      const parameters = await prisma.qcParameter.findMany({ where: { active: true, section }, orderBy: { order: 'asc' } });
      const idsParam = req.query.ids ? String(req.query.ids) : '';
      const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : null;
      const where = ids && ids.length ? { id: { in: ids }, kind: section } : period ? { period, kind: section } : null;
      const evals = where ? await prisma.callQcEvaluation.findMany({ where, include: evalInclude, orderBy: { srNo: 'asc' } }) : [];

      const fmt = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '');
      const label = (a?: string) => (a === 'YES' ? 'Yes' : a === 'NO' ? 'No' : a === 'NA' ? 'NA' : '');
      const person = (e: NonNullable<EvalWithRelations>) => (section === 'CALL' ? e.callHandledBy?.name : e.caseOwner?.name) ?? '';
      const sectionScore = (e: NonNullable<EvalWithRelations>) => (section === 'CALL' ? `${e.callScore}/${e.callMax}` : `${e.caseScore}/${e.caseMax}`);
      const sectionPct = (e: NonNullable<EvalWithRelations>) => (section === 'CALL' ? e.callAdherence : e.caseAdherence) ?? '';

      const rows = evals.map((e) => {
        const answerByParam = new Map(e.answers.map((a) => [a.parameterId, a.answer]));
        const row: Record<string, unknown> = {
          'Sr No': e.srNo ?? '',
          Product: e.product ?? '',
          'Case No': e.caseNo,
          'Call Date': fmt(e.callDateTime),
          'Ticket Created': fmt(e.ticketCreatedDateTime),
          'User Name': e.userName ?? '',
          [cfg.personLabel]: person(e),
          Analyst: e.analyst?.name ?? '',
        };
        for (const p of parameters) row[p.code] = label(answerByParam.get(p.id));
        row['Customer Escalation'] = e.customerEscalation ? 'Yes' : 'No';
        row['Score'] = sectionScore(e);
        row['Adherence %'] = sectionPct(e);
        row['Target'] = e.target;
        row['Result'] = e.passed ? 'Pass' : 'Fail';
        row['Critical Fail'] = e.answers.some((a) => a.parameter.critical && a.answer === 'NO') ? 'Yes' : '';
        row['Findings'] = e.findings ?? '';
        row['Action Plan'] = e.actionPlan ?? '';
        return row;
      });

      const headerKeys = [
        'Sr No', 'Product', 'Case No', 'Call Date', 'Ticket Created', 'User Name', cfg.personLabel, 'Analyst',
        ...parameters.map((p) => p.code),
        'Customer Escalation', 'Score', 'Adherence %', 'Target', 'Result', 'Critical Fail', 'Findings', 'Action Plan',
      ];
      const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([headerKeys]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, section === 'CALL' ? 'Call QC' : 'Case QC');

      const detailRows: Record<string, unknown>[] = [];
      for (const e of evals) {
        for (const a of [...e.answers].sort((x, y) => x.parameter.order - y.parameter.order)) {
          detailRows.push({
            'Case No': e.caseNo,
            Parameter: a.parameter.code,
            Critical: a.parameter.critical ? 'Yes' : '',
            Question: a.parameter.text,
            Answer: label(a.answer),
            Comment: a.comment ?? '',
          });
        }
      }
      const detailHeader = ['Case No', 'Parameter', 'Critical', 'Question', 'Answer', 'Comment'];
      const wsDetail = detailRows.length ? XLSX.utils.json_to_sheet(detailRows) : XLSX.utils.aoa_to_sheet([detailHeader]);
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Answers');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${cfg.slug}-${period ?? 'all'}.xlsx"`);
      res.send(buf);
    })
  );

  // GET /?period=YYYY-MM
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      let period = req.query.period ? String(req.query.period) : null;
      if (!period) {
        const latest = await prisma.callQcEvaluation.findFirst({ where: { kind: section }, orderBy: { period: 'desc' } });
        period = latest?.period ?? null;
      }
      res.json(await buildQcView(section, period));
    })
  );

  // POST / -> create
  router.post(
    '/',
    requireRole('Admin', 'Call QA Analyst'),
    asyncHandler(async (req, res) => {
      const b = req.body ?? {};
      const personId = b[cfg.personField];
      if (!b.caseNo || !personId) {
        return res.status(400).json({ error: `Case number and ${cfg.personLabel.toLowerCase()} are required.` });
      }
      const { answers, rows, criticalFailed } = await resolveAnswers(section, b.answers);
      const settings = await getSettings();
      const qc = section === 'CALL' ? settings.callQc : settings.caseQc;
      const [callAns, caseAns] = sectionTuple(section, answers);
      const result = computeQcResult(callAns, caseAns, qc.target, qc.pointsPerYes, criticalFailed);

      const callDate = b.callDateTime ? new Date(b.callDateTime) : new Date();
      const period = toPeriod(callDate);

      const created = await prisma.callQcEvaluation.create({
        data: {
          kind: section,
          srNo: await nextSrNo(section, period),
          product: b.product ? String(b.product).trim() : null,
          caseNo: String(b.caseNo).trim(),
          callDateTime: b.callDateTime ? callDate : null,
          ticketCreatedDateTime: b.ticketCreatedDateTime ? new Date(b.ticketCreatedDateTime) : null,
          userName: b.userName ? String(b.userName).trim() : null,
          callHandledById: section === 'CALL' ? personId : null,
          caseOwnerId: section === 'CASE' ? personId : null,
          analystId: b.analystId ?? null,
          customerEscalation: Boolean(b.customerEscalation),
          callScore: result.callSection.score,
          callMax: result.callSection.max,
          callAdherence: result.callSection.adherence,
          caseScore: result.caseSection.score,
          caseMax: result.caseSection.max,
          caseAdherence: result.caseSection.adherence,
          overallScore: result.overallScore,
          overallMax: result.overallMax,
          overallAdherence: result.overallAdherence,
          target: result.target,
          passed: result.passed,
          findings: b.findings ? String(b.findings) : null,
          actionPlan: b.actionPlan ? String(b.actionPlan) : null,
          period,
          answers: { create: rows },
        },
        include: evalInclude,
      });
      res.status(201).json(enrichEvaluation(created));
    })
  );

  // PATCH /:id -> edit header and/or answers (recomputes scores)
  router.patch(
    '/:id',
    requireRole('Admin', 'Call QA Analyst'),
    asyncHandler(async (req, res) => {
      const existing = await loadEvaluation(req.params.id);
      if (!existing || existing.kind !== section) return res.status(404).json({ error: 'Evaluation not found.' });
      const b = req.body ?? {};

      const incoming: IncomingAnswer[] = Array.isArray(b.answers)
        ? b.answers
        : existing.answers.map((a) => ({ parameterId: a.parameterId, answer: a.answer, comment: a.comment ?? undefined }));
      const { answers, rows, criticalFailed } = await resolveAnswers(section, incoming);

      const settings = await getSettings();
      const qc = section === 'CALL' ? settings.callQc : settings.caseQc;
      const [callAns, caseAns] = sectionTuple(section, answers);
      const result = computeQcResult(callAns, caseAns, qc.target, qc.pointsPerYes, criticalFailed);

      const callDate = b.callDateTime ? new Date(b.callDateTime) : existing.callDateTime ?? new Date();
      const period = toPeriod(callDate);

      const existingPersonId = section === 'CALL' ? existing.callHandledById : existing.caseOwnerId;
      const personId = b[cfg.personField] ?? existingPersonId;

      const updated = await prisma.$transaction(async (tx) => {
        await tx.callQcAnswer.deleteMany({ where: { evaluationId: existing.id } });
        return tx.callQcEvaluation.update({
          where: { id: existing.id },
          data: {
            product: b.product !== undefined ? (b.product ? String(b.product).trim() : null) : existing.product,
            caseNo: b.caseNo !== undefined ? String(b.caseNo).trim() : existing.caseNo,
            callDateTime: b.callDateTime !== undefined ? (b.callDateTime ? callDate : null) : existing.callDateTime,
            ticketCreatedDateTime:
              b.ticketCreatedDateTime !== undefined ? (b.ticketCreatedDateTime ? new Date(b.ticketCreatedDateTime) : null) : existing.ticketCreatedDateTime,
            userName: b.userName !== undefined ? (b.userName ? String(b.userName).trim() : null) : existing.userName,
            callHandledById: section === 'CALL' ? personId : null,
            caseOwnerId: section === 'CASE' ? personId : null,
            analystId: b.analystId !== undefined ? b.analystId : existing.analystId,
            customerEscalation: b.customerEscalation !== undefined ? Boolean(b.customerEscalation) : existing.customerEscalation,
            callScore: result.callSection.score,
            callMax: result.callSection.max,
            callAdherence: result.callSection.adherence,
            caseScore: result.caseSection.score,
            caseMax: result.caseSection.max,
            caseAdherence: result.caseSection.adherence,
            overallScore: result.overallScore,
            overallMax: result.overallMax,
            overallAdherence: result.overallAdherence,
            target: result.target,
            passed: result.passed,
            findings: b.findings !== undefined ? (b.findings ? String(b.findings) : null) : existing.findings,
            actionPlan: b.actionPlan !== undefined ? (b.actionPlan ? String(b.actionPlan) : null) : existing.actionPlan,
            period,
            answers: { create: rows },
          },
          include: evalInclude,
        });
      });
      res.json(enrichEvaluation(updated));
    })
  );

  // DELETE /:id
  router.delete(
    '/:id',
    requireRole('Admin', 'Call QA Analyst'),
    asyncHandler(async (req, res) => {
      const existing = await prisma.callQcEvaluation.findUnique({ where: { id: req.params.id }, select: { kind: true } });
      if (!existing || existing.kind !== section) return res.status(404).json({ error: 'Evaluation not found.' });
      await prisma.callQcEvaluation.delete({ where: { id: req.params.id } });
      res.status(204).end();
    })
  );

  // POST /upload (multipart field: file)
  router.post(
    '/upload',
    requireRole('Admin', 'Call QA Analyst'),
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const file = (req as unknown as { file?: { buffer: Buffer } }).file;
      if (!file) return res.status(400).json({ error: 'No file uploaded (form field "file").' });
      const rows = parseSheet(file.buffer);
      const settings = await getSettings();
      const qc = section === 'CALL' ? settings.callQc : settings.caseQc;
      const parameters = await prisma.qcParameter.findMany({ where: { active: true, section }, orderBy: { order: 'asc' } });
      const errors: { row: number; message: string }[] = [];
      let inserted = 0;

      for (let i = 0; i < rows.length; i++) {
        const rowNo = i + 2;
        const row = rows[i];
        const personName = getField(row, cfg.personColumns);
        const personEmail = getField(row, cfg.personEmailColumns);
        const caseNo = getField(row, ['Case No', 'Case Number', 'Case']);
        if (!caseNo) {
          errors.push({ row: rowNo, message: 'Missing case number.' });
          continue;
        }
        const person = await resolveEmployee(personName, personEmail);
        if (!person) {
          errors.push({ row: rowNo, message: `Could not resolve ${cfg.personLabel.toLowerCase()}.` });
          continue;
        }

        const answers: QcAnswer[] = [];
        const answerRows: { parameterId: string; answer: QcAnswer; comment: string | null }[] = [];
        let criticalFailed = false;
        for (const p of parameters) {
          const raw = getField(row, [p.code, p.text]);
          const answer = normalizeQcAnswer(raw) ?? 'NA';
          answerRows.push({ parameterId: p.id, answer, comment: null });
          answers.push(answer);
          if (p.critical && answer === 'NO') criticalFailed = true;
        }

        const [callAns, caseAns] = sectionTuple(section, answers);
        const result = computeQcResult(callAns, caseAns, qc.target, qc.pointsPerYes, criticalFailed);
        const callDate = toDate(getField(row, ['Call Date', 'Call Date & Time', 'Date'])) ?? new Date();
        const period = toPeriod(callDate);
        await prisma.callQcEvaluation.create({
          data: {
            kind: section,
            srNo: await nextSrNo(section, period),
            product: (getField(row, ['Product']) as string) ?? null,
            caseNo: String(caseNo).trim(),
            callDateTime: callDate,
            ticketCreatedDateTime: toDate(getField(row, ['Ticket Created Date', 'Ticket Created Date & Time'])),
            userName: (getField(row, ['User Name', 'User']) as string) ?? null,
            callHandledById: section === 'CALL' ? person.id : null,
            caseOwnerId: section === 'CASE' ? person.id : null,
            customerEscalation: normalizeQcAnswer(getField(row, ['Customer Escalation', 'Escalation'])) === 'YES',
            callScore: result.callSection.score,
            callMax: result.callSection.max,
            callAdherence: result.callSection.adherence,
            caseScore: result.caseSection.score,
            caseMax: result.caseSection.max,
            caseAdherence: result.caseSection.adherence,
            overallScore: result.overallScore,
            overallMax: result.overallMax,
            overallAdherence: result.overallAdherence,
            target: result.target,
            passed: result.passed,
            findings: (getField(row, ['Findings']) as string) ?? null,
            actionPlan: (getField(row, ['Action Plan']) as string) ?? null,
            period,
            answers: { create: answerRows },
          },
        });
        inserted++;
      }
      res.json({ inserted, errors, totalRows: rows.length });
    })
  );

  return router;
}
