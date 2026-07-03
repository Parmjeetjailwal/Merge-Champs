# Prompt: Build a Quality Assurance (QA) Management Application

> Copy everything below the divider and give it to your AI coding agent. Adjust the
> **Tech Stack** and **Integration** sections to match your environment if needed.

---

## 1. Role & Objective

You are a **senior full-stack engineer**. Build a production-ready, web-based
**Quality Assurance (QA) Management Application** for an engineering/support team.

The application centers on a **landing page (dashboard)** that surfaces team quality
and productivity metrics across five modules:

1. **Time Utilization** (data imported from Excel)
2. **Jira Ticket QA Scoring** (feeds a report consumed by a downstream **PMI** application)
3. **New Joinee KT (Knowledge Transfer) Tracker**
4. **Maintenance Activity Tracker**
5. **Call QA** (call quality evaluation entered by a Call QA analyst)

Deliver clean, documented, tested code with a clear README and run instructions.

---

## 2. Recommended Tech Stack

> These are recommendations for a concrete, runnable result. Keep them unless you have a
> strong reason to change, and document any deviation.

- **Frontend:** React + TypeScript, Vite, a component library (e.g. MUI or shadcn/ui),
  charts via Recharts or Chart.js.
- **Backend:** Node.js + Express (or NestJS) in TypeScript, REST API.
- **Database:** PostgreSQL (use SQLite for local dev if simpler). Use an ORM (Prisma).
- **Excel parsing:** SheetJS (`xlsx`) on the backend.
- **Report export:** Generate PDF (e.g. `pdfmake`/Puppeteer) **and** structured JSON/CSV
  for the PMI integration.
- **Auth:** Simple role-based auth (Admin / QA Lead / Call QA Analyst / Team Member) with JWT.
- **Testing:** Unit tests (Jest/Vitest) for scoring & aggregation logic; basic e2e for
  key flows.

---

## 3. Global / Landing Page (Dashboard) Requirements

The landing page must render **five summary sections**, each linking to a full detail page:

1. **Time Utilization** — highlight **Top 2** employees by utilization and **Bottom 2**.
2. **QA Score Summary** — average QA score per team member + link to generate report.
3. **New Joinee KT Tracker** — joinees with progress bars (completed vs pending topics).
4. **Maintenance Activity** — current month's **top maintenance performer** and anyone
   who **missed their scheduled timeline**.
5. **Call QA** — average call quality score for the period and the top improvement area.

General UI/UX:

- Responsive layout (desktop-first, usable on tablet).
- Clear cards/widgets with headings, key numbers, and small trend/summary visuals.
- Consistent date/period filter (default: current month) affecting relevant widgets.
- Empty states and loading states for every section.
- Input validation with clear error messages on all forms and uploads.

---

## 4. Module Specifications

### 4.1 Time Utilization

**Purpose:** Track how effectively each employee's time is used, sourced from an Excel upload.

**Input:**
- Admin/QA Lead uploads an **Excel sheet** (`.xlsx`/`.xls`).
- Expected columns (validate headers, show a downloadable template):
  | Column | Type | Notes |
  |---|---|---|
  | `Employee Name` | text | required |
  | `Employee ID` or `Email` | text | required, used to match records |
  | `Team` | text | optional |
  | `Period` | text/date | e.g. `2026-06` (month) or a week label |
  | `Planned Hours` | number | required |
  | `Actual/Billable Hours` | number | required |

- On upload: parse, validate each row, report row-level errors, and upsert records.
- Compute **Utilization % = (Actual/Billable Hours ÷ Planned Hours) × 100**.

**Dedicated "Time Utilization" page must show:**
- A table of all employees with their utilization % for the selected period.
- **Top 2 employees** with the **highest** utilization (clearly highlighted).
- **Bottom 2 employees** with the **lowest** utilization (clearly highlighted).
- A chart (bar) of utilization across the team.
- Period selector to switch months.

**Landing page widget:** compact Top 2 / Bottom 2 list for the current period.

**Acceptance criteria:**
- Uploading a valid sheet updates the page without a manual refresh.
- Invalid rows are reported and do not corrupt existing data.
- Top/Bottom 2 correctly reflect the selected period; ties resolved deterministically
  (e.g. by name) and documented.

---

### 4.2 Jira Ticket QA Scoring → PMI Report

**Purpose:** Record QA scores for Jira tickets per team member, generate a QA report,
and export it for a downstream **PMI application**.

**QA score definition (must be explicit in the UI and code):**
- Score is derived from two factors:
  1. **Timely Response** — was the ticket responded to/resolved within the expected SLA?
  2. **Documentation Quality** — was the ticket properly documented?
- Each factor scored (e.g. 0–5 or 0–50%), combined into a **Total QA Score** (0–100).
  Make the weighting configurable (default: 50% timeliness, 50% documentation).

**Input form (QA Lead):**
- Fields: `Team Member`, `Jira Ticket ID/Key`, `Timeliness Score`, `Documentation Score`,
  auto-calculated `Total Score`, `Evaluation Date`, optional `Comments`.
- Allow bulk entry (add multiple ticket scores in one session) and editing.

**QA Report:**
- Generate a report for a selected period, grouped **per team member**, showing:
  - Number of tickets evaluated, average timeliness, average documentation, average total.
  - Per-ticket breakdown (expandable).
- **Export in two formats:**
  1. **Human-readable PDF** for review.
  2. **Machine-readable JSON/CSV** structured for the **PMI application** (this is the
     data that "will in turn be used in PMI"). Define a clear, stable schema (see §5).
- Provide an **"Send to PMI"** action: either POST to a configurable PMI API endpoint
  (env var `PMI_API_URL`) or produce the export file if no endpoint is configured.
  Mark reports as `exportedToPMI` with a timestamp/reference once sent.

**Landing page widget:** average QA score per team member + button to open/generate report.

**Acceptance criteria:**
- Total score is always consistent with the configured weighting.
- Report aggregations match the underlying ticket records.
- PMI export produces valid, schema-conformant output and records the export status.

---

### 4.3 New Joinee KT (Knowledge Transfer) Tracker

**Purpose:** Track onboarding knowledge transfer for new joinees.

**Data & behavior:**
- Add a **new joinee**: `Name`, `Join Date`, `Team/Mentor` (optional).
- For each joinee, maintain a list of **KT topics covered by the team** (topic name).
- Each topic has a status toggled by **Completed / Pending buttons**.
- Record `completedDate` when a topic is marked Completed.
- Show a **progress indicator** per joinee (e.g. "6/10 topics completed", progress bar).

**Landing page widget:** list of active joinees with their KT progress bars.

**Acceptance criteria:**
- Toggling Completed/Pending updates status and progress immediately and persists.
- Adding/removing topics per joinee works without affecting other joinees.

---

### 4.4 Maintenance Activity Tracker

**Purpose:** Keep a record of maintenance activities and whether they stayed within their
scheduled time, and surface monthly highlights.

**Data model per activity:**
- `Title/Description`, `Assigned Team Member`, `Scheduled Start`, `Scheduled End`,
  `Actual Start`, `Actual End`, `Month` (derived).
- Derive `Scheduled Duration`, `Actual Duration`, and a status:
  - **Within Time** (actual ≤ scheduled) or **Exceeded** (actual > scheduled),
    plus `Exceeded By` (minutes/hours).

**Views & highlights:**
- A table/log of all maintenance activities with their status, filterable by month.
- **Per month, highlight the team member who performed the MOST maintenance activities**
  ("Top Maintainer of the Month").
- **Highlight team members who missed the timeline** (had one or more "Exceeded" activities),
  including which activities and by how much.

**Landing page widget:** current month's top maintainer + anyone who missed timelines.

**Acceptance criteria:**
- Status (Within/Exceeded) is computed correctly from scheduled vs actual times.
- Monthly "top maintainer" counts only that month's activities; ties resolved
  deterministically and documented.
- "Missed timeline" list is accurate for the selected month.

---

### 4.5 Call QA (Call Quality Evaluation)

**Purpose:** Let a **Call QA analyst** evaluate the quality of support/agent calls against
defined call-handling parameters, producing a per-call quality score plus per-agent and
per-parameter trends.

**Input form (Call QA Analyst):**
- Header fields: `Agent/Team Member`, `Call ID/Reference`, `Call Date`, `Analyst`,
  optional `Comments`.
- **Quality parameters** (each scored; make the scale + weighting configurable, e.g. 0–5
  or Pass/Partial/Fail):
  1. **Call Opening** — proper greeting / verification / branding at the start of the call.
  2. **Required Information Captured** — all information needed to create the case was
     collected correctly and completely.
  3. **No Dead Air** — no unexplained silence / dead air during the call (optionally record
     the number of dead-air incidents).
  4. **Call Closing** — proper closing (recap, next steps, courteous sign-off).
- **Time metrics** (captured as durations and compared against configurable thresholds/SLA):
  5. **Case Creation Time** — time taken to create the case; flag if it exceeds the target.
  6. **Call Close Time** — time taken to close/wrap up the call; flag if it exceeds the target.
- Auto-calculate a **Total Call Quality Score** from the scored parameters (weighted), and
  **flag any time metric that breaches its threshold**.

**Call QA page must show:**
- A log of evaluated calls with per-parameter scores, the two time metrics, threshold flags,
  and total score — filterable by agent and period.
- **Average call quality score per agent** and a breakdown **by parameter** to spot weak
  areas (e.g. frequent dead air or slow case creation).
- Highlight calls that breached the **Case Creation Time** or **Call Close Time** thresholds.

**Landing page widget:** average call quality score for the current period and the **top
improvement area** (lowest-scoring parameter across the team).

> Optional (recommended): allow each agent's average call quality score to be included in
> the QA/PMI report alongside their ticket QA score, using the same PMI export mechanism.

**Acceptance criteria:**
- Total score reflects the configured parameter weighting.
- Time metrics (case creation, call close) are flagged correctly when they exceed thresholds.
- Per-agent and per-parameter averages match the underlying call records.

---

## 5. Suggested Data Models

Implement equivalent tables/entities (names flexible):

- **Employee**: `id`, `name`, `email`, `team`, `role`.
- **TimeUtilizationRecord**: `id`, `employeeId`, `period`, `plannedHours`,
  `actualHours`, `utilizationPercent`, `sourceFile`, `uploadedAt`.
- **QAScore**: `id`, `employeeId`, `jiraTicketKey`, `timelinessScore`,
  `documentationScore`, `totalScore`, `evaluationDate`, `evaluatorId`, `comments`.
- **QAReport**: `id`, `period`, `generatedAt`, `exportedToPMI`, `pmiReference`,
  `payload` (the exported structure).
- **Joinee**: `id`, `name`, `joinDate`, `team`, `mentor`.
- **KTTopic**: `id`, `joineeId`, `topicName`, `status` (Pending|Completed), `completedDate`.
- **MaintenanceActivity**: `id`, `title`, `employeeId`, `scheduledStart`,
  `scheduledEnd`, `actualStart`, `actualEnd`, `status` (WithinTime|Exceeded),
  `exceededByMinutes`, `month`.
- **CallQAEvaluation**: `id`, `employeeId` (agent), `callReference`, `callDate`, `analystId`,
  `callOpeningScore`, `infoCapturedScore`, `deadAirScore`, `deadAirIncidents` (optional),
  `callClosingScore`, `caseCreationTimeSecs`, `caseCreationBreached`, `callCloseTimeSecs`,
  `callCloseBreached`, `totalScore`, `comments`, `createdAt`.

**Example PMI export schema (JSON) for the QA report:**
```json
{
  "reportId": "string",
  "period": "2026-06",
  "generatedAt": "ISO-8601",
  "teamMembers": [
    {
      "employeeId": "string",
      "name": "string",
      "ticketsEvaluated": 12,
      "avgTimeliness": 4.2,
      "avgDocumentation": 4.5,
      "avgTotalScore": 87.0,
      "tickets": [
        {
          "jiraTicketKey": "PROJ-123",
          "timelinessScore": 4,
          "documentationScore": 5,
          "totalScore": 90,
          "evaluationDate": "2026-06-10"
        }
      ]
    }
  ]
}
```

---

## 6. Non-Functional Requirements

- **Roles:** Admin (manage users/config), QA Lead (enter scores, upload, generate reports),
  Call QA Analyst (evaluate calls), Team Member (read-only view of their own data). Enforce
  on both API and UI.
- **Validation & security:** validate all inputs; sanitize file uploads; limit upload size
  and accepted MIME types; parameterized DB queries (no SQL injection); no secrets in code
  (use env vars). Follow OWASP Top 10 basics.
- **Error handling:** graceful API errors with meaningful messages; never crash on a bad
  Excel row.
- **Configurability:** QA score weighting, Call QA parameter weighting and time thresholds
  (case creation / call close), SLA thresholds, and `PMI_API_URL` via config/env.
- **Persistence:** all data stored in the database; uploads and generated reports retrievable.
- **Testing:** unit tests for utilization %, QA total-score, maintenance status, and monthly
  aggregation logic.
- **Documentation:** README with setup, environment variables, how to run, seed/demo data,
  and the Excel template + PMI export schema.

---

## 7. Suggested Project Structure

```
qa-app/
  frontend/        # React + TS (dashboard + module pages)
  backend/         # Express/NestJS API, services, Prisma schema
  backend/imports  # Excel parsing & validation
  backend/reports  # QA report generation + PMI export
  docs/            # Excel template, PMI schema, screenshots
  README.md
```

---

## 8. Deliverables

1. Running frontend + backend with the five modules and the dashboard.
2. Seed/demo data so every section is populated on first run.
3. A sample Excel template for Time Utilization import.
4. QA report generation with PDF + PMI-ready JSON/CSV export.
5. Tests for core calculation/aggregation logic.
6. README with full setup and usage instructions.

---

## 9. Build Order (suggested)

1. Project scaffolding, DB schema, auth, base dashboard shell.
2. Time Utilization (Excel import → Top/Bottom 2).
3. QA Scoring + report + PMI export.
4. New Joinee KT Tracker.
5. Maintenance Activity Tracker + monthly highlights.
6. Call QA evaluation module.
7. Dashboard summary widgets wired to each module.
8. Tests, seed data, and README.

**Please ask for any clarification only where a requirement is ambiguous; otherwise make a
sensible, documented decision and proceed.**
