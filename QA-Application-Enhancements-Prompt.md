# Prompt: Enhance the Quality Assurance (QA) Management Application

> Give this to your AI coding agent. It upgrades the **existing** QA app in `qa-app/` from a
> create-and-read prototype into a more complete product (full CRUD, analytics, auth, and
> quality). Do **not** rewrite from scratch — extend the current codebase.

---

## 1. Role & Objective

You are a **senior full-stack engineer**. Improve the existing **QA Management Application**
across **all six tabs** (Dashboard, Time Utilization, Jira Ticket QA, New Joinee KT,
Maintenance, Call QA). Keep the current stack and architecture; add features incrementally
with tests and documentation. Preserve existing behavior and seed/demo data.

## 2. Existing Application Context (read before changing anything)

- **Backend:** Node.js + Express + TypeScript, Prisma ORM, SQLite. Entry `backend/src/index.ts`.
  - Routes in `backend/src/routes/`: `employees`, `timeUtilization`, `qaScores`, `kt`,
    `maintenance`, `callQa`, `dashboard`.
  - Pure scoring/aggregation in `backend/src/lib/calc.ts` (unit-tested in `calc.test.ts`).
  - Prisma models (`backend/prisma/schema.prisma`): `Employee`, `TimeUtilizationRecord`,
    `QAScore`, `QAReport`, `Joinee`, `KTTopic`, `MaintenanceActivity`, `CallQAEvaluation`.
  - Auth is a **demo `x-role` header** enforced by `requireRole(...)` in
    `backend/src/middleware/roles.ts`. Roles: `Admin`, `QA Lead`, `Call QA Analyst`,
    `Team Member`.
  - Config/weights/thresholds in `backend/.env` via `backend/src/config.ts`.
- **Frontend:** React + TypeScript + Vite, React Router, Recharts. Pages in
  `frontend/src/pages/`, axios client `frontend/src/api.ts` (injects `x-role`),
  `RoleContext.tsx`, `perms.ts`, `styles.css`.
- **Current limitations to fix (this is the point of the work):**
  - Most tabs are **create + read only** — no edit/delete for QA scores, maintenance,
    call QA, or time records. KT has delete **endpoints** but **no UI**.
  - Views are **single-period**; there are **no trends, deltas, filters, sorting, pagination,
    or search**.
  - `QAReport` rows are persisted but **never listed** in the UI.
  - PDF is browser print only; rubric weights/thresholds are `.env`-only (no UI).

## 3. Ground Rules

- Extend the existing code; match current file structure, naming, and style.
- Every new pure calculation goes in `lib/calc.ts` (or a sibling) **with unit tests**.
- Every new write endpoint must enforce roles via `requireRole(...)` and validate input.
- Update the Prisma schema with migrations/`db push`, and **extend the seed** so new features
  are populated on first run.
- Keep it runnable with the existing `setup-and-run.ps1` / `setup-and-run.sh`.
- No secrets in code; keep OWASP basics (input validation, safe file handling).

---

## 4. Cross-Cutting Requirements (apply to all tabs)

1. **Full CRUD everywhere**
   - Add `PATCH` (edit) and `DELETE` for: `QAScore`, `MaintenanceActivity`,
     `CallQAEvaluation`, `TimeUtilizationRecord`.
   - Recompute derived values on edit (utilization %, QA total, call total, maintenance
     status/`exceededByMinutes`, breach flags).
   - Wire **delete UI** for KT topics/joinees (endpoints already exist).
2. **Reusable table UX** — a shared table component with **column sort, text search, and
   pagination**; use it on every data table.
3. **Confirmations & toasts** — confirm dialog before every destructive action; non-blocking
   success/error toast notifications (replace inline banners).
4. **Trends & deltas** — a shared time-series chart + KPI **delta vs previous period**
   (▲/▼ with %). Use existing `period`/`month` fields; add month-range or "compare periods".
5. **Real authentication** — replace the `x-role` switcher with **JWT login** (email +
   password, hashed with bcrypt/argon2), issue/verify tokens, protect the API, and add a
   **Users admin** screen. Preserve the same role permission matrix. Keep a documented dev
   fallback.
6. **Settings tab (admin)** — UI to view/edit QA weighting, Call QA weighting, and time
   thresholds currently in `.env`; persist overrides in the DB and have `config.ts` prefer DB
   values over env defaults.
7. **Quality** — add **API integration tests** (e.g. supertest) for each router and a few
   component tests; loading skeletons, empty-state CTAs, ARIA labels, and mobile-responsive
   layouts.

**Acceptance:** every table is searchable/sortable/paginated; every entity can be created,
edited, and deleted with confirmation + toast; JWT login gates the app; trends render for at
least 3 months of data; `npm test` (backend) passes including new tests.

---

## 5. Per-Tab Requirements

### 5.1 Dashboard
- KPI cards show **delta vs previous period** and a **mini sparkline** per metric.
- **Alerts panel**: utilization below target, overdue KT topics, repeat timeline-missers,
  calls breaching thresholds.
- **Compare two periods**, manual **refresh**, and **export dashboard to PDF**.
- **Acceptance:** deltas and alerts are computed correctly from underlying data and update
  with the period filter.

### 5.2 Time Utilization
- **Configurable target %** with RAG (red/amber/green) status per employee; **team filter**;
  average/median stats; per-team breakdown.
- **Manual add/edit/delete** a single record (in addition to Excel import).
- **Upload dry-run preview**: show a row-by-row validation grid (valid/invalid + reasons)
  before committing; then confirm to import.
- **Export** current period to Excel/CSV; per-employee **utilization trend** line chart.
- **Acceptance:** dry-run never mutates data; RAG matches the configured target; export
  re-imports cleanly.

### 5.3 Jira Ticket QA
- **Saved report history**: list persisted `QAReport` rows with period, generated date, and
  **PMI export status**; allow re-open/re-download and re-send.
- **Configurable rubric/weighting UI**; **edit/delete** scores; **filter by member**;
  per-member **score trend**.
- **Server-side PDF** report generation (replace browser print).
- Optional: **live Jira integration** to fetch ticket keys/status (behind a config flag).
- **Acceptance:** report aggregates match raw scores; PMI export stays schema-conformant;
  history reflects true export state.

### 5.4 New Joinee KT
- **KT templates per team** (apply a standard topic set when creating a joinee).
- **Target date per topic** + **overdue** highlighting; **mentor sign-off**; notes per topic;
  show completion dates.
- Wire **delete** for topics/joinees; filter active vs fully-onboarded joinees.
- Optional: reminders/notifications for pending/overdue topics.
- **Acceptance:** applying a template creates all topics; overdue is derived from target date
  vs today; progress stays accurate after edits/deletes.

### 5.5 Maintenance
- **Edit/delete** activities; add **category/type**; add a **reason** field when exceeded.
- **Recurring schedules**; monthly **on-time %** trend; **per-member stats** table; optional
  calendar view; filters by member/status; export.
- **Acceptance:** status/`exceededByMinutes` recompute on edit; monthly top-maintainer and
  missed-timeline highlights remain correct after edits/deletes.

### 5.6 Call QA
- **Edit/delete** evaluations; **configurable rubric/weightings**; **pass/fail threshold**;
  **coaching notes / action items** per call; optional **auto-fail** conditions (e.g.
  compliance); link to call recording.
- **Per-agent trend**; **include call scores in the PMI export** alongside ticket QA.
- **Acceptance:** total score and breach flags recompute on edit; PMI payload includes call
  scores when enabled.

---

## 6. Suggested Data Model & API Additions

- **User** (for JWT): `id`, `email`, `passwordHash`, `role`, `employeeId?`.
- **AppSetting**: `key`, `value` (JSON) — for rubric weights/thresholds overrides.
- **KTTopic**: add `targetDate?`, `notes?`, `signedOffBy?`. **KTTemplate** / **KTTemplateTopic**:
  team-scoped standard topic sets.
- **MaintenanceActivity**: add `category?`, `exceedReason?`, `recurrenceRule?`.
- **CallQAEvaluation**: add `passFail?`, `coachingNotes?`, `actionItems?`, `recordingUrl?`.
- **New endpoints (examples):**
  - `PATCH/DELETE /api/qa-scores/:id`, `/api/maintenance/:id`, `/api/call-qa/:id`,
    `/api/time-utilization/:id`.
  - `GET /api/qa-scores/reports` (history), `GET /api/qa-scores/report/:id/export.pdf`.
  - `POST /api/time-utilization/upload?dryRun=true` (validate only).
  - `GET /api/*/trend?from=&to=` for time-series per tab.
  - `POST /api/auth/login`, `GET /api/auth/me`; `GET/POST/PATCH/DELETE /api/users`.
  - `GET/PUT /api/settings`.

## 7. Quality Bar (non-functional)

- Deterministic tie-breaking preserved in all new aggregations.
- Validation + clear errors on every endpoint; graceful failures (never crash on bad input).
- Backend `tsc` build clean; frontend `tsc --noEmit && vite build` clean.
- README updated with new features, env vars, and any new scripts.

## 8. Suggested Rollout (batches — deliver and verify each before the next)

1. **Batch 1 — Quick wins:** full edit/delete across all tabs + confirmations + toasts; wire
   KT delete; list saved QA reports; shared table search/sort/pagination.
2. **Batch 2 — Analytics:** month-over-month trends, dashboard deltas + alerts, configurable
   targets/thresholds with RAG, Settings tab.
3. **Batch 3 — Bigger bets:** JWT auth + Users admin; server-side PDF; KT templates + target
   dates; Jira integration; integration tests; call scores in PMI export.

## 9. Deliverables

1. Extended backend (schema + migrations + endpoints + tests) and frontend (updated tabs +
   shared components).
2. Updated seed so new fields/features are populated on first run.
3. Passing tests (`npm test`) and clean builds for both apps.
4. Updated `README.md`.

**Ask for clarification only where a requirement is genuinely ambiguous; otherwise make a
sensible, documented decision and proceed. Implement batch by batch and keep the app runnable
at the end of each batch.**
