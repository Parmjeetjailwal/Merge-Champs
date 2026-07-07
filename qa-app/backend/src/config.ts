import 'dotenv/config';

function num(key: string, fallback: number): number {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : Number(v);
}

export const config = {
  port: num('PORT', 4000),
  qa: {
    scaleMax: num('QA_SCALE_MAX', 5),
    timeliness: num('QA_WEIGHT_TIMELINESS', 0.5),
    documentation: num('QA_WEIGHT_DOCUMENTATION', 0.5),
  },
  callQa: {
    scaleMax: num('CALLQA_SCALE_MAX', 5),
    opening: num('CALLQA_WEIGHT_OPENING', 0.25),
    info: num('CALLQA_WEIGHT_INFO', 0.25),
    deadAir: num('CALLQA_WEIGHT_DEADAIR', 0.25),
    closing: num('CALLQA_WEIGHT_CLOSING', 0.25),
    caseCreationThresholdSecs: num('CALLQA_CASE_CREATION_THRESHOLD_SECS', 120),
    callCloseThresholdSecs: num('CALLQA_CALL_CLOSE_THRESHOLD_SECS', 60),
  },
  callQc: {
    target: num('CALLQC_TARGET_PERCENT', 95),
    pointsPerYes: num('CALLQC_POINTS_PER_YES', 3),
  },
  caseQc: {
    target: num('CASEQC_TARGET_PERCENT', 95),
    pointsPerYes: num('CASEQC_POINTS_PER_YES', 3),
  },
  pmiApiUrl: process.env.PMI_API_URL ?? '',
};
