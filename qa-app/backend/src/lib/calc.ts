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

// --- Call & Case QC scorecard -------------------------------------------------
// Each parameter is answered Yes / No / NA. Yes earns full points, No earns zero,
// NA is excluded from both the score and the maximum. Mirrors the Call_QC.xlsx
// 0 / 3 / NA dropdown model.

export type QcAnswer = 'YES' | 'NO' | 'NA';

/** Points a "Yes" answer is worth (matches the workbook's 3-point scale). */
export const QC_POINTS_PER_YES = 3;

export interface QcSectionResult {
  yes: number;
  no: number;
  na: number;
  applicable: number; // yes + no (NA excluded)
  score: number; // points earned
  max: number; // max attainable points
  adherence: number | null; // percent, null when nothing is applicable
}

/** Scores one section (Call Handling or Case Handling) from its answers. */
export function scoreQcSection(answers: QcAnswer[], pointsPerYes: number = QC_POINTS_PER_YES): QcSectionResult {
  let yes = 0;
  let no = 0;
  let na = 0;
  for (const a of answers) {
    if (a === 'YES') yes++;
    else if (a === 'NO') no++;
    else na++;
  }
  const applicable = yes + no;
  const score = yes * pointsPerYes;
  const max = applicable * pointsPerYes;
  const adherence = applicable === 0 ? null : round2((score / max) * 100);
  return { yes, no, na, applicable, score, max, adherence };
}

export interface QcResult {
  callSection: QcSectionResult;
  caseSection: QcSectionResult;
  overallScore: number;
  overallMax: number;
  overallAdherence: number | null;
  target: number;
  criticalFailed: boolean;
  passed: boolean;
}

/**
 * Combines the Call + Case sections into an overall adherence % and pass/fail.
 * A `criticalFailed` flag (a "No" on a critical parameter) forces a fail regardless of %.
 */
export function computeQcResult(
  callAnswers: QcAnswer[],
  caseAnswers: QcAnswer[],
  target: number,
  pointsPerYes: number = QC_POINTS_PER_YES,
  criticalFailed: boolean = false
): QcResult {
  const callSection = scoreQcSection(callAnswers, pointsPerYes);
  const caseSection = scoreQcSection(caseAnswers, pointsPerYes);
  const overallScore = callSection.score + caseSection.score;
  const overallMax = callSection.max + caseSection.max;
  const overallAdherence = overallMax === 0 ? null : round2((overallScore / overallMax) * 100);
  const passed = !criticalFailed && overallAdherence !== null && overallAdherence >= target;
  return { callSection, caseSection, overallScore, overallMax, overallAdherence, target, criticalFailed, passed };
}

/** Normalises a raw cell/answer (Yes/No/NA or 3/0/NA) into a QcAnswer, or null if unknown. */
export function normalizeQcAnswer(value: unknown): QcAnswer | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().toUpperCase();
  if (s === '' ) return null;
  if (s === 'YES' || s === 'Y' || s === '3' || s === 'TRUE') return 'YES';
  if (s === 'NO' || s === 'N' || s === '0' || s === 'FALSE') return 'NO';
  if (s === 'NA' || s === 'N/A' || s === 'NOT APPLICABLE') return 'NA';
  return null;
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
