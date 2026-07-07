# Prompt: Refine the KT OPS Access List — Topic-Style Listing, Mark Complete & Owner Filter

> Give this to your AI coding agent. It refines the **existing** KT OPS page (`qa-app/`) so the
> **Access List** behaves and looks like the **KT topics** list, adds a **Mark complete**
> action per access, and adds an **owner (name) dropdown** in the access section that shows
> which accesses are **pending vs. complete** for the selected person. Also make the page more
> **compact** so KT and Access sit comfortably together. **Extend** the current code — do
> **not** rewrite from scratch. Keep the app runnable at the end.

---

## 1. Role & Objective

You are a **senior full-stack engineer**. The KT OPS page already tracks, per joinee, both
**KT topics** and a **project Access List** (CloudOps / VNA / PACS). Right now the two
sections look and behave differently. Make the Access List a first-class peer of the KT topic
list:

1. **List each access like a KT topic** — same row layout, status badge, and inline actions.
2. **Add a clear "Mark complete" toggle** per access (mirroring the topic
   *Mark Completed / Mark Pending* behaviour), replacing/clarifying the current
   three-state cycle button.
3. **Add an owner (name) dropdown** in the access section. An admin/lead selects a person and
   the section **reflects that person's accesses** — how many are **pending** and how many are
   **complete** — so they can see their own outstanding access requests at a glance.
4. **Compact the page** so the KT and Access sections fit together neatly per joinee card.

Deliver clean, documented code consistent with the existing patterns, keep tests green, and
update the README.

---

## 2. Existing Application Context (read before changing anything)

- **Backend:** Node.js + Express + TypeScript, Prisma ORM, SQLite.
  - KT/Access routes: `backend/src/routes/kt.ts`. Access endpoints already exist:
    `GET /api/kt/projects`, `POST /api/kt/joinees/:id/access/apply`,
    `PATCH /api/kt/joinee-access/:id` (`status`, `grantedDate`, `notes`),
    `DELETE /api/kt/joinee-access/:id`, plus `GET /api/kt/joinees` returns each joinee with
    `accesses[]` and an `accessProgress` summary.
  - Prisma models in `backend/prisma/schema.prisma`: `Project`, `AccessItem`, and
    **`JoineeAccess`** (`status` = `Pending | Granted | NA`, `grantedDate?`, `notes?`,
    **`requestedBy?`**). Reuse `requestedBy` as the **owner/assignee** field (or add an
    `ownerName`/`ownerId` if cleaner — justify the choice).
  - Employee list available at `GET /api/employees` (`backend/src/routes/employees.ts`) for
    the name dropdown. Reuse it rather than adding a new source.
  - Roles enforced via `requireRole('Admin', 'QA Lead')` in
    `backend/src/middleware/roles.ts`; keep access writes at that level.
  - Seed in `backend/prisma/seed.ts` populates the three project access lists.
- **Frontend:** React + TypeScript + Vite.
  - Page: `frontend/src/pages/KTTracker.tsx` (title "KT OPS"). It already renders KT topics
    and an Access List section per joinee, with `cycleAccess`, `patchAccess`,
    `applyAccessList`, and `deleteAccess` handlers, plus an `AddAccessItem` helper.
  - Types in `frontend/src/types.ts`: `Joinee`, `JoineeAccess`, `AccessStatus`
    (`Pending | Granted | NA`), `Project`, `AccessItem`; `Employee` type also exists.
  - Permissions `frontend/src/perms.ts` (`can.kt(role)`); axios client `frontend/src/api.ts`;
    shared UI `ui/DataTable.tsx`, `ui/Toast.tsx`, `ui/Confirm.tsx`; styles in
    `frontend/src/styles.css`.
- **Ground rules:** match existing file structure/naming/style; every write endpoint enforces
  roles + validates input; keep `setup-and-run.ps1`/`.sh` working; OWASP basics (input
  validation, no secrets in code); if the schema changes, run `db push` and **extend the
  seed**.

---

## 3. Functional Requirements

### 3.1 Topic-style access rows (frontend — `KTTracker.tsx`, `styles.css`)

- Render each `JoineeAccess` using the **same row pattern as KT topics**: a leading status
  **badge**, the access name, contextual meta (project, granted date), and an inline
  **actions** group on the right — visually consistent with the topic `<li>` rows.
- Keep the existing empty state ("No access items yet.") and the per-joinee **progress bar**
  and **badge** already driven by `accessProgress`.

### 3.2 "Mark complete" toggle (frontend + backend semantics)

- Replace the current 3-way cycle with an explicit, topic-like control:
  - A primary **Mark complete / Mark pending** toggle that flips `status` between `Pending`
    and `Granted` (treat **Granted = complete**). When set to complete, default
    `grantedDate` to now (backend already does this on `status: 'Granted'`).
  - Keep **N/A** available as a secondary option (e.g. a small "N/A" button or a compact
    status `<select>`), since some accesses don't apply to every joinee — but the day-to-day
    action must be the single-click *Mark complete*.
- Reuse the existing `PATCH /api/kt/joinee-access/:id` endpoint; no new status values.
  (Optionally relabel the UI text from "Granted" to "Complete" for clarity while keeping the
  stored value `Granted` for backward compatibility — state your choice in the summary.)

### 3.3 Owner (name) dropdown + pending/complete reflection

- Add a **name dropdown** in the access section, populated from `GET /api/employees`
  (fall back to app users if that's more appropriate — justify).
- Selecting a name:
  - **Assigns/attributes** the owner for newly-granted or explicitly-assigned accesses by
    persisting it to `requestedBy` (or the chosen owner field) via the existing PATCH
    endpoint, **and/or**
  - **Filters/summarises** the view to that person: show a compact summary like
    **"Ravi — 4 pending · 5 complete"** reflecting their accesses across the joinee(s).
  - Clearly define and implement the intended behaviour (assignment, filter, or both). Keep it
    intuitive: an admin picks their name and immediately sees what they still owe (pending) vs.
    done (complete).
- If owner attribution requires a schema field beyond `requestedBy`, add it to
  `schema.prisma`, run `db push`, and extend the seed; otherwise reuse `requestedBy`.
- Backend: extend `PATCH /api/kt/joinee-access/:id` to accept the owner field with validation,
  and (if needed) support filtering by owner in the relevant GET.

### 3.4 Compact layout

- Tighten spacing so a joinee card comfortably shows **both** the KT topics and the Access
  List without excessive scrolling — e.g. reduce vertical padding, use denser list rows, and
  consider a **two-column** arrangement (KT topics | Access list) on wide screens that
  collapses to one column on narrow screens.
- Reuse existing CSS variables/classes; add minimal, well-scoped styles in `styles.css`.
  Keep it readable and print-friendly (respect existing `no-print` usage).

---

## 4. Suggested enhancements (implement the sensible ones; note any skipped)

- **Access summary chips** per joinee (e.g. `5/9 complete · 4 pending`) already exist — extend
  with a per-**owner** breakdown when a name is selected.
- **"Mark all complete"** / **"Reset"** bulk actions for a joinee's access list.
- **Filter toggle**: "Show pending only" to focus on outstanding work.
- **Requested-by/owner column** surfaced inline so it's clear who owns each access.
- **Keyboard/enter** friendliness and clear loading/empty states.

Keep enhancements consistent with existing patterns; don't over-engineer.

---

## 5. Acceptance Criteria

- Each access renders in the **same visual style** as a KT topic row (badge + name + inline
  actions).
- A single **Mark complete** click flips an access to complete (stored `Granted`) and sets the
  granted date; it can be toggled back to pending; **N/A** remains available.
- An **owner name dropdown** (from `/api/employees`) is present; selecting a name reflects that
  person's **pending vs. complete** accesses (and/or assigns ownership), persisted via the
  existing PATCH endpoint.
- The joinee card shows **both** KT and Access sections in a **compact** layout (two-column on
  wide screens, single column on narrow).
- All access writes still enforce `Admin` / `QA Lead` roles and validate input; no server 500s
  on bad input.
- If the schema changed: `npx prisma db push` runs cleanly and the seed still populates the
  three project access lists.
- Backend builds + tests pass (`npm run build`, `npm test`); frontend builds with no
  TypeScript errors (`npm run build`); `setup-and-run` scripts still work.
- README's KT OPS section updated to describe mark-complete and the owner dropdown.

---

## 6. Deliverables

1. Updated `KTTracker.tsx` (topic-style access rows, Mark complete toggle, owner dropdown,
   compact two-column layout) + any new types in `types.ts` / helpers in `api.ts`.
2. Backend changes in `kt.ts` (owner field handling / optional filtering), with role guards
   and input validation; schema + seed updates only if a new owner field is required.
3. Minimal, scoped CSS additions in `styles.css`.
4. Updated README KT OPS section.
5. A short summary of decisions (Granted-vs-Complete labelling, owner field choice, whether the
   name dropdown assigns/filters/both) and which suggested enhancements you implemented vs.
   skipped, and why.
