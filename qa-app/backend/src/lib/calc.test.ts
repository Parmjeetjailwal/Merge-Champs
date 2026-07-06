import { describe, it, expect } from 'vitest';
import {
  computeUtilizationPercent,
  computeQaTotal,
  scoreQcSection,
  computeQcResult,
  normalizeQcAnswer,
  maintenanceStatus,
  pickN,
  topByCount,
  toPeriod,
} from './calc';

describe('computeUtilizationPercent', () => {
  it('computes (actual / planned) * 100', () => {
    expect(computeUtilizationPercent(160, 120)).toBe(75);
    expect(computeUtilizationPercent(100, 92)).toBe(92);
  });
  it('returns 0 for non-positive planned hours', () => {
    expect(computeUtilizationPercent(0, 10)).toBe(0);
    expect(computeUtilizationPercent(-5, 10)).toBe(0);
  });
});

describe('computeQaTotal', () => {
  const w = { scaleMax: 5, timeliness: 0.5, documentation: 0.5 };
  it('maps full marks to 100', () => {
    expect(computeQaTotal(5, 5, w)).toBe(100);
  });
  it('applies weighting', () => {
    // timeliness 4/5=0.8 *0.5 + documentation 5/5=1 *0.5 => (0.4+0.5)*100 = 90
    expect(computeQaTotal(4, 5, w)).toBe(90);
  });
  it('honours custom weights', () => {
    const custom = { scaleMax: 5, timeliness: 0.7, documentation: 0.3 };
    // 5/5*0.7 + 0/5*0.3 => 70
    expect(computeQaTotal(5, 0, custom)).toBe(70);
  });
});

describe('scoreQcSection', () => {
  it('scores Yes as full marks and No as zero, excluding NA', () => {
    const r = scoreQcSection(['YES', 'YES', 'NO', 'NA']);
    expect(r.yes).toBe(2);
    expect(r.no).toBe(1);
    expect(r.na).toBe(1);
    expect(r.applicable).toBe(3);
    expect(r.score).toBe(6); // 2 * 3
    expect(r.max).toBe(9); // 3 * 3
    expect(r.adherence).toBe(66.67);
  });
  it('returns null adherence when every parameter is NA', () => {
    const r = scoreQcSection(['NA', 'NA']);
    expect(r.applicable).toBe(0);
    expect(r.adherence).toBeNull();
  });
  it('gives 100% when all applicable answers are Yes', () => {
    expect(scoreQcSection(['YES', 'YES', 'NA']).adherence).toBe(100);
  });
});

describe('computeQcResult', () => {
  it('combines sections and passes at or above target', () => {
    const call = ['YES', 'YES', 'YES', 'YES', 'YES', 'YES', 'YES'] as const; // 7 yes -> 21/21
    const kase = ['YES', 'YES', 'YES', 'YES', 'YES', 'YES', 'YES', 'YES', 'YES', 'YES', 'YES', 'YES', 'NO'] as const; // 12/13
    const r = computeQcResult([...call], [...kase], 95);
    expect(r.callSection.adherence).toBe(100);
    expect(r.overallScore).toBe(21 + 36); // 12*3
    expect(r.overallMax).toBe(21 + 39);
    expect(r.overallAdherence).toBe(95); // 57/60
    expect(r.passed).toBe(true);
  });
  it('fails below target and excludes NA from the maximum', () => {
    const r = computeQcResult(['YES', 'NO'], ['YES', 'NA'], 95);
    // call 3/6, case 3/3 => 6/9 = 66.67
    expect(r.overallAdherence).toBe(66.67);
    expect(r.passed).toBe(false);
  });
  it('returns null overall adherence when nothing is applicable', () => {
    const r = computeQcResult(['NA'], ['NA'], 95);
    expect(r.overallAdherence).toBeNull();
    expect(r.passed).toBe(false);
  });
  it('auto-fails when a critical parameter fails, even at 100%', () => {
    const call = ['YES', 'YES', 'YES', 'YES', 'YES', 'YES', 'YES'];
    const kase = Array(13).fill('YES') as ('YES' | 'NO' | 'NA')[];
    const clean = computeQcResult([...call] as ('YES' | 'NO' | 'NA')[], kase, 95, 3, false);
    expect(clean.overallAdherence).toBe(100);
    expect(clean.passed).toBe(true);
    const critical = computeQcResult([...call] as ('YES' | 'NO' | 'NA')[], kase, 95, 3, true);
    expect(critical.overallAdherence).toBe(100);
    expect(critical.criticalFailed).toBe(true);
    expect(critical.passed).toBe(false);
  });
});

describe('normalizeQcAnswer', () => {
  it('maps workbook and friendly values', () => {
    expect(normalizeQcAnswer('3')).toBe('YES');
    expect(normalizeQcAnswer('Yes')).toBe('YES');
    expect(normalizeQcAnswer('0')).toBe('NO');
    expect(normalizeQcAnswer('No')).toBe('NO');
    expect(normalizeQcAnswer('NA')).toBe('NA');
    expect(normalizeQcAnswer('n/a')).toBe('NA');
  });
  it('returns null for blanks and unknown values', () => {
    expect(normalizeQcAnswer('')).toBeNull();
    expect(normalizeQcAnswer('maybe')).toBeNull();
    expect(normalizeQcAnswer(undefined)).toBeNull();
  });
});

describe('maintenanceStatus', () => {
  it('flags WithinTime when actual <= scheduled', () => {
    const r = maintenanceStatus(
      new Date('2026-07-01T10:00:00'),
      new Date('2026-07-01T11:00:00'),
      new Date('2026-07-01T10:00:00'),
      new Date('2026-07-01T10:45:00')
    );
    expect(r.status).toBe('WithinTime');
    expect(r.exceededByMinutes).toBe(0);
  });
  it('flags Exceeded and reports overrun minutes', () => {
    const r = maintenanceStatus(
      new Date('2026-07-01T10:00:00'),
      new Date('2026-07-01T11:00:00'),
      new Date('2026-07-01T10:00:00'),
      new Date('2026-07-01T11:30:00')
    );
    expect(r.status).toBe('Exceeded');
    expect(r.exceededByMinutes).toBe(30);
  });
});

describe('pickN / topByCount', () => {
  const rows = [
    { name: 'Ana', v: 90 },
    { name: 'Ben', v: 60 },
    { name: 'Cid', v: 90 },
    { name: 'Dan', v: 40 },
  ];
  it('returns top 2 descending with deterministic tie-break', () => {
    const top = pickN(rows, (r) => r.v, 2, 'desc', (r) => r.name);
    expect(top.map((r) => r.name)).toEqual(['Ana', 'Cid']);
  });
  it('returns bottom 2 ascending', () => {
    const bottom = pickN(rows, (r) => r.v, 2, 'asc', (r) => r.name);
    expect(bottom.map((r) => r.name)).toEqual(['Dan', 'Ben']);
  });
  it('topByCount picks the max, ties by name', () => {
    const top = topByCount([
      { employeeId: '1', name: 'Zoe', count: 3 },
      { employeeId: '2', name: 'Amy', count: 3 },
      { employeeId: '3', name: 'Kim', count: 1 },
    ]);
    expect(top?.name).toBe('Amy');
  });
});

describe('toPeriod', () => {
  it('formats YYYY-MM with zero padding', () => {
    expect(toPeriod(new Date('2026-07-03T00:00:00'))).toBe('2026-07');
    expect(toPeriod(new Date('2026-01-15T00:00:00'))).toBe('2026-01');
  });
});
