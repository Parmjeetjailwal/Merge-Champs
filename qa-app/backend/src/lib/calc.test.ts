import { describe, it, expect } from 'vitest';
import {
  computeUtilizationPercent,
  computeQaTotal,
  computeCallQaTotal,
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

describe('computeCallQaTotal', () => {
  const w = { scaleMax: 5, opening: 0.25, info: 0.25, deadAir: 0.25, closing: 0.25 };
  it('maps full marks to 100', () => {
    expect(computeCallQaTotal({ opening: 5, info: 5, deadAir: 5, closing: 5 }, w)).toBe(100);
  });
  it('averages equally weighted params', () => {
    // (1 + 0.8 + 0.6 + 1) / 4 * 100 = 85
    expect(computeCallQaTotal({ opening: 5, info: 4, deadAir: 3, closing: 5 }, w)).toBe(85);
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
