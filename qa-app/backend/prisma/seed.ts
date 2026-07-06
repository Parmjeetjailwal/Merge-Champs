import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { config } from '../src/config';
import {
  computeUtilizationPercent,
  computeQaTotal,
  computeQcResult,
  maintenanceStatus,
  toPeriod,
  type QcAnswer,
} from '../src/lib/calc';

const prisma = new PrismaClient();

const CURRENT = '2026-07';
const PREVIOUS = '2026-06';

async function main() {
  // Reset (delete in FK-safe order) so the seed is idempotent.
  await prisma.callQcAnswer.deleteMany();
  await prisma.callQcEvaluation.deleteMany();
  await prisma.qcParameter.deleteMany();
  await prisma.maintenanceActivity.deleteMany();
  await prisma.qAScore.deleteMany();
  await prisma.qAReport.deleteMany();
  await prisma.kTTopic.deleteMany();
  await prisma.joinee.deleteMany();
  await prisma.kTTemplateTopic.deleteMany();
  await prisma.kTTemplate.deleteMany();
  await prisma.timeUtilizationRecord.deleteMany();
  await prisma.user.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.employee.deleteMany();

  // --- Employees ---
  const employees = await Promise.all(
    [
      { name: 'Ana Sharma', email: 'ana@example.com', team: 'QA', role: 'Team Member' },
      { name: 'Ben Carter', email: 'ben@example.com', team: 'QA', role: 'Team Member' },
      { name: 'Cara Diaz', email: 'cara@example.com', team: 'Support', role: 'Team Member' },
      { name: 'Dan Lee', email: 'dan@example.com', team: 'Support', role: 'Team Member' },
      { name: 'Eva Novak', email: 'eva@example.com', team: 'QA', role: 'QA Lead' },
      { name: 'Faisal Khan', email: 'faisal@example.com', team: 'Support', role: 'Call QA Analyst' },
    ].map((data) => prisma.employee.create({ data }))
  );
  const [ana, ben, cara, dan, eva, faisal] = employees;

  // --- Time Utilization (current + previous period) ---
  const tu: Record<string, [typeof ana, number, number][]> = {
    [CURRENT]: [
      [cara, 160, 156], // top
      [ana, 160, 150],
      [eva, 160, 140],
      [ben, 160, 128],
      [faisal, 160, 112], // bottom-2
      [dan, 160, 96], // bottom-1
    ],
    [PREVIOUS]: [
      [ana, 160, 152],
      [ben, 160, 120],
      [cara, 160, 144],
      [dan, 160, 108],
      [eva, 160, 150],
      [faisal, 160, 100],
    ],
  };
  for (const [period, rows] of Object.entries(tu)) {
    for (const [emp, planned, actual] of rows) {
      await prisma.timeUtilizationRecord.create({
        data: {
          employeeId: emp.id,
          period,
          plannedHours: planned,
          actualHours: actual,
          utilizationPercent: computeUtilizationPercent(planned, actual),
          sourceFile: 'seed',
        },
      });
    }
  }

  // --- Jira Ticket QA scores (current period) ---
  const qaRows: [typeof ana, string, number, number][] = [
    [ana, 'PROJ-101', 5, 5],
    [ana, 'PROJ-102', 4, 5],
    [ben, 'PROJ-110', 3, 4],
    [ben, 'PROJ-111', 4, 3],
    [cara, 'PROJ-120', 5, 4],
    [cara, 'PROJ-121', 4, 4],
    [dan, 'PROJ-130', 2, 3],
    [dan, 'PROJ-131', 3, 2],
  ];
  let day = 2;
  for (const [emp, key, t, d] of qaRows) {
    const date = new Date(`${CURRENT}-${String(day++).padStart(2, '0')}T12:00:00`);
    await prisma.qAScore.create({
      data: {
        employeeId: emp.id,
        jiraTicketKey: key,
        timelinessScore: t,
        documentationScore: d,
        totalScore: computeQaTotal(t, d, config.qa),
        evaluationDate: date,
        period: toPeriod(date),
        evaluatorId: eva.id,
        comments: null,
      },
    });
  }

  // --- New Joinee KT tracker ---
  const topicsA = ['Codebase Overview', 'CI/CD Pipeline', 'Ticketing Workflow', 'On-call Process', 'Release Process'];
  const joineeA = await prisma.joinee.create({
    data: {
      name: 'Grace Miller',
      joinDate: new Date('2026-06-15T00:00:00'),
      team: 'QA',
      mentor: 'Eva Novak',
      topics: { create: topicsA.map((t, i) => ({ topicName: t, status: i < 3 ? 'Completed' : 'Pending', completedDate: i < 3 ? new Date('2026-06-20T00:00:00') : null, targetDate: i < 3 ? null : new Date(i === 3 ? '2026-06-25T00:00:00' : '2026-07-20T00:00:00') })) },
    },
  });
  const topicsB = ['Product Domain', 'Support Tooling', 'Escalation Matrix', 'KB Documentation'];
  await prisma.joinee.create({
    data: {
      name: 'Henry Osei',
      joinDate: new Date('2026-06-28T00:00:00'),
      team: 'Support',
      mentor: 'Faisal Khan',
      topics: { create: topicsB.map((t, i) => ({ topicName: t, status: i < 1 ? 'Completed' : 'Pending', completedDate: i < 1 ? new Date('2026-07-01T00:00:00') : null, targetDate: i < 1 ? null : new Date(i === 1 ? '2026-06-30T00:00:00' : '2026-07-25T00:00:00') })) },
    },
  });
  void joineeA;

  // --- Maintenance activities (current period) ---
  // [title, employee, scheduledMins, actualMins, dayOffset]
  const maint: [string, typeof ana, number, number, number][] = [
    ['DB index rebuild', ana, 60, 55, 2],
    ['Log rotation cleanup', ana, 30, 30, 5],
    ['Cache node patching', ana, 45, 40, 9],
    ['Certificate renewal', ben, 60, 95, 6], // exceeded
    ['Queue worker restart', cara, 30, 25, 7],
    ['Storage expansion', dan, 90, 150, 11], // exceeded
    ['Security patch rollout', eva, 60, 60, 14],
  ];
  for (const [title, emp, schedMins, actMins, dayOffset] of maint) {
    const ss = new Date(`${CURRENT}-${String(dayOffset).padStart(2, '0')}T22:00:00`);
    const se = new Date(ss.getTime() + schedMins * 60000);
    const as = new Date(ss.getTime());
    const ae = new Date(as.getTime() + actMins * 60000);
    const { status, exceededByMinutes } = maintenanceStatus(ss, se, as, ae);
    await prisma.maintenanceActivity.create({
      data: {
        title,
        employeeId: emp.id,
        scheduledStart: ss,
        scheduledEnd: se,
        actualStart: as,
        actualEnd: ae,
        status,
        exceededByMinutes,
        month: toPeriod(ss),
      },
    });
  }

  // --- Call & Case QC parameters (reference data) ---
  const CALL_PARAMS = [
    'All call scripts followed?',
    'Agent able to understand & paraphrase / narrow down the issue?',
    'Site ID / IP address captured?',
    'Multiple repetition of issue, IDs, etc. avoided?',
    'Call back number captured?',
    'Dead Air (more than 5 secs) at the beginning or in between the call?',
    'Case is created in due time & case number given to user over call?',
  ];
  const CASE_PARAMS = [
    'Issue Subject & Description detailing is enough?',
    'First Public Ownership comment made in accepted time?',
    'Case Record Type Tagging',
    'Case Priority Tagging',
    'Related Case Tagging (for integrated servers)',
    'System Uptime tagging (for system-down cases)',
    'System or Server Profile Tagging',
    'Functional Area tagging is correct?',
    'L2 Escalation - all details passed on & L2 tagging is done in the case?',
    'JIRA / Escalation Tagging',
    'Case activities and comments updated regularly?',
    'Problem classification, Follow-up classification & Case closure details are updated?',
    'Case status is correct?',
  ];
  // Critical (auto-fail) parameters: a "No" here fails the whole QC regardless of %.
  const CRITICAL_CODES = new Set(['QC5', 'QC7', 'QC20']);
  let paramOrder = 1;
  const paramData = [
    ...CALL_PARAMS.map((text) => ({ code: `QC${paramOrder}`, section: 'CALL', text, order: paramOrder, critical: CRITICAL_CODES.has(`QC${paramOrder++}`) })),
    ...CASE_PARAMS.map((text) => ({ code: `QC${paramOrder}`, section: 'CASE', text, order: paramOrder, critical: CRITICAL_CODES.has(`QC${paramOrder++}`) })),
  ];
  await prisma.qcParameter.createMany({ data: paramData });
  const paramRows = await prisma.qcParameter.findMany({ orderBy: { order: 'asc' } });
  const callParams = paramRows.filter((p) => p.section === 'CALL');
  const caseParams = paramRows.filter((p) => p.section === 'CASE');

  // --- Call & Case QC evaluations (current + previous period) ---
  // mk(length, noIdx, naIdx) -> answers defaulting to YES, with NO/NA at the given indices.
  const mk = (length: number, no: number[] = [], na: number[] = []): QcAnswer[] =>
    Array.from({ length }, (_, i) => (no.includes(i) ? 'NO' : na.includes(i) ? 'NA' : 'YES'));

  const qcEvals: {
    product: string;
    caseNo: string;
    day: number;
    period: string;
    handler: typeof ana;
    owner: typeof ana;
    call: QcAnswer[];
    case: QcAnswer[];
    escalation: boolean;
    findings?: string;
    actionPlan?: string;
  }[] = [
    { product: 'VNA', caseNo: '12470153', day: 3, period: CURRENT, handler: cara, owner: dan, call: mk(7), case: mk(13, [], [4, 9]), escalation: false },
    { product: 'PACS', caseNo: '12470199', day: 6, period: CURRENT, handler: dan, owner: cara, call: mk(7, [5]), case: mk(13, [7], [4]), escalation: true, findings: 'Dead air observed mid-call.', actionPlan: 'Coach on hold etiquette.' },
    { product: 'VNA', caseNo: '12470222', day: 9, period: CURRENT, handler: ben, owner: ana, call: mk(7, [], [2]), case: mk(13, [10]), escalation: false },
    { product: 'PACS', caseNo: '12470240', day: 12, period: CURRENT, handler: faisal, owner: ben, call: mk(7), case: mk(13), escalation: false },
    { product: 'VNA', caseNo: '12470301', day: 14, period: CURRENT, handler: ana, owner: cara, call: mk(7, [6]), case: mk(13), escalation: true, findings: 'Case not created in due time (critical breach).', actionPlan: 'Immediate coaching; re-audit next week.' },
    { product: 'VNA', caseNo: '12460101', day: 5, period: PREVIOUS, handler: cara, owner: dan, call: mk(7), case: mk(13, [], [4, 9, 11]), escalation: false },
    { product: 'PACS', caseNo: '12460155', day: 8, period: PREVIOUS, handler: dan, owner: ben, call: mk(7, [1, 5]), case: mk(13, [7, 10]), escalation: true, findings: 'Multiple documentation gaps.', actionPlan: 'Re-training scheduled.' },
  ];
  const srCounter: Record<string, number> = {};
  for (const ev of qcEvals) {
    const date = new Date(`${ev.period}-${String(ev.day).padStart(2, '0')}T15:00:00`);
    const criticalFailed =
      callParams.some((p, i) => p.critical && ev.call[i] === 'NO') ||
      caseParams.some((p, i) => p.critical && ev.case[i] === 'NO');
    const result = computeQcResult(ev.call, ev.case, config.callQc.target, config.callQc.pointsPerYes, criticalFailed);
    srCounter[ev.period] = (srCounter[ev.period] ?? 0) + 1;
    await prisma.callQcEvaluation.create({
      data: {
        srNo: srCounter[ev.period],
        product: ev.product,
        caseNo: ev.caseNo,
        callDateTime: date,
        ticketCreatedDateTime: new Date(date.getTime() + 11 * 60000),
        userName: 'Sample User',
        callHandledById: ev.handler.id,
        caseOwnerId: ev.owner.id,
        analystId: faisal.id,
        customerEscalation: ev.escalation,
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
        findings: ev.findings ?? null,
        actionPlan: ev.actionPlan ?? null,
        period: ev.period,
        answers: {
          create: [
            ...callParams.map((p, i) => ({ parameterId: p.id, answer: ev.call[i], comment: null })),
            ...caseParams.map((p, i) => ({ parameterId: p.id, answer: ev.case[i], comment: null })),
          ],
        },
      },
    });
  }

  // --- Users (for JWT login) ---
  const hash = (p: string) => bcrypt.hashSync(p, 10);
  await prisma.user.createMany({
    data: [
      { email: 'admin@example.com', passwordHash: hash('admin123'), role: 'Admin' },
      { email: 'qalead@example.com', passwordHash: hash('qalead123'), role: 'QA Lead' },
      { email: 'analyst@example.com', passwordHash: hash('analyst123'), role: 'Call QA Analyst' },
      { email: 'member@example.com', passwordHash: hash('member123'), role: 'Team Member' },
    ],
  });

  // --- KT template ---
  await prisma.kTTemplate.create({
    data: {
      name: 'Standard QA Onboarding',
      team: 'QA',
      topics: {
        create: ['Codebase Overview', 'CI/CD Pipeline', 'Ticketing Workflow', 'Release Process', 'On-call Process'].map(
          (t) => ({ topicName: t })
        ),
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log('Seed complete:', {
    employees: employees.length,
    period: CURRENT,
  });
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
