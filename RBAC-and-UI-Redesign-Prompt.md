# Prompt: Remove Jira QA, Introduce Role‑Based Access (RBAC) & Redesign the Full UI

> Give this to your AI coding agent. It operates on the **existing** application in `qa-app/`.
> The goal is threefold: **(1)** fully remove the **Jira QA / QA Scores** feature from the
> entire codebase, **(2)** introduce a proper **role‑based access control (RBAC)** model so each
> role only sees the sections and dashboards it is allowed to, and **(3)** perform a **complete
> UI/UX redesign** of the application to a modern, polished, production‑grade standard.
> **Extend and refactor** the current code — do **not** start a brand‑new project. The app must
> remain fully runnable (`setup-and-run.ps1` / `setup-and-run.sh`) at the end, with tests green.

---

## 1. Role & Objective

You are a **senior full‑stack engineer and product designer**. You will evolve the existing QA
Suite into a cleaner, role‑aware application. Deliver three outcomes:

1. **Remove Jira QA completely** — every trace of the Jira integration and the "QA Scores"
   module (frontend page, routes, backend endpoints, database model, seed data, dashboard
   widgets, types, tests, templates, and docs).
2. **Implement strict, data‑driven RBAC** — each user role sees **only** the navigation tabs,
   routes, and dashboard content it is permitted to access. Enforce this on **both** the
   frontend (hide/guard) and the backend (authorize every endpoint).
3. **Redesign the entire UI** — a modern, accessible, responsive interface with a refreshed
   design system (layout, sidebar, top bar, cards, tables, forms, charts, empty/loading/error
   states, light & dark themes).

Deliver clean, documented, idiomatic code that matches the existing patterns, keep all tests
green (updating/removing Jira‑related tests as needed), and update the READMEs.

---

## 2. Existing Application Context (read before changing anything)

- **Backend:** Node.js + Express + TypeScript, Prisma ORM, SQLite.
  - Entry/wiring: `backend/src/app.ts` mounts all routers under `/api/*`.
  - Routers: `backend/src/routes/*.ts` — including `jira.ts` and `qaScores.ts` (the Jira QA
    feature), plus `dashboard.ts`, `sections.ts`, `users.ts`, `callQa.ts`, `caseQa.ts`,
    `kt.ts`, `maintenance.ts`, `timeUtilization.ts`, `settings.ts`, `auth.ts`, `employees.ts`.
  - RBAC middleware: `backend/src/middleware/roles.ts` exposes
    `ROLES = ['Admin', 'QA Lead', 'Call QA Analyst', 'Team Member']`, `resolveRole(req)`
    (JWT `Authorization: Bearer` first, then `x-role` header for dev), and
    `requireRole(...allowed)`.
  - Auth/JWT helpers: `backend/src/lib/auth.ts`. Excel/CSV import: `backend/src/lib/import.ts`.
  - Prisma schema: `backend/prisma/schema.prisma` (contains the `QAScore` model and
    `jiraTicketKey` field). Seed: `backend/prisma/seed.ts` (creates users, employees, nav
    sections, and QA scores). Template generator: `backend/scripts/make-template.ts`.
  - Tests: `backend/src/app.test.ts` (includes Jira/QA‑score assertions).
- **Frontend:** React + TypeScript + Vite + React Router; icons via `lucide-react`.
  - Shell/nav: `frontend/src/App.tsx` builds the sidebar from `GET /api/sections` (data‑driven
    `NavSection[]`), with a `fallbackNav` and `adminNav`, and defines the `<Routes>`.
  - Auth context: `frontend/src/AuthContext.tsx`; role helper: `frontend/src/RoleContext.tsx`
    (`useRole()` returns the authenticated user's role).
  - Permissions: `frontend/src/perms.ts` (`can.callQa`, `can.caseQa`, `can.kt`,
    `can.maintenance`, `can.uploadTime`, `can.qa`).
  - API client: `frontend/src/api.ts` (`ROLES`, `Role`, axios instance with JWT interceptor).
  - Pages: `frontend/src/pages/*.tsx` — `Dashboard`, `TimeUtilization`, `QAScores` (Jira QA),
    `KTTracker` (KT OPS), `Maintenance`, `CallQA`, `CaseQA`, `Settings`, `Users`, `Login`.
  - Shared UI: `frontend/src/ui/*` (`DataTable`, `TrendChart`, `Toast`, `Confirm`, etc.);
    types in `frontend/src/types.ts`; global styles in `frontend/src/styles.css`.
  - The **Dashboard** renders a **"Jira QA"** KPI and a link to `/qa-scores`.
- **Ground rules:** match existing file structure, naming, and style; every write endpoint must
  enforce roles **and** validate input; keep `setup-and-run.ps1` / `setup-and-run.sh` working;
  observe OWASP basics (authN/authZ on every route, input validation, no secrets in code).

---

## 3. Part A — Remove Jira QA from the Entire Codebase

Remove the Jira integration and the QA Scores module cleanly and completely. Nothing referring
to Jira or `jiraTicketKey` should remain, and the app must build with **zero** dangling imports.

**Backend**
1. Delete the Jira router `backend/src/routes/jira.ts` and remove its mount
   (`app.use('/api/jira', jiraRouter)`) and import from `backend/src/app.ts`.
2. Delete the QA Scores router `backend/src/routes/qaScores.ts` and remove its mount
   (`/api/qa-scores`) and import from `app.ts`.
3. Remove the `qa-scores` entry from the template map in `app.ts` and delete any generated
   `qa-scores-template.xlsx` logic in `backend/scripts/make-template.ts` and the `docs/` file.
4. Prisma: remove the `QAScore` model from `schema.prisma`, remove the `qaScores` relation on
   `Employee`, and add a **migration** (or a documented `prisma db push` + reseed step) so the
   schema is consistent. Remove `qAScore.deleteMany()`, the QA‑score seed loop, and any
   `jiraTicketKey` seed data from `backend/prisma/seed.ts`.
5. Remove Jira/QA‑score dashboard aggregation from `backend/src/routes/dashboard.ts`
   (the `qa` KPI, `deltas.qa`, `/qa-scores/trend` usage). Adjust the dashboard payload/types
   accordingly.
6. Delete or rewrite Jira/QA‑score tests in `backend/src/app.test.ts` so the suite passes.
7. Remove any Jira env references (`JIRA_BASE_URL`, `JIRA_JQL`, `JIRA_EMAIL`,
   `JIRA_API_TOKEN`) from `config.ts`/`.env.example`/README.

**Frontend**
8. Delete `frontend/src/pages/QAScores.tsx` and remove its import + `<Route path="/qa-scores">`
   from `App.tsx`. Remove `qa-scores` from any nav/sections fallback.
9. Remove the **"Jira QA"** KPI card and the `/qa-scores` link/trend from
   `frontend/src/pages/Dashboard.tsx`.
10. Remove `QAScore`, `QAReport`, `QAReportMember`, `QAReportSummary`, and `jiraTicketKey`
    types from `frontend/src/types.ts`, and remove `can.qa` from `frontend/src/perms.ts`.
11. Remove the `qa-scores` nav section from the seed and delete any related section entry.

> **Acceptance for Part A:** a repo‑wide search for `jira`, `Jira`, `JIRA`, `qaScore`,
> `QAScore`, `qa-scores`, and `jiraTicketKey` returns **no functional references** (only
> unrelated historical text, if any). Backend and frontend both compile; `npm test` passes.

---

## 4. Part B — Role‑Based Access Control (RBAC)

Introduce a clear role model where each role sees **only** its permitted tabs, routes, and
dashboard content. RBAC must be enforced **on the backend** (authoritative) and **reflected on
the frontend** (navigation + route guards).

### 4.1 Roles & access matrix
Extend `ROLES` (in **both** `backend/src/middleware/roles.ts` and `frontend/src/api.ts`, keep
them in sync) and implement the following access matrix. Reuse existing role names where they
fit and add the new ones. Use these names (adjust labels only if you document the mapping):

| Role | Dashboard | KT OPS | Time Utilization | Call QA | Case QA | Maintenance | Settings/Users |
|------|:---------:|:------:|:----------------:|:-------:|:-------:|:-----------:|:--------------:|
| **Admin** | ✅ full | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **QA Lead** | ✅ (QA view) | ✅ | ✅ (read) | ✅ | ✅ | — | — |
| **Call QA Analyst** | ✅ (Call/Case view) | — | — | ✅ | ✅ | — | — |
| **Maintenance** *(new)* | ✅ (Maintenance view) | — | — | — | — | ✅ | — |
| **Time Analyst** *(new)* | ✅ (Time view) | — | — | — | — | — | — + Time Utilization ✅ |
| **Trainee / New Joiner** *(new — recently joined)* | ✅ (limited view) | ✅ | — | — | — | — | — |

Rules:
- A **recently joined** user (Trainee) sees **only Dashboard + KT OPS**.
- A **Maintenance** user sees **only Dashboard + Maintenance**.
- A **Time Analyst** sees **only Dashboard + Time Utilization**.
- A **QA Lead** sees **Dashboard + Call QA + Case QA** (with their respective dashboards) plus
  KT OPS and read‑only Time Utilization.
- **Admin** sees everything, including **Settings** and **Users**.
- The **Dashboard is always visible**, but its content is **scoped to the role** — a role only
  sees KPIs/charts for the modules it can access (e.g., Maintenance user sees Maintenance KPIs
  only; QA Lead sees Call/Case QA KPIs; Trainee sees KT progress only).

> If any role naming is ambiguous, **pause and ask one clarifying question** before proceeding;
> otherwise implement the matrix above and document it in the README.

### 4.2 Backend enforcement
- Make navigation **data‑driven per role**. Add an `allowedRoles` (string list) or a
  `role↔section` mapping to the `NavSection` model in `schema.prisma`, and have
  `GET /api/sections` return **only the sections the caller's role may access** (derive the role
  via `resolveRole(req)`). Seed the sections with their `allowedRoles`.
- Guard **every** module endpoint with `requireRole(...)` per the matrix (e.g., Maintenance
  routes require `Admin` or `Maintenance`; Call/Case QA require `Admin`, `QA Lead`, or
  `Call QA Analyst`; KT allows Trainee read; etc.). Reads and writes may differ — writes must be
  at least as strict as reads.
- Scope `GET /api/dashboard` output to the caller's role so it returns only permitted
  KPIs/sections.
- Return `403` with a helpful message when a role calls a forbidden endpoint (reuse the existing
  `requireRole` error shape).

### 4.3 Frontend enforcement
- Centralize the access matrix in `frontend/src/perms.ts` as a single source of truth
  (e.g., `canAccess(role, sectionKey)` plus per‑module helpers). Remove obsolete helpers.
- Build the **sidebar from `GET /api/sections`** (already data‑driven) so users only see
  permitted tabs; keep a role‑filtered `fallbackNav` for the pre‑load state.
- Add **route guards**: unauthorized routes must redirect to the Dashboard (or a friendly
  "No access" state) instead of rendering the page. Ensure Settings/Users remain Admin‑only.
- Scope the **Dashboard** UI to the role (render only the KPI cards/sections the role can see).
- In **Users** (Admin), allow assigning any of the new roles from a dropdown sourced from
  `ROLES`.

### 4.4 Seed & demo accounts
Update `backend/prisma/seed.ts` to create one demo login per role and document them in the
README, e.g.:
`admin@example.com / admin123` (Admin), `qalead@example.com / qalead123` (QA Lead),
`analyst@example.com / analyst123` (Call QA Analyst), plus **new**
`maintenance@example.com`, `time@example.com`, and `trainee@example.com` with clearly
documented passwords. Keep the existing employee seed intact (minus QA scores).

> **Acceptance for Part B:** logging in as each demo user shows exactly the tabs from the matrix;
> deep‑linking to a forbidden route redirects/blocks; forbidden API calls return `403`; the
> Dashboard shows only role‑appropriate content.

---

## 5. Part C — Full UI/UX Redesign

Redesign the entire interface to a modern, cohesive, accessible, production‑grade standard. Keep
React + Vite + `lucide-react`; you may refactor `styles.css` into a clean design‑token system
(CSS variables) or a small set of well‑organized stylesheets. Do **not** introduce a heavy new
UI framework unless justified and lightweight.

Design requirements:
1. **Design system:** define tokens for color, spacing, radius, elevation/shadows, and
   typography; support **light & dark themes** (preserve the existing theme toggle) with
   accessible contrast (WCAG AA).
2. **App shell:** refined collapsible **sidebar** (role‑filtered nav, active states, icons),
   a **top bar** (page title/breadcrumb, search where relevant, theme toggle, user menu with
   role badge + logout), and a responsive content area.
3. **Components:** restyle cards/KPIs, `DataTable` (sticky header, zebra rows, sort, pagination
   or virtualization if large, responsive/stacked on mobile), forms/inputs (clear labels,
   validation states), buttons, badges, tabs, modals (`Confirm`), and toasts.
4. **Dashboard:** a clean, role‑scoped overview with KPI cards, trend charts (`TrendChart`), and
   quick links — visually consistent and uncluttered.
5. **States:** consistent **loading** (skeletons/spinners), **empty**, and **error** states for
   every data view.
6. **Responsiveness & a11y:** works from mobile to desktop; full keyboard navigation, visible
   focus rings, proper ARIA roles/labels, and semantic HTML.
7. **Polish:** subtle, tasteful motion (hover/press/transition), consistent iconography, and a
   coherent brand (keep "QA Suite / Quality Ops" or refine it).

> Redesign **all** pages listed in `frontend/src/pages/` (except the removed `QAScores`) and the
> shared `ui/` components so the look is uniform across the app.

---

## 6. Deliverables

- [ ] Jira QA fully removed (backend routes/model/seed/tests, frontend page/route/KPI/types,
      templates, docs, env) with no dangling references and a clean build.
- [ ] RBAC implemented per the §4.1 matrix, enforced on backend (`requireRole` + role‑scoped
      `/api/sections` and `/api/dashboard`) and reflected on frontend (role‑filtered nav +
      route guards + role‑scoped Dashboard).
- [ ] New roles (`Maintenance`, `Time Analyst`, `Trainee`) added to `ROLES` in both backend and
      frontend and assignable from the Users page; demo accounts seeded and documented.
- [ ] Complete UI redesign with a documented design‑token system, light/dark themes, refreshed
      shell/components/pages, and consistent loading/empty/error states.
- [ ] `backend/src/app.test.ts` (and any new tests) pass; add tests covering RBAC (each role's
      allowed vs. forbidden endpoints and section visibility).
- [ ] `setup-and-run.ps1` / `setup-and-run.sh` still bootstrap and run the app end‑to‑end
      (install, migrate/reseed, build, start).
- [ ] READMEs (`qa-app/README.md` and root `README.md`) updated: role matrix, demo logins,
      removal of Jira QA, and any migration/reseed instructions.

## 7. Constraints & Definition of Done

- **Extend/refactor, don't rewrite the project.** Preserve working modules (KT OPS, Call/Case
  QA, Maintenance, Time Utilization) except where the redesign or RBAC requires changes.
- Every write endpoint enforces roles **and** validates input; every route is authenticated.
- No secrets in code; follow OWASP basics (authZ on all routes, input validation, safe errors).
- TypeScript compiles with no errors; lint is clean; both `npm test` suites pass.
- Keep commits/edits focused and well‑described. If a decision is ambiguous (e.g., exact role
  names or a schema migration approach), make the smallest reasonable assumption, **document it**
  in the README, and proceed.

---

### Quick start for the agent
1. Read §2 and map every Jira/QA‑score reference across backend and frontend.
2. Do **Part A** (removal) first; get a clean compile + green tests.
3. Do **Part B** (RBAC): update `ROLES`, section model/seed, `requireRole` guards, role‑scoped
   dashboard/sections, frontend `perms.ts`, nav, and route guards; add RBAC tests + demo users.
4. Do **Part C** (UI redesign) across the shell, shared `ui/` components, and all pages.
5. Run `setup-and-run.*`, verify each demo role, update READMEs, and confirm the Definition of
   Done.
