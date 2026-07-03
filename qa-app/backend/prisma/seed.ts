import { PrismaClient } from '@prisma/client';
import { config } from '../src/config';
import {
  computeUtilizationPercent,
  computeQaTotal,
  computeCallQaTotal,
  maintenanceStatus,
  toPeriod,
} from '../src/lib/calc';

const prisma = new PrismaClient();

const CURRENT = '2026-07';
const PREVIOUS = '2026-06';

async function main() {
  // Reset (delete in FK-safe order) so the seed is idempotent.
  await prisma.callQAEvaluation.deleteMany();
  await prisma.maintenanceActivity.deleteMany();
  await prisma.qAScore.deleteMany();
  await prisma.qAReport.deleteMany();
  await prisma.kTTopic.deleteMany();
  await prisma.joinee.deleteMany();
  await prisma.timeUtilizationRecord.deleteMany();
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
      topics: { create: topicsA.map((t, i) => ({ topicName: t, status: i < 3 ? 'Completed' : 'Pending', completedDate: i < 3 ? new Date('2026-06-20T00:00:00') : null })) },
    },
  });
  const topicsB = ['Product Domain', 'Support Tooling', 'Escalation Matrix', 'KB Documentation'];
  await prisma.joinee.create({
    data: {
      name: 'Henry Osei',
      joinDate: new Date('2026-06-28T00:00:00'),
      team: 'Support',
      mentor: 'Faisal Khan',
      topics: { create: topicsB.map((t, i) => ({ topicName: t, status: i < 1 ? 'Completed' : 'Pending', completedDate: i < 1 ? new Date('2026-07-01T00:00:00') : null })) },
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

  // --- Call QA evaluations (current period) ---
  // [agent, ref, opening, info, deadAir, closing, caseSecs, closeSecs, deadAirIncidents, day]
  const calls: [typeof ana, string, number, number, number, number, number, number, number, number][] = [
    [cara, 'CALL-5001', 5, 5, 5, 5, 90, 40, 0, 2],
    [cara, 'CALL-5002', 4, 5, 4, 5, 110, 55, 1, 6],
    [dan, 'CALL-5003', 3, 3, 2, 4, 180, 80, 3, 4], // breaches both thresholds
    [dan, 'CALL-5004', 4, 3, 3, 3, 130, 50, 2, 9],
    [ben, 'CALL-5005', 5, 4, 4, 4, 100, 45, 1, 7],
    [faisal, 'CALL-5006', 4, 4, 3, 5, 140, 70, 2, 12], // breaches both thresholds
  ];
  for (const [agent, ref, opening, info, deadAir, closing, caseSecs, closeSecs, incidents, dayOffset] of calls) {
    const date = new Date(`${CURRENT}-${String(dayOffset).padStart(2, '0')}T15:00:00`);
    await prisma.callQAEvaluation.create({
      data: {
        employeeId: agent.id,
        callReference: ref,
        callDate: date,
        analystId: faisal.id,
        callOpeningScore: opening,
        infoCapturedScore: info,
        deadAirScore: deadAir,
        deadAirIncidents: incidents,
        callClosingScore: closing,
        caseCreationTimeSecs: caseSecs,
        caseCreationBreached: caseSecs > config.callQa.caseCreationThresholdSecs,
        callCloseTimeSecs: closeSecs,
        callCloseBreached: closeSecs > config.callQa.callCloseThresholdSecs,
        totalScore: computeCallQaTotal({ opening, info, deadAir, closing }, config.callQa),
        period: toPeriod(date),
        comments: null,
      },
    });
  }

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
