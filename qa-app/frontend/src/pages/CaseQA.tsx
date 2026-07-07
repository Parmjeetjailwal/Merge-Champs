import { QcScorecard, caseConfig } from './CallQA';

/** Case QA = the case-handling QC scorecard (mirrors Call QA, case-handling parameters). */
export function CaseQA() {
  return <QcScorecard config={caseConfig} />;
}
