# Quality Assurance (QA) Management Application

A web app with a landing-page dashboard that surfaces team quality & productivity metrics
across **five modules**:

1. **Time Utilization** — imported from Excel; highlights **top 2 / bottom 2** by utilization.
2. **Case QA** — case-handling QC scorecard: score each case against the case-handling QC
   parameters (Yes / No / NA) with per-case owner attribution, adherence %, and Pass/Fail vs a
   target (critical parameters auto-fail). Mirrors the Call QA page. *(The Jira Ticket QA
   timeliness/documentation report + PMI export still runs under `/qa-scores`; it is no longer
   linked in the sidebar but its data and endpoints are preserved.)*
3. **KT OPS** — new-joinee onboarding: knowledge-transfer topics per joinee (Completed/Pending
   toggles + progress) **and** project **access provisioning** (select CloudOps / VNA / PACS to
   apply a standard access list, then track each access as Pending / Granted / N/A).
4. **Maintenance Activity Tracker** — within-time vs exceeded; monthly **top maintainer** and
   **missed-timeline** highlights.
5. **Call QA** — call-handling QC scorecard: score each call against the call-handling QC
   parameters (Yes / No / NA) with call-handler attribution, adherence %, and Pass/Fail vs a
   target (critical parameters auto-fail). **Call QA** and **Case QA** sit together in the nav.

## Tech stack

- **Backend:** Node.js + Express + TypeScript, Prisma ORM, SQLite (zero-config local DB),
  SheetJS (`xlsx`) for Excel import.
- **Frontend:** React + TypeScript, Vite, React Router, Recharts.
- **Tests:** Vitest (calculation & aggregation logic).

## Prerequisites

- **Node.js 18+** (developed against Node 24 LTS). Check with `node -v`.

## Quick start

### Option A — one command (installs, sets up DB, builds, and runs)

From the `qa-app` folder:

```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File .\setup-and-run.ps1
```

```bash
# macOS / Linux / Git Bash / WSL (with Node on PATH)
bash setup-and-run.sh
```

This installs all dependencies, generates the Prisma client, applies the DB schema,
seeds demo data, builds both apps, and starts a single server that serves the API **and**
the built UI at **http://localhost:4000**.

Options: `SKIP_SEED=1` to skip demo data, `PORT=8080` to change the port
(PowerShell: `$env:SKIP_SEED='1'`, `$env:PORT='8080'`).

### Option B — dev mode (hot reload, two servers)

From the `qa-app` folder:

```bash
# 1. Install everything, create the SQLite DB and seed demo data
npm run setup          # (installs root tooling first: npm install)

# 2. Run backend (:4000) and frontend (:5173) together
npm run dev
```

Then open **http://localhost:5173**.

> `npm run setup` runs the backend/frontend installs, `prisma db push`, and the seed.
> If you skip the root `npm install`, use the per-app commands below instead.

### Run each app separately

```bash
# Backend
cd backend
npm install
npm run db:push      # create SQLite schema
npm run seed         # demo data
npm run dev          # http://localhost:4000

# Frontend (second terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173 (proxies /api -> :4000)
```

## Useful scripts

**Backend** (`/backend`)

| Script | Purpose |
|---|---|
| `npm run dev` | Start API with hot reload (tsx watch) |
| `npm run build` | Type-check + compile to `dist/` |
| `npm run db:push` | Sync SQLite schema from `prisma/schema.prisma` |
| `npm run seed` | Reset + load demo data |
| `npm test` | Run Vitest unit tests |
| `npm run make:template` | Generate `docs/time-utilization-template.xlsx` |

**Frontend** (`/frontend`): `npm run dev`, `npm run build`, `npm run preview`.

## Authentication & roles

Sign in with email + password (JWT). The token is stored client-side and sent as a
`Bearer` header; the backend enforces role permissions. For local dev, an `x-role` header
fallback is still accepted (handy for scripts/tests).

**Seeded logins:**

| Role | Email | Password | Can write |
|---|---|---|---|
| **Admin** | admin@example.com | admin123 | everything + Settings + Users |
| **QA Lead** | qalead@example.com | qalead123 | time upload, QA scores/report/PMI, KT, maintenance |
| **Call QA Analyst** | analyst@example.com | analyst123 | call evaluations |
| **Team Member** | member@example.com | member123 | read-only |

The Login screen also has one-click **dev login** buttons. Change `JWT_SECRET` in
`backend/.env` for production.

## Feature highlights

- **Full CRUD** (create/edit/delete) on every tab, with confirmation dialogs and toasts;
  searchable / sortable / paginated tables.
- **Dashboard** shows month-over-month **deltas**, a **KPI strip with sparklines**, a
  **Failed SLA cases** panel (Call/Case QC evaluations that missed target or critical-failed), and
  **trend charts** (theme-aware).
- **Modular sections** — the sidebar is **data-driven** (`NavSection`); admins can **rename,
  reorder, and enable/disable** sections in **Settings → Sections & navigation** (default order:
  Dashboard, Time Utilization, Call QA, Case QA, KT OPS, Maintenance).
- **In-app QC parameters** — from **Call QA** and **Case QA**, admins/leads can **add, edit,
  reorder, mark-critical, and activate/deactivate** parameters (`/api/qc-parameters`); serials
  auto-number **1..N** per section. Removing a used parameter deactivates it to preserve history.
- **KT OPS** shows one **joiner selected from a dropdown** (KT topics + access list on demand).
- **Light/Dark theme** toggle in the sidebar; all surfaces, controls, and charts are token-driven
  and recolour on switch (persisted, flash-free), with app-wide animations.
- **Settings** (Admin) — configure **Call QC** and **Case QC** targets/points, time thresholds,
  utilization target (RAG status), PMI options, and the section layout.
- **Users** (Admin) — manage login accounts and roles.
- **QA report** exports **CSV** and **PDF** (server-generated) and can be sent to PMI.
- **KT OPS** — knowledge transfer (templates, per-topic target dates with overdue flags, notes,
  and mentor sign-off) **plus access lists**: seeded standard accesses per project
  (CloudOps: JIRA, VPN, Qualis, Azure, mCloud ID, GitHub, SecureLink, Jumpboxes, PagerDuty;
  VNA & PACS: SecureLink, Support JIRA, Salesforce, VPN). Apply a project's list to a joinee
  (`POST /api/kt/joinees/:id/access/apply`), **mark each access complete** (Pending → Granted,
  with N/A option) via `PATCH /api/kt/joinee-access/:id`, and add ad-hoc accesses to a project
  (`POST /api/kt/projects/:projectId/access-items`). The KT and access lists render side-by-side
  per joinee; an **owner dropdown** (from `/api/employees`) attributes accesses on completion and
  shows that person's pending vs. complete totals, with a **Pending only** filter and
  **Mark all complete** shortcut.
- **Jira** — `GET /api/jira/tickets` returns mock data, or live issues when `JIRA_*` env vars
  are set.

## Excel import format (Time Utilization)

Columns (header names are matched case-insensitively, with common aliases):

| Employee Name | Email | Team | Period | Planned Hours | Actual/Billable Hours |
|---|---|---|---|---|---|
| Ana Sharma | ana@example.com | QA | 2026-07 | 160 | 150 |

A ready-made template is generated at `docs/time-utilization-template.xlsx`
(`npm --prefix backend run make:template`). `.xlsx`, `.xls` and `.csv` are all accepted.

## PMI export

- **QA report** is available as on-screen data, **CSV** (`/api/qa-scores/report/export.csv`),
  and a **printable PDF** (browser Print / Save as PDF on the report panel).
- **Send to PMI** marks the report exported. If `PMI_API_URL` is set in `backend/.env`, the
  report JSON is POSTed there; otherwise it is marked exported and available as JSON/CSV.
- PMI export JSON schema matches `§5` of the source prompt (`teamMembers[]` with per-ticket
  breakdown).

## Configuration (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 4000 | API port |
| `QA_WEIGHT_TIMELINESS` / `QA_WEIGHT_DOCUMENTATION` | 0.5 / 0.5 | QA score weighting |
| `QA_SCALE_MAX` | 5 | QA parameter scale |
| `CALLQA_WEIGHT_*` | 0.25 each | Call QA parameter weighting |
| `CALLQA_CASE_CREATION_THRESHOLD_SECS` | 120 | Flag slow case creation |
| `CALLQA_CALL_CLOSE_THRESHOLD_SECS` | 60 | Flag slow call close |
| `PMI_API_URL` | (empty) | Downstream PMI endpoint |

## Project layout

```
qa-app/
  backend/    # Express + Prisma API, seed, tests
    prisma/schema.prisma
    src/lib/calc.ts        # pure scoring/aggregation (unit tested)
    src/routes/            # employees, timeUtilization, qaScores, kt, maintenance, callQa, dashboard
  frontend/   # React + Vite dashboard and module pages
    src/pages/             # Dashboard + 5 modules
  docs/       # generated Excel template
```

## Notes / simplifications

- SQLite is used for zero-config local dev; point `DATABASE_URL` at PostgreSQL and change the
  Prisma `datasource` provider to `postgresql` for production.
- "PDF" report uses the browser's Print → Save as PDF on a print-styled report panel.
- Auth is a role header (see above) rather than full JWT login.
