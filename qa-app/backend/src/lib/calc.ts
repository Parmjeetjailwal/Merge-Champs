// Pure calculation & aggregation helpers. Kept side-effect free so they can be unit tested.

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function diffMinutes(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 60000;
}

/** Utilization % = (actual / planned) * 100. Returns 0 when planned <= 0. */
export function computeUtilizationPercent(plannedHours: number, actualHours: number): number {
  if (!plannedHours || plannedHours <= 0) return 0;
  return round2((actualHours / plannedHours) * 100);
}

export interface QaWeights {
  scaleMax: number;
  timeliness: number;
  documentation: number;
}

/** Combines timeliness + documentation (each 0..scaleMax) into a weighted 0..100 total. */
export function computeQaTotal(timeliness: number, documentation: number, w: QaWeights): number {
  const t = clamp(timeliness, 0, w.scaleMax) / w.scaleMax;
  const d = clamp(documentation, 0, w.scaleMax) / w.scaleMax;
  return round2((t * w.timeliness + d * w.documentation) * 100);
}

export interface CallQaScores {
  opening: number;
  info: number;
  deadAir: number;
  closing: number;
}

export interface CallQaWeights {
  scaleMax: number;
  opening: number;
  info: number;
  deadAir: number;
  closing: number;
}

/** Combines the four call-quality parameters (each 0..scaleMax) into a weighted 0..100 total. */
export function computeCallQaTotal(s: CallQaScores, w: CallQaWeights): number {
  const n = (x: number) => clamp(x, 0, w.scaleMax) / w.scaleMax;
  return round2(
    (n(s.opening) * w.opening +
      n(s.info) * w.info +
      n(s.deadAir) * w.deadAir +
      n(s.closing) * w.closing) *
      100
  );
}

export interface MaintenanceStatusResult {
  status: 'WithinTime' | 'Exceeded';
  exceededByMinutes: number;
  scheduledMinutes: number;
  actualMinutes: number;
}

/** Determines whether a maintenance activity stayed within its scheduled duration. */
export function maintenanceStatus(
  scheduledStart: Date,
  scheduledEnd: Date,
  actualStart: Date,
  actualEnd: Date
): MaintenanceStatusResult {
  const scheduledMinutes = diffMinutes(scheduledStart, scheduledEnd);
  const actualMinutes = diffMinutes(actualStart, actualEnd);
  const exceededByMinutes = Math.max(0, Math.round(actualMinutes - scheduledMinutes));
  return {
    status: actualMinutes > scheduledMinutes ? 'Exceeded' : 'WithinTime',
    exceededByMinutes,
    scheduledMinutes,
    actualMinutes,
  };
}

/** Deterministic top/bottom N by a numeric key, ties broken by a stable label. */
export function pickN<T>(
  items: T[],
  key: (t: T) => number,
  n: number,
  dir: 'asc' | 'desc',
  tie: (t: T) => string
): T[] {
  return [...items]
    .sort((a, b) => {
      const diff = dir === 'desc' ? key(b) - key(a) : key(a) - key(b);
      if (diff !== 0) return diff;
      return tie(a).localeCompare(tie(b));
    })
    .slice(0, n);
}

export interface CountedMember {
  employeeId: string;
  name: string;
  count: number;
}

/** Returns the member(s) with the highest activity count. Ties resolved by name. */
export function topByCount(members: CountedMember[]): CountedMember | null {
  if (members.length === 0) return null;
  return pickN(members, (m) => m.count, 1, 'desc', (m) => m.name)[0];
}

/** Converts a Date to a YYYY-MM period string (UTC-safe on the year/month parts). */
export function toPeriod(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
