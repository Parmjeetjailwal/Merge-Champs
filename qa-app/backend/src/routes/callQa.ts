// Call QA is the call-handling QC scorecard. Its endpoints and scoring live in the shared
// section-parameterised factory (`qcCore`); this module just binds it to the CALL section.
import { createQcRouter, buildQcView } from './qcCore';

export type { QcView as CallQaView } from './qcCore';

export const callQaRouter = createQcRouter('CALL');

/** Back-compat helper used by the dashboard aggregation. */
export function buildCallQaView(period: string | null) {
  return buildQcView('CALL', period);
}
