# Prompt: Build a Parameter-Driven Call & Case QC Scorecard (Call QA module)

> Give this to your AI coding agent. It upgrades the **existing** Call QA tab in the QA app
> (`qa-app/`) from a fixed 4-parameter form into a **parameter-driven Call & Case QC
> scorecard** that mirrors the team's `Call_QC.xlsx` workbook. **Extend** the current
> codebase — do **not** rewrite from scratch. Keep the app runnable at the end.

---

## 1. Role & Objective

You are a **senior full-stack engineer**. Replace the current Call QA evaluation with a
**Call & Case QC Scorecard** that reproduces the team's Excel QC process:

- A QC analyst clicks a **`+` button** to start a QC for a specific **case**, capturing the
  case details and **who the QC is being assessed for** (the call handler and the case owner).
- The scorecard **lists every QC parameter** (grouped into *Call Handling* and *Case
  Handling*) with a **Yes / No toggle** and a **comment box** beside each parameter (plus an
  **NA / Not Applicable** option, because the workbook allows it).
- When the analyst has answered **all applicable parameters**, the app **auto-calculates the
  Call & Case QC score** (per-section %adherence, overall %adherence, and Pass/Fail against a
  configurable target) and attributes it to the evaluated team member(s).

Deliver clean, documented, tested code, and update the README.

---

## 2. Existing Application Context (read before changing anything)

- **Backend:** Node.js + Express + TypeScript, Prisma ORM, SQLite. Entry
  `backend/src/index.ts`.
  - Call QA route: `backend/src/routes/callQa.ts` (currently 4 fixed scores: opening, info,
    dead-air, closing + two time metrics). This is what you are redesigning.
  - Pure scoring/aggregation lives in `backend/src/lib/calc.ts` (unit-tested in
    `calc.test.ts`) — e.g. `computeCallQaTotal`. Add the new scoring here **with tests**.
  - Prisma models in `backend/prisma/schema.prisma` include `CallQAEvaluation` and
    `Employee`. Excel import helpers in `backend/src/lib/import.ts`; template generation in
    `backend/scripts/make-template.ts`.
  - Roles enforced by `requireRole(...)` in `backend/src/middleware/roles.ts`
    (`Admin`, `QA Lead`, `Call QA Analyst`, `Team Member`). Runtime settings via
    `backend/src/settings.ts` + `config.ts` (DB overrides preferred over `.env`).
- **Frontend:** React + TypeScript + Vite, React Router, Recharts. Call QA page at
  `frontend/src/pages/CallQA.tsx`; shared `ui/DataTable.tsx`, `ui/Toast.tsx`,
  `ui/Confirm.tsx`; axios client `frontend/src/api.ts`; types in `frontend/src/types.ts`.
- **Ground rules:** match existing file structure/naming/style; every new pure calculation
  goes in `lib/calc.ts` with unit tests; every write endpoint enforces roles + validates
  input; update the Prisma schema (`db push`/migration) and **extend the seed** so the new
  scorecard is populated on first run; keep `setup-and-run.ps1`/`.sh` working; OWASP basics
  (input validation, safe file handling), no secrets in code.

---

## 3. The QC Scorecard Definition (source of truth: `Call_QC.xlsx`)

### 3.1 Per-parameter answer model

Each parameter is answered with **one** of three values (the workbook uses a `0 / 3 / NA`
dropdown — reproduce that meaning as a friendly toggle):

| UI answer | Meaning | Points | Counts toward max? |
|---|---|---|---|
| **Yes** | Compliant | 3 | Yes |
| **No** | Not compliant | 0 | Yes |
| **NA** | Not applicable | — | **No** (excluded) |

Each parameter also has an **optional free-text comment**.

### 3.2 Call Handling Parameters — **7 parameters, max score 21**

Assessed for the **"Call handled by"** team member.

1. All call scripts followed?
2. Agent able to understand & paraphrase / narrow down the issue?
3. Site ID / IP address captured?
4. Multiple repetition of issue, IDs, etc. avoided?
5. Call back number captured?
6. Dead Air (more than 5 secs) at the beginning or in between the call?
7. Case is created in due time & case number given to user over call?

### 3.3 Case Handling Parameters — **13 parameters, max score 39**

Assessed for the **"Case Owner"** team member.

8. Issue Subject & Description detailing is enough?
9. First Public Ownership comment made in accepted time?
10. Case Record Type Tagging
11. Case Priority Tagging
12. Related Case Tagging (for integrated servers)
13. System Uptime tagging (for system-down cases)
14. System or Server Profile Tagging
15. Functional Area tagging is correct?
16. L2 Escalation — all details passed on & L2 tagging is done in the case?
17. JIRA / Escalation Tagging
18. Case activities and comments updated regularly?
19. Problem classification, Follow-up classification & Case closure details are updated?
20. Case status is correct?

> Seed these 20 parameters as reference data (see §5) so the list is **data-driven** — an
> admin can later reorder/enable/disable or add parameters without a code change. Preserve
> the two groups (Call Handling / Case Handling) and their display order.

### 3.4 Case header fields (captured when starting a QC)

| Field | Notes |
|---|---|
| `Sr No` | auto-increment per period |
| `Product` | e.g. `VNA`, `PACS` (free text or configurable list) |
| `Case No` | required |
| `Call Date & Time (Five9)` | date-time |
| `Ticket Created Date & Time (Salesforce)` | date-time |
| `User Name` | the customer/user on the case |
| **`Call handled by`** | team member evaluated on **Call Handling** (required) |
| **`Case Owner`** | team member evaluated on **Case Handling** (required) |

### 3.5 Evaluation outputs (auto-computed / captured)

- **Call handling QC Compliance Score** (max 21) and **Call handling %Adherence**.
- **Case handling QC Compliance Score** (max 39) and **Case handling %Adherence**.
- **Overall Call & Case handling %Adherence**.
- **Target** — configurable, default **95%**.
- **Customer / User Escalation for the case?** — Yes / No.
- **QC PASS / FAIL?** — **Pass when Overall %Adherence ≥ Target** (default 95%).
- **Findings** — free text.
- **Action Plan** — free text.

---

## 4. Scoring Logic (put pure functions in `lib/calc.ts` + unit tests)

For a set of answered parameters in a section:

```
applicable      = count of answers where answer ∈ {Yes, No}      // NA excluded
points          = 3 × (count of Yes)
maxPoints       = 3 × applicable
sectionAdherence(%) = applicable === 0 ? null : (points / maxPoints) × 100
                    = applicable === 0 ? null : (#Yes / applicable) × 100
```

- `callScore = 3 × #Yes(call)`, `callMax = 3 × applicable(call)` (max 21 when all 7 apply).
- `caseScore = 3 × #Yes(case)`, `caseMax = 3 × applicable(case)` (max 39 when all 13 apply).
- `overallAdherence(%) = (callScore + caseScore) / (callMax + caseMax) × 100`
  (guard divide-by-zero → `null` / "N/A").
- `passed = overallAdherence !== null && overallAdherence ≥ target`.
- **Round** displayed percentages with the existing `round2` helper; keep raw values for
  aggregation. Preserve deterministic tie-breaking used elsewhere.

**Edge cases to test:** all-NA section (adherence `null`, excluded from overall), a single
`No` dropping below target, mixed NA/Yes/No, all-Yes = 100% Pass, and recompute-on-edit.

---

## 5. Suggested Data Model & API

**Prisma (extend `schema.prisma`, then `db push` + extend seed):**

- `QcParameter` — reference data for the 20 parameters:
  `id`, `code` (e.g. `QC1`), `section` (`CALL` | `CASE`), `text`, `order`, `active`.
- `CallQcEvaluation` (evolve the existing `CallQAEvaluation`, keep backward-compatible or
  migrate): `id`, `srNo`, `product`, `caseNo`, `callDateTime`, `ticketCreatedDateTime`,
  `userName`, `callHandledById` (→ Employee), `caseOwnerId` (→ Employee), `analystId`,
  `customerEscalation` (bool), `callScore`, `callAdherence`, `caseScore`, `caseAdherence`,
  `overallAdherence`, `target`, `passed` (bool), `findings`, `actionPlan`, `period`,
  `createdAt`.
- `CallQcAnswer` — one row per answered parameter:
  `id`, `evaluationId`, `parameterId`, `answer` (`YES` | `NO` | `NA`), `comment?`.

**Endpoints (enforce `requireRole('Admin','Call QA Analyst')` on writes):**

- `GET  /api/call-qa/parameters` — active parameters grouped by section (for the form).
- `POST /api/call-qa` — create an evaluation with its answers; server **recomputes** all
  scores/adherence/pass — never trust client-sent totals.
- `PATCH /api/call-qa/:id` — edit header/answers; **recompute** scores.
- `DELETE /api/call-qa/:id` — delete (with confirm on the client).
- `GET  /api/call-qa?period=YYYY-MM` — list + per-agent and per-parameter analytics.
- `GET  /api/call-qa/trend?from=&to=` — overall %adherence per period.
- Keep/refresh the Excel **import** + **template** endpoints to match the new columns.

**Validation:** `Case No`, `Call handled by`, and `Case Owner` required; block **save/submit
until every parameter has an answer** (Yes/No/NA); reject unknown parameter IDs; sanitize
comments/findings.

---

## 6. UI / UX Requirements (`frontend/src/pages/CallQA.tsx`)

### 6.1 Start a QC — the `+` button

- A prominent **`+` (New QC)** button at the **top** of the Call QA page opens a
  modal/drawer (or dedicated form) to **start a QC for a case**.
- Step 1 captures the **case header** (§3.4), including **"Call handled by"** and
  **"Case Owner"** — the team member(s) the QC is assessed for (Employee pickers).

### 6.2 The scorecard — parameters with Yes/No + comment

- Render **all parameters** in two clearly labelled sections: **Call Handling (7)** and
  **Case Handling (13)**, in the seeded order.
- Each parameter row shows: the **parameter text**, a **Yes / No** toggle (with an **NA**
  option), and a **comment field** alongside it.
- Provide quick helpers: **"Mark all Yes"** per section, and a **progress indicator**
  (e.g. "18 / 20 answered") so the analyst knows when the scorecard is complete.
- A **live score panel** updates as answers change: Call %adherence, Case %adherence, Overall
  %adherence, and a **Pass/Fail** badge vs the target (RAG colouring: green ≥ target).
- **Submit is disabled until all parameters are answered.** On submit, persist and show the
  computed **Call & Case QC score** attributed to the evaluated team member(s); toast on
  success, inline errors on failure.

### 6.3 Log & analytics

- A **log table** (use the shared `DataTable` — searchable/sortable/paginated) of QC
  evaluations for the period: Case No, Product, Call handled by, Case Owner, Call %adh,
  Case %adh, Overall %adh, Pass/Fail, escalation. Row actions: **view / edit / delete**
  (confirm + toast).
- **Per-agent average adherence** (separately for call handling vs case handling, since the
  subjects differ) and a **per-parameter adherence breakdown** to surface the weakest
  parameters (the top improvement area). Optional: filter analytics **by product**
  (the workbook tracks per-product adherence, e.g. VNA vs PACS).
- **Dashboard widget:** current-period average overall %adherence, Pass rate, and the
  lowest-scoring parameter (top improvement area).

Keep loading/empty states, ARIA labels, and mobile-responsive layout consistent with the
rest of the app.

---

## 7. Acceptance Criteria

- The `+` button starts a QC capturing case details **and** the team member(s) assessed
  (call handler + case owner).
- Every parameter renders with a **Yes/No (+NA)** control and a **comment**; the scorecard
  **cannot be submitted until all parameters are answered**.
- Scores match the workbook math: **Yes = 3, No = 0, NA excluded**; section %adherence =
  `#Yes / (#Yes + #No)`; overall = combined; **Pass when overall ≥ target (default 95%)**.
- Scores/adherence/pass are **recomputed server-side** on create **and** edit — client totals
  are never trusted.
- All 20 parameters (7 call + 13 case) are seeded, grouped, and ordered exactly as in §3.
- Log table supports search/sort/pagination; create/edit/delete work with confirm + toast.
- `npm test` (backend) passes including **new scoring unit tests**; backend `tsc` build and
  frontend `tsc --noEmit && vite build` are clean; README updated.

---

## 8. Deliverables

1. Prisma schema + migration/`db push` for `QcParameter`, `CallQcEvaluation`, `CallQcAnswer`;
   extended seed (20 parameters + a few demo evaluations across ≥ 3 periods).
2. New parameter-driven scoring in `lib/calc.ts` with unit tests; updated `callQa.ts` routes
   (create/edit/delete/list/trend/parameters) with role checks + validation.
3. Redesigned `CallQA.tsx`: `+` New-QC flow, Yes/No + comment scorecard, live score panel,
   log table with CRUD, per-agent & per-parameter analytics; dashboard widget update.
4. Refreshed Excel import/template to match the new columns.
5. Passing tests, clean builds, and an updated `README.md`.

**Ask for clarification only where a requirement is genuinely ambiguous; otherwise make a
sensible, documented decision and proceed. Keep the app runnable throughout.**
