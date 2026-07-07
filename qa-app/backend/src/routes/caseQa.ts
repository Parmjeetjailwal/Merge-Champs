// Case QA is the case-handling QC scorecard. It reuses the shared section-parameterised
// factory (`qcCore`), bound to the CASE section.
import { createQcRouter, buildQcView } from './qcCore';

export type { QcView as CaseQaView } from './qcCore';

export const caseQaRouter = createQcRouter('CASE');

/** Aggregation helper (mirrors buildCallQaView) for the dashboard. */
export function buildCaseQaView(period: string | null) {
  return buildQcView('CASE', period);
}
