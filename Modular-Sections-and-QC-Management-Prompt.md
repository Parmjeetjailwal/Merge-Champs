# Prompt: Make the QA App Modular — Configurable Sections, In‑App QC Parameter Management, SLA Dashboard & KT OPS Joiner Selector

> Give this to your AI coding agent. It upgrades the **existing** QA app (`qa-app/`) so teams
> can **add / edit / reorder / enable sections without code changes**, **manage QC parameters
> in‑app for both Call QA and Case QA** (with auto serial numbering), adds a **Failed SLA cases**
> section to the Dashboard, and changes **KT OPS** to show a **single joiner selected from a
> dropdown** instead of every joiner’s full data. **Extend** the current codebase — do **not**
> rewrite from scratch. Keep the app runnable at the end.

---

## 1. Role & Objective

You are a **senior full‑stack engineer**. Deliver five capabilities:

1. **Modular, admin‑configurable sections** — the sidebar/navigation and section metadata become
   **data‑driven and editable in‑app** (add, rename, reorder, enable/disable). As part of this,
   set the **default order** so **KT OPS** and **Maintenance** come **after Case QA**.
2. **In‑app QC parameter management** — an admin/lead can **add, edit, reorder, activate/deactivate,
   and mark‑critical** QC parameters for **both** the **Call Handling** (Call QA) and **Case
   Handling** (Case QA) scorecards, reachable from **both** pages.
3. **QC serial renumbering** — parameter **serial numbers run 1..N** and are **auto‑maintained**
   (renumbered on add/remove/reorder) so codes are always sequential.
4. **Dashboard “Failed SLA cases”** — a Dashboard section that highlights cases that **failed
   their SLA/QC** (failed pass target or critical‑fail), across Call QA and Case QA.
5. **KT OPS joiner selector** — pick a joiner from a **dropdown**; the page shows **only that
   joiner’s** KT topics and access list, instead of rendering all joiners’ full data at once.
6. **Full UI overhaul with animations + robust light/dark theming** — modernise the entire UI with
   tasteful motion/micro‑interactions, and a **theme toggle** where switching updates **all**
   colours — **fonts/text, backgrounds, borders, surfaces, charts, and controls** — consistently
   across every page (no hard‑coded colours left un‑themed).

Deliver clean, documented, tested code that matches existing patterns, keep tests green, and
update the README.

---

## 2. Existing Application Context (read before changing anything)

- **Backend:** Node.js + Express + TypeScript, Prisma ORM, SQLite. Entry `backend/src/index.ts`,
  routers registered in `backend/src/app.ts`.
  - **QC parameters** live in `QcParameter` (`backend/prisma/schema.prisma`): `code` (e.g. `QC1`),
    **`section` = `CALL` | `CASE`**, `text`, `order`, `active`, `critical`. They are **seeded
    reference data** (`backend/prisma/seed.ts`: `CALL_PARAMS` → QC1..QC7, `CASE_PARAMS` → QC8..QC20,
    criticals `QC5`,`QC7`,`QC20`) and currently have **no create/update/delete endpoints** — only
    `GET /api/(call|case)-qa/parameters` returns them grouped `{ call, case }` (see
    `backend/src/routes/qcCore.ts`).
  - **QC scorecards** (Call QA + Case QA) share the factory in `backend/src/routes/qcCore.ts`
    (`createQcRouter(section)`, `buildQcView(section)`); evaluations are `CallQcEvaluation`
    (`kind` = `CALL` | `CASE`, `passed`, `overallAdherence`, `target`, critical‑fail derived from
    answers). Pure scoring is in `backend/src/lib/calc.ts` (`computeQcResult`) with tests in
    `calc.test.ts`.
  - **Dashboard** aggregation in `backend/src/routes/dashboard.ts` (per‑section summaries; the old
    “alerts” block was removed). Runtime config via `backend/src/settings.ts` + `config.ts`
    (DB‑stored overrides). Roles via `requireRole(...)` in `backend/src/middleware/roles.ts`
    (`Admin`, `QA Lead`, `Call QA Analyst`, `Team Member`).
- **Frontend:** React + TypeScript + Vite, React Router.
  - **Navigation** is a **hard‑coded array** `baseNav` (+ `adminNav`) in `frontend/src/App.tsx`,
    with routes registered in the same file. Current order:
    Dashboard, Time Utilization, KT OPS, Maintenance, Call QA, Case QA.
  - **Call QA / Case QA** render from the shared `QcScorecard` in `frontend/src/pages/CallQA.tsx`
    (`callConfig`/`caseConfig`); `frontend/src/pages/CaseQA.tsx` wraps it. Parameters come from
    `${endpoint}/parameters`.
  - **KT OPS** is `frontend/src/pages/KTTracker.tsx` — currently maps **all** joinees into
    full cards (KT topics + access list) via `joinees.map(...)`.
  - **Dashboard** is `frontend/src/pages/Dashboard.tsx` (KPI strip + per‑section cards + trends).
  - Shared UI: `ui/DataTable.tsx` (sticky headers, density, row‑selection/bulk actions),
    `ui/Toast.tsx`, `ui/Confirm.tsx`; permissions `frontend/src/perms.ts`; axios client
    `frontend/src/api.ts`; types `frontend/src/types.ts`; styles `frontend/src/styles.css`.
- **Ground rules:** match existing file structure/naming/style; **every write endpoint enforces
  roles + validates input**; put pure logic in `lib/calc.ts` **with unit tests**; update the
  Prisma schema (`db push`/migration) and **extend the seed**; keep `setup-and-run.ps1`/`.sh`
  working; OWASP basics (input validation, safe handling); no secrets in code.

---

## 3. Requirement A — Modular, admin‑configurable sections

Make the navigation/sections **data‑driven** and editable in‑app rather than hard‑coded.

- **Data model:** add a `NavSection` (or `AppSection`) model — fields e.g. `key` (unique, maps to a
  known route/component), `label`, `path`, `icon` (string name), `order`, `enabled`, `adminOnly`,
  `roles` (optional CSV of roles allowed to see it). Seed it with the current sections.
- **Default order** (seeded): Dashboard → Time Utilization → **Call QA → Case QA → KT OPS →
  Maintenance** → (admin) Settings, Users. i.e. **KT OPS and Maintenance move to after Case QA.**
- **Backend:** `GET /api/sections` (list, respecting role visibility) and admin‑guarded
  `POST` / `PATCH` / `DELETE` (+ a reorder endpoint or `order` on PATCH). Validate `key`/`path`.
- **Frontend:** `App.tsx` builds the sidebar and routes **from the fetched sections** (map known
  `key` → page component + Lucide icon via a registry), instead of the static `baseNav`. A new
  admin **“Sections”** management UI (in Settings or its own admin page) lets an admin **add,
  rename, reorder (up/down or drag), enable/disable, and set visibility** — changes persist and
  reflect immediately in the sidebar.
- Keep existing routes/paths working; unknown/disabled sections must not break routing (guard).

> Note: “any team can add/update/modify all sections” = **admin‑configurable metadata + ordering**
> for the existing modules (not arbitrary code generation). New *feature* pages still ship as code,
> but their **presence, label, order, and visibility** are data‑driven.

---

## 4. Requirement B — In‑app QC parameter management (Call & Case)

Let admins manage the QC parameters that power both scorecards, from **both** pages.

- **Backend (extend `qcCore.ts` or a new `qcParams.ts`):** role‑guarded CRUD on `QcParameter`,
  scoped by section:
  - `POST /api/qc-parameters` `{ section, text, critical? }` → append to that section.
  - `PATCH /api/qc-parameters/:id` `{ text?, critical?, active?, order? }`.
  - `DELETE /api/qc-parameters/:id` (or soft‑delete via `active=false`; state your choice —
    prefer deactivate to preserve historical answers/foreign keys).
  - `POST /api/qc-parameters/reorder` `{ section, orderedIds[] }`.
  - Validate section ∈ {CALL, CASE}, non‑empty text, and enforce `Admin`/`QA Lead`.
- **Frontend:** on **Call QA** and **Case QA**, add a **“Manage parameters”** control (button/modal
  or an admin card) to **add** a parameter (the section is fixed by the page: Call QA → Call
  Handling, Case QA → Case Handling), **edit text**, **toggle critical**, **activate/deactivate**,
  **reorder**, and remove. Changes must immediately reflect in the scorecard’s parameter list and
  in scoring. Gate behind the existing permission (`can.callQa`/`can.caseQa`).
- Preserve existing evaluations: deactivating/removing a parameter must not corrupt past
  evaluations (historical answers remain; deactivated params are excluded from **new** QCs).

---

## 5. Requirement C — QC serial renumbering (1..N)

- Parameter **serials/codes are sequential per section starting at 1** (Call Handling: 1..N; Case
  Handling: 1..M) and are **auto‑maintained** whenever parameters are added, removed/deactivated,
  or reordered. Choose and document one scheme:
  - **Preferred:** keep a stable internal `code`/id, but **derive a display serial** (`#1..#N`) from
    `order` per active section at read time (so history isn’t broken by renumbering), **or**
  - Physically renumber `order`/`code` on mutations (a `renumber(section)` helper) — if you touch
    `code`, ensure it doesn’t break references in `CallQcAnswer`/exports.
- The scorecards, the manage‑parameters UI, and the Excel export/template must show the **1..N**
  serials consistently.

---

## 6. Requirement D — Dashboard “Failed SLA cases” section

Add a Dashboard section that surfaces cases that **failed their SLA/QC**.

- **Backend (`dashboard.ts`):** for the selected period, collect **failed** Call QA and Case QA
  evaluations (`passed === false`, including critical fails). Return a concise list — e.g.
  `{ caseNo, kind (Call/Case), owner, adherence, target, criticalFailed, product, period }` — plus a
  count. Attribute to the relevant person (call handler / case owner).
- **Frontend (`Dashboard.tsx`):** a clearly‑labelled **“Failed SLA cases”** card/section listing the
  failed cases with a red/critical badge, owner, section, and adherence vs target; link through to
  the relevant Call QA / Case QA page. Handle the empty state (“No SLA failures this period ✅”).
- Reuse existing badge/table/list styling and the period already selected on the Dashboard.

---

## 7. Requirement E — KT OPS joiner selector

Change **KT OPS** so it doesn’t dump every joiner’s full data on the page.

- **Frontend (`KTTracker.tsx`):** add a **joiner dropdown** (searchable if easy) listing joinees by
  name (with team/join date). By default show **no full detail** (or a lightweight summary list);
  only when a joiner is selected do you render **their** KT topics + access list detail (the current
  card content, for one joiner). Keep add/import/apply‑template/access actions scoped to the
  selected joiner. Preserve the existing access owner filter and CSV export.
- Optionally keep a compact roster (name + progress badges) above/beside the selector, but the
  heavy per‑joiner detail must be **selection‑driven**, not all‑at‑once.
- Fetch efficiently (the existing `GET /api/kt/joinees` returns all with progress; you may keep it
  and filter client‑side, or add `GET /api/kt/joinees/:id` for a single joiner — state your choice).

---

## 8. Requirement F — Full UI overhaul, animations & light/dark theming

Refresh the **entire** interface so it feels modern and cohesive, and make theming **complete**.

### 8.1 Visual overhaul (all pages)
- Apply a consistent, polished design across **every** page and component (Dashboard, Time
  Utilization, Call QA, Case QA, KT OPS, Maintenance, Settings, Users, Login) — cards, tables,
  forms, modals, badges, buttons, nav, toasts, empty/loading states. Keep information density and
  usability; this is a **refinement**, not a redesign that breaks workflows.
- Improve typography scale, spacing rhythm, elevation/shadows, rounded corners, and hover/active
  states for a unified look.

### 8.2 Animations & micro‑interactions
- Add tasteful motion: page/route transitions, card and list entrance animations, button/hover
  and press feedback, modal open/close transitions, toast slide‑in, skeleton/shimmer **loading
  states**, animated number/metric counters or progress bars where it adds value, and smooth
  chart mount.
- **Respect `prefers-reduced-motion`** — animations must degrade to no‑motion for users who opt
  out. Keep animations GPU‑friendly (transform/opacity), short, and non‑distracting.
- Ensure animations don’t break existing behaviour (e.g. `animation-fill-mode` must not override
  interactive `:hover` transforms — an issue already hit on `.card`; verify no regressions).

### 8.3 Complete light/dark theming
- A **theme toggle** (light/dark) that, when switched, updates **all** visual tokens — **text/font
  colours, backgrounds, surfaces/panels, borders, muted/secondary text, semantic (good/warn/bad)
  colours, chips/badges, inputs & native controls, scrollbars, charts, and the sidebar** — with
  **no hard‑coded colours left un‑themed** anywhere in `styles.css` or inline styles.
- Drive everything from **CSS custom properties** (design tokens) with a light set on `:root` and a
  dark set on `[data-theme='dark']`; set `color-scheme` so native inputs/date‑pickers/scrollbars
  match. Audit `styles.css` and page files for hard‑coded hex values (e.g. table row hover, chips,
  Recharts stroke/grid colours) and route them through tokens.
- **Charts** (Recharts `TrendChart`, sparklines, bar charts) must read colours from CSS
  variables/props so they recolour on theme switch (axes, grid, tooltip, series).
- **Persist** the choice (localStorage) and apply it before first paint to avoid a flash; optionally
  default to the OS preference (`prefers-color-scheme`) on first load.
- Ensure **WCAG‑AA contrast** in both themes for text and interactive elements.

> Note: a basic dark theme + toggle and some motion may already exist — this requirement is to make
> theming **exhaustive** (every surface/colour, including charts and native controls) and the
> animation pass **application‑wide and consistent**, fixing any un‑themed or un‑animated spots.

---

## 9. Data Model & Migration

- Add `NavSection`/`AppSection` (Requirement A) and any field needed for QC ordering/serials
  (Requirement C). Run `prisma db push` (or a migration) cleanly.
- **Extend the seed** to populate sections (with the new default order) and keep the existing QC
  parameters, ensuring serials render 1..N per section.

---

## 10. Acceptance Criteria

- Sidebar/nav is **built from data**; an admin can **add, rename, reorder, enable/disable** sections
  in‑app and the change persists and reflects immediately. Default order places **KT OPS and
  Maintenance after Case QA**.
- From **both** Call QA and Case QA, an admin can **add/edit/reorder/deactivate/mark‑critical**
  parameters; new QCs use the updated list; **past evaluations remain intact**.
- Parameter serials display **1..N per section** and stay sequential after add/remove/reorder.
- The Dashboard shows a **Failed SLA cases** section listing failed Call/Case QC cases for the
  period (with owner, section, adherence, critical flag) and a sensible empty state.
- **KT OPS** shows a **joiner dropdown**; full KT + access detail appears **only for the selected
  joiner**, not for all joinees at once.
- The **UI is refreshed across every page** with consistent, tasteful **animations** that respect
  `prefers-reduced-motion` and cause **no interaction regressions**.
- The **light/dark theme toggle recolours everything** — text/fonts, backgrounds, surfaces, borders,
  semantic colours, chips/badges, inputs & native controls, scrollbars, **and charts** — with **no
  hard‑coded, un‑themed colours** remaining; the choice **persists** and applies **before first
  paint** (no flash); contrast meets **WCAG‑AA** in both themes.
- All new write endpoints enforce roles and validate input (no 500s on bad input); schema migrates
  cleanly; seed populates sections + parameters; `lib/calc.ts` logic is unit‑tested; **backend
  builds + `npm test` pass; frontend builds with no TypeScript errors**; `setup-and-run` scripts
  still work; README updated.

---

## 11. Deliverables

1. Prisma schema + migration/`db push` + extended seed (sections with new default order; QC serials
   1..N).
2. Backend: sections CRUD/reorder endpoints; QC‑parameter CRUD/reorder endpoints; Dashboard
   “failed SLA cases” aggregation — all role‑guarded and validated; tests for any new pure logic.
3. Frontend: data‑driven nav + admin **Sections** management UI; **Manage parameters** on Call QA
   and Case QA; Dashboard **Failed SLA cases** card; **KT OPS joiner selector** (detail on selection).
4. **UI overhaul**: application‑wide visual refresh + animations (with reduced‑motion support) and a
   **complete light/dark theming system** driven by CSS tokens, including themed charts and native
   controls, persisted and flash‑free.
5. Updated types/api helpers/permissions and scoped CSS (design tokens for both themes).
6. Updated README documenting modular sections, parameter management, serial scheme, the SLA card,
   the KT OPS selector, and the theming/animation system.
7. A short summary of key decisions (sections model, deactivate‑vs‑delete for parameters, serial
   scheme, single‑joiner fetch approach, theming/token strategy) and any suggested enhancements you
   implemented vs. skipped.
