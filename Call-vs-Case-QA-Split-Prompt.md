# Prompt: Split Call & Case QC into Separate "Call QA" and "Case QA" Pages

> Give this to your AI coding agent. It **splits** the existing combined **Call & Case QC
> scorecard** in the QA app (`qa-app/`) into **two focused scorecards**: **Call QA**
> (call-handling parameters only) and a new **Case QA** (case-handling parameters only). The
> current **"Jira Ticket QA"** navigation slot is **renamed to "Case QA"** and repurposed to
> host the case scorecard, and the two QA pages are placed **adjacent (stacked)** in the left
> nav. **Extend** the current codebase — do **not** rewrite from scratch. Keep the app runnable
> at the end.

---

## 1. Role & Objective

You are a **senior full-stack engineer**. Today a single evaluation captures **both** call
handling and case handling on one scorecard (the "Call QA" page). Separate these concerns:

1. **Call QA** keeps **only the call-handling (`CALL`) parameters** and attributes results to
   the **call handler**.
2. **Case QA** is a **new scorecard**, visually and functionally mirroring Call QA, that
   contains **only the case-handling (`CASE`) parameters** moved out of Call QA, and attributes
   results to the **case owner**.
3. The existing **"Jira Ticket QA"** nav entry is **renamed to "Case QA"** and its slot is used
   for the new case scorecard (see §7 for how to handle the legacy Jira-ticket scoring module).
4. In the left navigation, **Call QA and Case QA sit directly on top of each other**.

Deliver clean, documented, tested code that matches the existing patterns, keep tests green,
and update the README.

---

## 2. Existing Application Context (read before changing anything)

**This is critical — the two current pages are NOT what their labels imply:**

- **"Call QA" page = a combined Call & Case QC scorecard.**
  - Backend: `backend/src/routes/callQa.ts` (`buildCallQaView`, `enrichEvaluation`,
    create/list/import endpoints). Pure scoring in `backend/src/lib/calc.ts`
    (`computeQcResult`, `normalizeQcAnswer`) with tests in `calc.test.ts`.
  - Prisma models in `backend/prisma/schema.prisma`:
    - `QcParameter` — `code` (QC1..QC20), **`section` = `CALL` | `CASE`**, `text`, `order`,
      `active`, `critical`.
    - `CallQcEvaluation` — one row per case; holds `callHandledById` **and** `caseOwnerId`
      (both currently required), plus split metrics `callScore/callMax/callAdherence`,
      `caseScore/caseMax/caseAdherence`, `overallScore/overallMax/overallAdherence`, `target`,
      `passed`, `findings`, `actionPlan`, `period`.
    - `CallQcAnswer` — `answer` (`YES` | `NO` | `NA`) + `comment`, unique per
      `(evaluationId, parameterId)`.
  - Seed: `backend/prisma/seed.ts` defines `CALL_PARAMS` (7 items → QC1–QC7) and `CASE_PARAMS`
    (13 items → QC8–QC20), with critical (auto-fail) codes `QC5`, `QC7` (call) and `QC20`
    (case). Excel template generation in `backend/scripts/make-template.ts`.
  - Frontend page: `frontend/src/pages/CallQA.tsx` (renders `Call Handling` and `Case Handling`
    sections from `QcParameters { call, case }`, per-parameter Yes/No/NA + comment, live
    per-section and overall adherence, Pass/Fail vs target).
  - Permissions: `frontend/src/perms.ts` → `can.callQa` (`Admin`, `Call QA Analyst`).

- **"Jira Ticket QA" page = a separate scoring module (unrelated to the QC scorecard).**
  - Backend: `backend/src/routes/qaScores.ts` (model **`QAScore`**: `timelinessScore`,
    `documentationScore`, `totalScore`, `jiraTicketKey`, `evaluatorId`, `period`) with report
    generation and **PMI export** (`QAReport`).
  - Frontend page: `frontend/src/pages/QAScores.tsx`; permission `can.qa`.

- **Shared:** React + Vite + TS; nav & routes in `frontend/src/App.tsx`; types in
  `frontend/src/types.ts`; axios client `frontend/src/api.ts`; shared UI `ui/DataTable.tsx`,
  `ui/Toast.tsx`, `ui/Confirm.tsx`; dashboard cards in `frontend/src/pages/Dashboard.tsx` and
  `backend/src/routes/dashboard.ts`. Roles via `requireRole(...)` in
  `backend/src/middleware/roles.ts`. Runtime target/config via `backend/src/settings.ts` +
  `config.ts`.

- **Ground rules:** match existing file structure/naming/style; every new pure calculation goes
  in `lib/calc.ts` **with unit tests**; every write endpoint enforces roles + validates input;
  update the Prisma schema (`db push`/migration) and **extend the seed**; keep
  `setup-and-run.ps1`/`.sh` working; OWASP basics (input validation, safe file handling); no
  secrets in code.

---

## 3. Target Architecture (recommended)

Because Call QA already stores `section` on each parameter and computes call/case metrics
separately, the cleanest split is to **make each evaluation section-scoped**:

- Introduce a **`kind` discriminator** (`CALL` | `CASE`) on the evaluation (add a field to
  `CallQcEvaluation`, e.g. `kind String @default("CALL")`, or create a parallel
  `CaseQcEvaluation` model — **choose one and justify**; the discriminator approach is
  preferred to maximise reuse of `computeQcResult`, imports, and the enrichment layer).
- A **Call QA** evaluation includes **only `CALL` parameters**, requires the **call handler**,
  and computes **call adherence** → Pass/Fail vs the call target.
- A **Case QA** evaluation includes **only `CASE` parameters**, requires the **case owner**,
  and computes **case adherence** → Pass/Fail vs the case target.
- Make the "other" owner field **optional** on the schema so a Call QA row doesn't require a
  case owner and vice-versa (adjust `callHandledById` / `caseOwnerId` nullability accordingly,
  and update `enrichEvaluation` and the per-agent attribution logic).

> If you instead keep one shared model, ensure the list/create/view endpoints and the two
> pages **filter strictly by `section`/`kind`** so neither page ever shows the other's
> parameters, and per-agent/dashboard aggregates are attributed to the correct person.

---

## 4. Backend Requirements

1. **Parameters** — keep the single `QcParameter` table; `CALL` rows power Call QA, `CASE` rows
   power Case QA. Preserve existing codes, order, and critical flags (`QC5`, `QC7` for call;
   `QC20` for case). Add a `GET` that returns parameters filtered by section (or extend the
   existing parameters endpoint to group `{ call, case }` as today and let each page pick its
   own).
2. **Call QA endpoints** (`callQa.ts`) — restrict create/list/view/import to **`CALL`**
   parameters and call-handler attribution; compute and store **call** metrics; Pass/Fail
   against the **call** target. Remove case fields from the Call QA create/validation path (or
   ignore them for `kind = CALL`).
3. **Case QA endpoints** — add a **new route module** (e.g. `backend/src/routes/caseQa.ts`,
   registered in `backend/src/index.ts`, e.g. under `/api/case-qa`) that mirrors the Call QA
   endpoints (create, list by period, get one, Excel import + template) but operates on
   **`CASE`** parameters and **case-owner** attribution, computing **case** metrics and
   Pass/Fail vs the **case** target. Reuse `computeQcResult` and the import helpers; do **not**
   duplicate scoring math — extend `lib/calc.ts` with tests if any new pure logic is needed.
4. **Config/target** — add a **case QC target** setting alongside the existing `callQc.target`
   in `settings.ts`/`config.ts` (default to the same value); each page uses its own target.
5. **Dashboard** — update `backend/src/routes/dashboard.ts` so the QC summary reflects the
   split (separate Call QA and Case QA tiles/metrics, or a combined tile that clearly labels
   both). Keep deltas working.
6. **Roles & validation** — Case QA writes use the same guard level as Call QA
   (`Admin`, `Call QA Analyst`); validate all input; no 500s on bad payloads.
7. **Migration/seed** — run `prisma db push` (or a migration) and **extend/adjust the seed** so
   both pages are populated on first run: seed a few **Call QA** evaluations (CALL params) and a
   few **Case QA** evaluations (CASE params) for the current and previous periods.

---

## 5. Frontend Requirements

1. **Call QA page** (`CallQA.tsx`) — remove the **Case Handling** section and all case-owner
   inputs/metrics; show only the **Call Handling** parameters, call-handler selection, call
   adherence, and Pass/Fail vs the call target. Keep the existing look, table, filters, and
   toasts.
2. **Case QA page** — create `frontend/src/pages/CaseQA.tsx` that **mirrors** the Call QA page
   (same layout, components, and UX) but renders the **Case Handling** parameters, a
   **case-owner** selector, case adherence, and Pass/Fail vs the case target. Reuse shared UI
   (`DataTable`, `Toast`, `Confirm`) and the same styling/classes so the two pages look like
   siblings.
3. **Rename & routing** (`App.tsx`) — replace the **"Jira Ticket QA"** nav item label with
   **"Case QA"** and point it at the new Case QA page. Decide the route: reuse `/qa-scores` or
   add `/case-qa` (state your choice; if you retire the legacy page, redirect/remove its route
   cleanly). Wire the new route to `CaseQA`.
4. **Nav ordering** — place **Call QA** and **Case QA** **adjacent, stacked on top of each
   other** in the sidebar (e.g. Call QA immediately followed by Case QA). Keep the icons
   consistent (e.g. `PhoneCall` for Call QA, a suitable case/ticket icon for Case QA).
5. **Types & client** — add any new types to `frontend/src/types.ts` (e.g. a `CaseEvaluation` /
   reuse `CallEvaluation` with `kind`) and API helpers to `api.ts`; keep them consistent with
   existing naming.
6. **Permissions** — gate Case QA editing with the appropriate `can.*` helper (reuse
   `can.callQa` or add `can.caseQa` with the same roles).
7. **Dashboard** (`Dashboard.tsx`) — reflect the split (separate Call QA and Case QA summaries
   or a clearly-labelled combined card), matching the backend dashboard changes.

---

## 6. Navigation — desired left-pane order

```
Dashboard
Time Utilization
KT OPS
Maintenance
Call QA      ← call-handling scorecard
Case QA      ← case-handling scorecard (directly below Call QA)
```

(Exact surrounding order is flexible, but **Call QA and Case QA must be consecutive**.)

---

## 7. Decision: the legacy "Jira Ticket QA" module

The current Jira Ticket QA page is a **separate** system (timeliness/documentation scoring +
PMI report export via `QAScore` / `QAReport`). Renaming its nav slot to "Case QA" means the
case scorecard takes over that entry. **Choose and clearly document one approach:**

- **(Recommended) Repurpose the slot:** point the renamed "Case QA" nav item at the new case
  scorecard and **remove the Jira-ticket scoring page from the nav**. Preserve the `QAScore` /
  `QAReport` **data, endpoints, and PMI export** in the backend (and optionally keep the old
  route reachable but unlinked) so no reporting capability is silently lost.
- **Or fully retire** the Jira-ticket QA UI and endpoints if the team confirms it's obsolete —
  only if you also remove/relocate its dashboard usage and PMI export cleanly.

State which you chose and why in your summary, and make sure nothing references a removed
route/label afterward.

---

## 8. Suggested enhancements (implement the sensible ones; note any skipped)

- A shared `QcScorecard` component/hook powering both Call QA and Case QA to avoid duplication.
- Per-section **critical-fail** messaging preserved on each page (`QC5`/`QC7` for call; `QC20`
  for case).
- Independent **targets** for call vs case in Settings, surfaced in the UI.
- A combined **"QC overview"** on the dashboard linking to both pages.
- Data backfill: if existing combined evaluations are present, split or migrate them so history
  isn't lost.

Keep enhancements consistent with existing patterns; don't over-engineer.

---

## 9. Acceptance Criteria

- **Call QA** shows **only** call-handling parameters, requires/attributes the **call handler**,
  and computes call adherence + Pass/Fail vs the call target. No case parameters appear.
- **Case QA** is a new page that **looks like Call QA**, shows **only** case-handling
  parameters, requires/attributes the **case owner**, and computes case adherence + Pass/Fail
  vs the case target.
- The nav shows **"Call QA"** and **"Case QA"** **stacked adjacently**; the old **"Jira Ticket
  QA"** label no longer appears.
- Creating, listing, importing, and viewing evaluations works independently for each page; all
  writes enforce roles and validate input (no 500s on bad input).
- `schema.prisma` updated (discriminator/optional owner or new model); `prisma db push`/
  migration runs cleanly; **seed** populates both Call QA and Case QA sample data.
- Pure scoring stays in `lib/calc.ts` and **all unit tests pass**; backend builds and
  `npm test` is green; frontend builds with **no TypeScript errors**.
- `setup-and-run.ps1` / `.sh` still start the app end-to-end; README updated.
- The legacy Jira-ticket QA decision (§7) is implemented cleanly with no dangling
  references/routes.

---

## 10. Deliverables

1. Updated Prisma schema + migration/`db push` + adjusted **seed** (Call QA and Case QA data).
2. Call QA backend restricted to `CALL`; new **Case QA** route module for `CASE` (reusing
   `computeQcResult` and import helpers); `settings.ts`/`config.ts` case target; dashboard
   updates.
3. Trimmed **`CallQA.tsx`** (call-only) and new **`CaseQA.tsx`** (case-only, mirroring Call QA);
   nav rename + reordering + routing in `App.tsx`; new types/api helpers; permissions.
4. Dashboard UI updates reflecting the split.
5. Updated README (Call QA vs Case QA, and the legacy Jira-ticket QA decision).
6. A short summary of key decisions (discriminator vs new model, route choice, legacy module
   handling) and which suggested enhancements you implemented vs. skipped, and why.
