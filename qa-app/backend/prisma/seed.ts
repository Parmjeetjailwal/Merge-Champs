import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { config } from '../src/config';
import {
  computeUtilizationPercent,
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
  await prisma.joineeAccess.deleteMany();
  await prisma.kTTopic.deleteMany();
  await prisma.joinee.deleteMany();
  await prisma.accessItem.deleteMany();
  await prisma.project.deleteMany();
  await prisma.kTTemplateTopic.deleteMany();
  await prisma.kTTemplate.deleteMany();
  await prisma.timeUtilizationRecord.deleteMany();
  await prisma.user.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.navSection.deleteMany();
  await prisma.employee.deleteMany();

  // --- Navigation sections (data-driven; RBAC via allowedRoles, empty = all roles) ---
  await prisma.navSection.createMany({
    data: [
      { key: 'dashboard', label: 'Dashboard', path: '/', icon: 'LayoutDashboard', order: 0, allowedRoles: '' },
      { key: 'time-utilization', label: 'Time Utilization', path: '/time-utilization', icon: 'Clock', order: 1, allowedRoles: 'QA Lead,Time Analyst' },
      { key: 'call-qa', label: 'Call QA', path: '/call-qa', icon: 'PhoneCall', order: 2, allowedRoles: 'QA Lead,Call QA Analyst' },
      { key: 'case-qa', label: 'Case QA', path: '/case-qa', icon: 'ClipboardCheck', order: 3, allowedRoles: 'QA Lead,Call QA Analyst' },
      { key: 'kt', label: 'KT OPS', path: '/kt', icon: 'GraduationCap', order: 4, allowedRoles: 'QA Lead,Trainee' },
      { key: 'maintenance', label: 'Maintenance', path: '/maintenance', icon: 'Wrench', order: 5, allowedRoles: 'Maintenance' },
      { key: 'settings', label: 'Settings', path: '/settings', icon: 'Settings', order: 6, adminOnly: true },
      { key: 'users', label: 'Users', path: '/users', icon: 'Users', order: 7, adminOnly: true },
    ],
  });

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

  // --- Additional bulk employees (deterministic dummy data; ~50 total) ---
  const FIRST_NAMES = [
    'Aarav', 'Isha', 'Liam', 'Noah', 'Olivia', 'Emma', 'Sofia', 'Mateo', 'Yuki', 'Wei',
    'Priya', 'Omar', 'Zara', 'Diego', 'Nina', 'Ivan', 'Leah', 'Kai', 'Maya', 'Ravi',
    'Elena', 'Hugo', 'Aisha', 'Tom', 'Lucia', 'Sven', 'Mei', 'Arjun', 'Fatima', 'Pablo',
  ];
  const LAST_NAMES = [
    'Patel', 'Singh', 'Garcia', 'Kim', 'Chen', 'Ali', 'Brown', 'Nguyen', 'Rossi', 'Kowalski',
    'Silva', 'Haddad', 'Ivanov', 'Suzuki', 'Dubois', 'Meyer', 'Popov', 'Andersson', 'Costa', 'Reyes',
    'Okafor', 'Fischer', 'Novak', 'Marino', 'Bauer', 'Torres', 'Yamamoto', 'Cohen', 'Mensah', 'Larsen',
  ];
  const EXTRA_TEAMS = ['QA', 'Support', 'CloudOps', 'Infra'];
  const extraSpecs = Array.from({ length: 44 }, (_, i) => {
    const first = FIRST_NAMES[i % FIRST_NAMES.length];
    const last = LAST_NAMES[(i * 5) % LAST_NAMES.length];
    const team = EXTRA_TEAMS[i % EXTRA_TEAMS.length];
    let role = 'Team Member';
    if (i % 11 === 0) role = 'QA Lead';
    else if (i % 7 === 0) role = 'Call QA Analyst';
    else if (i % 9 === 0) role = 'Maintenance';
    else if (i % 13 === 0) role = 'Time Analyst';
    return {
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${i + 1}@example.com`,
      team,
      role,
    };
  });
  const extraEmployees = await Promise.all(extraSpecs.map((data) => prisma.employee.create({ data })));
  const allEmployees = [...employees, ...extraEmployees];

  // Small deterministic PRNG so the generated metrics are reproducible across seeds.
  let _seed = 987654321;
  const rand = () => ((_seed = (_seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

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

  // Bulk time utilization for the additional employees (both periods).
  for (const emp of extraEmployees) {
    for (const period of [CURRENT, PREVIOUS]) {
      const planned = 160;
      const actual = randInt(88, 160);
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

  // --- KT OPS: project access lists (CloudOps, VNA, PACS) ---
  const accessLists: { key: string; name: string; items: string[] }[] = [
    {
      key: 'CLOUDOPS',
      name: 'CloudOps',
      items: ['JIRA', 'VPN', 'Qualis', 'Azure', 'mCloud ID', 'GitHub', 'SecureLink', 'Jumpboxes', 'PagerDuty'],
    },
    { key: 'VNA', name: 'VNA', items: ['SecureLink', 'Support JIRA', 'Salesforce', 'VPN'] },
    { key: 'PACS', name: 'PACS', items: ['SecureLink', 'Support JIRA', 'Salesforce', 'VPN'] },
  ];
  for (let p = 0; p < accessLists.length; p++) {
    const { key, name, items } = accessLists[p];
    // De-duplicate access names per project, preserving order.
    const unique = [...new Set(items)];
    await prisma.project.create({
      data: {
        key,
        name,
        order: p,
        accessItems: { create: unique.map((itemName, i) => ({ name: itemName, order: i })) },
      },
    });
  }

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

  // Bulk maintenance activities for roughly half of the additional employees.
  const MAINT_TITLES = [
    'Node reboot', 'Patch rollout', 'Backup verification', 'Index rebuild',
    'Cache flush', 'Cert rotation', 'Log cleanup', 'Failover drill',
  ];
  for (let m = 0; m < extraEmployees.length; m++) {
    if (m % 2 !== 0) continue;
    const emp = extraEmployees[m];
    const title = MAINT_TITLES[m % MAINT_TITLES.length];
    const schedMins = randInt(30, 90);
    const actMins = Math.max(5, schedMins + (rand() < 0.3 ? randInt(10, 60) : randInt(-5, 5)));
    const day = (m % 27) + 1;
    const ss = new Date(`${CURRENT}-${String(day).padStart(2, '0')}T22:00:00`);
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

  // Bulk Call & Case QC evaluations across the additional employees (both periods).
  const PRODUCTS = ['VNA', 'PACS'];
  let caseSeq = 12480000;
  for (let i = 0; i < extraEmployees.length; i++) {
    const handler = extraEmployees[i];
    const owner = extraEmployees[(i + 3) % extraEmployees.length];
    for (const period of [CURRENT, PREVIOUS]) {
      const noCall = rand() < 0.35 ? [randInt(0, 6)] : [];
      const noCase = rand() < 0.3 ? [randInt(0, 12)] : [];
      const naCase = rand() < 0.5 ? [randInt(0, 12)] : [];
      qcEvals.push({
        product: PRODUCTS[i % PRODUCTS.length],
        caseNo: String(caseSeq++),
        day: (i % 27) + 1,
        period,
        handler,
        owner,
        call: mk(7, noCall),
        case: mk(13, noCase, naCase),
        escalation: rand() < 0.2,
      });
    }
  }

  const srCounter: Record<string, number> = {};
  const nextSr = (period: string, kind: string) => {
    const key = `${kind}:${period}`;
    srCounter[key] = (srCounter[key] ?? 0) + 1;
    return srCounter[key];
  };
  for (const ev of qcEvals) {
    const date = new Date(`${ev.period}-${String(ev.day).padStart(2, '0')}T15:00:00`);
    const ticket = new Date(date.getTime() + 11 * 60000);

    // Call QA evaluation — call-handling params, attributed to the call handler.
    const callCritical = callParams.some((p, i) => p.critical && ev.call[i] === 'NO');
    const callResult = computeQcResult(ev.call, [], config.callQc.target, config.callQc.pointsPerYes, callCritical);
    await prisma.callQcEvaluation.create({
      data: {
        kind: 'CALL',
        srNo: nextSr(ev.period, 'CALL'),
        product: ev.product,
        caseNo: ev.caseNo,
        callDateTime: date,
        ticketCreatedDateTime: ticket,
        userName: 'Sample User',
        callHandledById: ev.handler.id,
        caseOwnerId: null,
        analystId: faisal.id,
        customerEscalation: ev.escalation,
        callScore: callResult.callSection.score,
        callMax: callResult.callSection.max,
        callAdherence: callResult.callSection.adherence,
        caseScore: callResult.caseSection.score,
        caseMax: callResult.caseSection.max,
        caseAdherence: callResult.caseSection.adherence,
        overallScore: callResult.overallScore,
        overallMax: callResult.overallMax,
        overallAdherence: callResult.overallAdherence,
        target: callResult.target,
        passed: callResult.passed,
        findings: ev.findings ?? null,
        actionPlan: ev.actionPlan ?? null,
        period: ev.period,
        answers: { create: callParams.map((p, i) => ({ parameterId: p.id, answer: ev.call[i], comment: null })) },
      },
    });

    // Case QA evaluation — case-handling params, attributed to the case owner.
    const caseCritical = caseParams.some((p, i) => p.critical && ev.case[i] === 'NO');
    const caseResult = computeQcResult([], ev.case, config.caseQc.target, config.caseQc.pointsPerYes, caseCritical);
    await prisma.callQcEvaluation.create({
      data: {
        kind: 'CASE',
        srNo: nextSr(ev.period, 'CASE'),
        product: ev.product,
        caseNo: ev.caseNo,
        callDateTime: date,
        ticketCreatedDateTime: ticket,
        userName: 'Sample User',
        callHandledById: null,
        caseOwnerId: ev.owner.id,
        analystId: faisal.id,
        customerEscalation: ev.escalation,
        callScore: caseResult.callSection.score,
        callMax: caseResult.callSection.max,
        callAdherence: caseResult.callSection.adherence,
        caseScore: caseResult.caseSection.score,
        caseMax: caseResult.caseSection.max,
        caseAdherence: caseResult.caseSection.adherence,
        overallScore: caseResult.overallScore,
        overallMax: caseResult.overallMax,
        overallAdherence: caseResult.overallAdherence,
        target: caseResult.target,
        passed: caseResult.passed,
        findings: ev.findings ?? null,
        actionPlan: ev.actionPlan ?? null,
        period: ev.period,
        answers: { create: caseParams.map((p, i) => ({ parameterId: p.id, answer: ev.case[i], comment: null })) },
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
      { email: 'maintenance@example.com', passwordHash: hash('maint123'), role: 'Maintenance' },
      { email: 'time@example.com', passwordHash: hash('time123'), role: 'Time Analyst' },
      { email: 'trainee@example.com', passwordHash: hash('trainee123'), role: 'Trainee' },
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
    employees: allEmployees.length,
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
