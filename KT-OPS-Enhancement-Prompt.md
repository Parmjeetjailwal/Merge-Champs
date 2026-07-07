# Prompt: Rename "New Joinee KT" → "KT OPS" and Add a Project Access-List Module

> Give this to your AI coding agent. It upgrades the **existing** "New Joinee KT" tab in the
> QA app (`qa-app/`) into a broader **"KT OPS"** module, and adds a new **Access List**
> capability that captures, per project, the accesses a new joinee must be provisioned with.
> **Extend** the current codebase — do **not** rewrite from scratch. Keep the app runnable at
> the end.

---

## 1. Role & Objective

You are a **senior full-stack engineer**. Evolve the current New-Joinee KT tracker into an
operations-focused onboarding hub called **KT OPS** that covers both:

1. **Knowledge transfer** (existing behaviour — keep it working), and
2. **Access provisioning** — a new **Access List** section where a lead selects a **project**
   (CloudOps, VNA, PACS) from a dropdown and sees/manages the standard set of accesses that a
   joinee needs for that project, and tracks whether each access has been **granted**.

Deliver clean, documented, tested code, and update the README.

---

## 2. Existing Application Context (read before changing anything)

- **Backend:** Node.js + Express + TypeScript, Prisma ORM, SQLite. Entry
  `backend/src/index.ts`.
  - KT route: `backend/src/routes/kt.ts` (joinees, topics, templates, Excel upload). This is
    where you add the new Access-List endpoints.
  - Prisma models in `backend/prisma/schema.prisma` include `Joinee`, `KTTopic`,
    `KTTemplate`, `KTTemplateTopic`. Add the new access models here.
  - Roles enforced by `requireRole(...)` in `backend/src/middleware/roles.ts`
    (`Admin`, `QA Lead`, `Call QA Analyst`, `Team Member`). KT writes currently require
    `Admin` / `QA Lead` — keep access-list writes at the same level.
  - Runtime settings via `backend/src/settings.ts` + `config.ts`; seed in
    `backend/prisma/seed.ts`.
- **Frontend:** React + TypeScript + Vite, React Router, Recharts.
  - Page: `frontend/src/pages/KTTracker.tsx` (title "New Joinee KT Tracker").
  - Nav + route registration: `frontend/src/App.tsx`
    (`{ to: '/kt', label: 'New Joinee KT', icon: GraduationCap }` and
    `<Route path="/kt" element={<KTTracker />} />`).
  - Dashboard card references KT (`frontend/src/pages/Dashboard.tsx`).
  - Shared UI: `ui/DataTable.tsx`, `ui/Toast.tsx`, `ui/Confirm.tsx`; axios client
    `frontend/src/api.ts`; permissions `frontend/src/perms.ts` (`can.kt(role)`); types in
    `frontend/src/types.ts`.
- **Ground rules:** match existing file structure/naming/style; every write endpoint enforces
  roles + validates input; update the Prisma schema (`db push`/migration) and **extend the
  seed** so the standard access lists are populated on first run; keep
  `setup-and-run.ps1`/`.sh` working; OWASP basics (input validation, safe file handling), no
  secrets in code.

---

## 3. Part A — Rename to "KT OPS"

Rename the page consistently across the UI **without breaking existing routes or data**:

1. **Nav label** in `frontend/src/App.tsx`: `New Joinee KT` → `KT OPS`.
2. **Page heading** in `KTTracker.tsx`: `New Joinee KT Tracker` → `KT OPS`, and update the
   sub-title to reflect the broader scope, e.g.
   *"Onboarding operations: knowledge transfer and project access provisioning for new
   joinees."*
3. **Dashboard** card label/text referencing "New Joinee KT" → "KT OPS".
4. Keep the route path `/kt` and the `/api/kt/...` endpoints unchanged (avoid a data/URL
   break). Renaming the React component/file is **optional**; if you rename `KTTracker`,
   update all imports. Prefer a low-risk label-only rename unless a full rename is clean.

---

## 4. Part B — Access List module

### 4.1 Data model (Prisma)

Add reference + tracking models. Suggested shape (adapt names to house style):

- **`Project`** — the selectable projects. Fields: `id`, `key` (unique, e.g. `CLOUDOPS`,
  `VNA`, `PACS`), `name` (display), `active` (bool), `order` (int).
- **`AccessItem`** — the standard accesses that belong to a project (the "access list").
  Fields: `id`, `projectId` (FK → Project, cascade), `name`, `order`, `active`.
  Add `@@unique([projectId, name])` to prevent duplicates.
- **`JoineeAccess`** — per-joinee provisioning status. Fields: `id`, `joineeId`
  (FK → Joinee, cascade), `accessItemId` (FK → AccessItem), `status`
  (`Pending | Granted | NA`, default `Pending`), `grantedDate?`, `notes?`, `requestedBy?`.
  Add `@@unique([joineeId, accessItemId])`.

Also add the back-relations on `Project` and `Joinee`.

### 4.2 Seed data (extend `backend/prisma/seed.ts`)

Idempotently upsert the following standard access lists (**de-duplicate** names per project):

- **CloudOps:** JIRA, VPN, Qualis, Azure, mCloud ID, GitHub, SecureLink, Jumpboxes,
  PagerDuty
- **VNA:** SecureLink, Support JIRA, Salesforce, VPN
- **PACS:** SecureLink, Support JIRA, Salesforce, VPN

> Note: the source list for VNA/PACS contained "securelink" twice — store it **once** per
> project.

### 4.3 Backend endpoints (`backend/src/routes/kt.ts`)

Read endpoints open to authenticated users; write endpoints `requireRole('Admin', 'QA Lead')`
and validate all input:

- `GET  /api/kt/projects` — list active projects **with** their access items (ordered).
- `POST /api/kt/projects/:projectId/access-items` — add a new access item to a project.
- `PATCH/DELETE /api/kt/access-items/:id` — rename/deactivate/delete an access item.
- `GET  /api/kt/joinees/:joineeId/access` — joinee's provisioning rows (joined to item/project).
- `POST /api/kt/joinees/:joineeId/access/apply` `{ projectId }` — bulk-create `JoineeAccess`
  rows (status `Pending`) for every active access item in the selected project; skip
  duplicates (idempotent).
- `PATCH /api/kt/joinee-access/:id` `{ status?, grantedDate?, notes? }` — update one row;
  when status becomes `Granted`, default `grantedDate` to now if not supplied.
- `DELETE /api/kt/joinee-access/:id` — remove a provisioning row.

Return computed **access progress** per joinee (granted / total, percent) similar to the
existing `withProgress` helper for KT topics, so the UI can show a completion badge.

### 4.4 Frontend (`frontend/src/pages/KTTracker.tsx` + `types.ts` + `api.ts`)

Add an **Access List** section to the KT OPS page:

1. A **project dropdown** (`<select>`) listing CloudOps / VNA / PACS (from
   `GET /api/kt/projects`). Selecting a project shows its standard access items.
2. Per joinee, an **"Apply access list"** control (dropdown + button) that calls the bulk
   `apply` endpoint, mirroring the existing "apply template" UX.
3. A checklist/table of the joinee's accesses with a **status toggle** (Pending → Granted,
   plus an NA option), optional **granted date** and **notes**, and delete — reuse
   `ui/DataTable`, `ui/Toast`, and `ui/Confirm` and existing styles/classes.
4. Show an **access progress** badge (e.g. `6/9 granted (67%)`) beside each joinee, matching
   the existing KT progress badge style.
5. Gate all editing controls behind `can.kt(role)` (as the page already does).
6. Add the new types to `frontend/src/types.ts` and any client helpers to `api.ts`.

---

## 5. Part C — Suggested enhancements (implement the sensible ones)

Pick the high-value, low-risk improvements and implement them; note any you skip:

- **Admin management of projects & access items** — a small "Manage access lists" card so a
  lead can add/rename/deactivate projects and their access items without a code change
  (seed provides the defaults).
- **Access summary on the Dashboard** — a KT OPS tile showing joinees with outstanding
  (pending) accesses, so nothing is missed on day one.
- **Filter/search** joinees by project or by "has pending access".
- **Excel import/export parity** — allow access status export (and optional import) using the
  existing `lib/import.ts` helpers and template pattern, consistent with KT topic upload.
- **Empty-state & loading polish** for the new section.

Keep enhancements consistent with existing patterns; don't over-engineer.

---

## 6. Acceptance Criteria

- The tab/page/heading/dashboard all read **"KT OPS"**; route `/kt` and `/api/kt/*` still work
  and existing KT data is intact.
- Selecting **CloudOps / VNA / PACS** shows the correct standard access list; applying it to a
  joinee creates the expected provisioning rows (de-duplicated, idempotent on re-apply).
- Access status can be toggled (Pending/Granted/NA) with granted date + notes; progress badge
  updates.
- All write endpoints enforce roles and validate input; no server 500s on bad input.
- `schema.prisma` updated with new models; `seed.ts` populates the three projects and their
  access items; `npx prisma db push` (or a migration) runs cleanly.
- `setup-and-run.ps1` / `setup-and-run.sh` still start the app end-to-end.
- Backend builds/tests pass; frontend builds with no TypeScript errors.
- README updated with a short "KT OPS / Access List" section.

---

## 7. Deliverables

1. Updated Prisma schema + seed (three projects and their access lists).
2. New `/api/kt` access-list endpoints (role-guarded, validated).
3. Renamed, enhanced **KT OPS** page with the Access List UI + new types/api helpers.
4. Dashboard + nav label updates.
5. Brief README section documenting the module and the standard access lists.
6. A short summary of which suggested enhancements you implemented vs. skipped, and why.
