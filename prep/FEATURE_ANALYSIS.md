# School ERP — Feature Analysis

**Scale assumption:** ~500 students, ~20 teachers, single campus, single school (no branches), CBSE board. This is a *small* school, not a multi-branch enterprise — the feature list below is scoped accordingly, with a clear MVP vs. later-phase split so the build stays manageable.

**Confirmed decisions (from discussion):**
- No separate Accountant role — Admin/office staff handles fees.
- School runs its own transport — **build this**, it's a confirmed requirement, not speculative.
- No library currently — **skip for now**, but design the module boundary so it can be switched on later without reworking other modules (see §3.9).
- Public website + online admission workflow — **deferred**. Admin will create student records directly for now; no inquiry/application pipeline yet.
- No budget for paid services right now: use free email (SMTP) for notifications and a free-tier SMS provider if one fits. Most parents will pay fees manually (cash/bank transfer/UPI) with Admin manually confirming/approving each payment in-system — but a **payment gateway should still be offered as an option** for the few parents who'd rather pay online (see §3.7).
- Single academic board (CBSE) — no need to support multiple grading formats.
- Single school, no multi-tenancy needed in the data model.
- Platform: **responsive/mobile-first web app, installable as a PWA** — not a native mobile app. Reasoning: parents are mostly on budget Android phones with patchy rural connectivity; a PWA avoids app-store distribution/update overhead and reuses the existing React frontend, while still giving "add to home screen," offline viewing of key data, and push notifications. Full rationale and build plan in `IMPLEMENTATION_PLAN.md`.

---

## 1. Roles

At this scale, roles can stay lean. Recommend these accounts/role-types:

| Role | Notes |
|---|---|
| **Super Admin** | Principal / school owner. Full access, system settings, final approvals. |
| **Admin / Office Staff** | Day-to-day operations: admissions, fees, notices, staff records. Usually 1–3 people wear this hat. |
| **Teacher** | Attendance, grades, homework, timetable view, messaging parents. |
| **Class Teacher** (a teacher with extra scope) | Everything a Teacher has, plus class-wide oversight (their assigned section only) — not a separate login, just a flag/permission on a Teacher account. |
| **Student** | View-only for most things: timetable, grades, homework, fees, notices. |
| **Parent** | Mirrors Student view for their own child/children (supports 1 parent → multiple children). |

**Confirmed:** no Accountant role — Admin/office staff handles fee collection and approval directly. No Librarian role for now either.

**Recommendation:** five RBAC roles — `SUPER_ADMIN`, `ADMIN`, `TEACHER`, `STUDENT`, `PARENT`. Model "class teacher" as a flag/permission on a `TEACHER` account (assigned-section ownership), not a separate role. This matches the RBAC middleware already scaffolded in `backend/src/middleware`.

---

## 2. Cross-Cutting / Platform Features
*(needed no matter which modules ship first)*

- Authentication: login, JWT access + refresh tokens (already scaffolded), password reset, forced password change on first login.
- Role-based access control (RBAC) enforced on both frontend routes and backend endpoints — **note:** current `protectedRoute.tsx` accepts `allowedRoles` but doesn't enforce it; this must be fixed before any real role separation matters.
- Multi-child parent accounts (one parent login, multiple linked students).
- Notifications: in-app notice board at minimum; email/SMS as phase 2.
- Audit log for sensitive actions (fee edits, grade changes, user role changes).
- Academic year / session management (e.g. "2026-27") — almost everything (classes, fees, attendance, exams) needs to be scoped to a session so year-end rollover doesn't corrupt history.
- Global search (find a student/teacher/fee record quickly).
- i18n (EN/HI) — already present in the codebase, keep using it for parent/student-facing screens.
- Responsive/mobile-friendly UI — many parents will only ever use a phone browser.

---

## 3. Feature List by Module

### 3.1 Student & Admission Management
- Student profile: personal info, contact, address, photo, parent/guardian links, previous school, documents (birth cert, transfer cert).
- Admin creates student records directly (no online inquiry/application pipeline for now — that's deferred with the public website, see §3.13).
- Class & Section setup (e.g. Grade 5 - Section A), subject-to-class mapping.
- Roll number / unique ID generation.
- Bulk import (CSV) for onboarding existing 500 students in one go — **important for launch**, don't make manual-entry-only.
- Student promotion / year-end rollover to next class.
- ID card generation (printable).
- Sibling linking: see §7 for how sibling students and their fee records should be modeled.

### 3.2 Staff / HR Management
- Teacher profile: qualifications, subjects taught, classes assigned, contact, documents.
- Staff attendance (simple in/out or daily present-absent is enough at 20 teachers).
- Leave request & approval workflow.
- Payroll — **keep this basic at first** (fixed monthly salary entries, payslip generation). Full payroll (tax slabs, PF, etc.) is a phase-2/3 concern unless the school explicitly needs it now.

### 3.3 Attendance
- Daily class-wise attendance marking by teacher (present/absent/late/leave).
- Student view of their own attendance %.
- Parent notification on absence (phase 2, via SMS/email/WhatsApp).
- Monthly/term attendance reports, defaulter list (below X% threshold).

### 3.4 Timetable / Scheduling
- Class-wise weekly timetable (subject, teacher, period, room).
- Teacher-wise timetable view (their periods across classes).
- Conflict detection (same teacher/room double-booked).
- Substitute teacher assignment when a teacher is on leave.

### 3.5 Academics — Homework & Syllabus
- Homework/assignment posting per class/subject with due dates and optional file attachment.
- Student/parent view + submission status (submitted/pending), simple file upload for submission.
- Syllabus/lesson-plan tracking per subject (what's been covered vs. planned) — nice-to-have, not MVP.

### 3.6 Examinations & Grading
- Exam/term setup (Unit Test 1, Mid-term, Final, etc.) — CBSE-style term structure (e.g. two terms with periodic tests + a final, as per the school's own scheme).
- Subject-wise marks entry by teachers.
- Auto-calculated grade/percentage, class rank (optional).
- Report card generation (PDF) — this is one of the highest-value features for a school this size; parents and admin will use it constantly.
- Report card template following the school's own CBSE-aligned format (logo, grading scale, remarks) — single fixed template is fine, no need to support multiple boards.

### 3.7 Fee Management
- Fee structure setup per class (tuition, transport, misc — configurable heads).
- Student-wise fee assignment, discounts/scholarships.
- **Two payment paths, both live from the start — manual is the default/majority path, gateway is an option for whoever wants it:**
  1. **Manual (expected majority):** parent pays offline (cash to office, bank transfer, or UPI directly to school account) → parent optionally logs the payment in-app as a "payment claim" pending review (or skips this and Admin just enters it directly — both paths supported) → Admin reconciles against actual bank/cash records and **approves**, which updates the student's fee ledger and generates the receipt (PDF). Only admin-approved entries count as "paid" for defaulter lists/reports.
  2. **Online gateway (optional, minority use):** parent pays directly via an integrated gateway (e.g. Razorpay/similar — most support UPI, cards, netbanking in one integration). On successful payment, the ledger updates and the receipt generates **automatically**, no admin approval step needed since the gateway itself is the source of truth.
  - Both paths write to the exact same `FeePayment` ledger with a `mode` field (`cash`/`bank_transfer`/`upi_manual`/`gateway`) so reporting and defaulter lists don't need to special-case either path.
  - Since gateway usage is expected to be low, prioritize getting the manual+approval flow solid first (§4 MVP); the gateway is additive on the same data model, not a redesign, so it can slot in during Phase 2 whenever convenient.
  - Gateway fees/charges (most providers take a cut per transaction) are the parent's/school's cost to weigh — flagging so it's a conscious choice, not a blocker to including the option.
- Due/defaulter list, payment reminders (manual trigger for now; automated via email/SMS once §3.8 notifications are wired up).
- Basic financial reports: collected vs. pending, daybook, broken down by payment mode.

### 3.8 Communication
- Notice board (school-wide, class-wide, role-targeted).
- Circulars/downloadable documents.
- Direct teacher↔parent messaging (simple threaded messages, not full chat infra) — high value for a school this size where personal communication matters.
- Notifications via **free email (SMTP)** — e.g. school's own Gmail/Google Workspace account or a free-tier transactional email service (Brevo, Resend, etc. all have generous free tiers) for things like fee reminders, absence alerts, new notices.
- SMS: only if a genuinely free-tier provider fits the volume (e.g. promotional/limited free credits from providers like Fast2SMS or MSG91 — these typically cap free volume and may not sustain 500 parents reliably). Treat as a nice-to-have add-on behind the same notification interface as email, not a hard dependency — if no free option is workable at this scale, rely on email + in-app notice board only.
- WhatsApp: out of scope for now (Business API isn't free); revisit only if budget opens up.

### 3.9 Library (deferred, but keep it easy to bolt on later)
- Skip building this now — no current library management need.
- Design note for whoever builds it later: keep Library as a **self-contained module** — its own DB tables/collections, its own controller/routes, its own frontend route group (e.g. `pages/admin/library`) — that only *references* existing entities (Student, Staff) rather than modifying them. That way, turning it on later means adding a module, not refactoring Attendance/Fees/Exams. Don't add any library-related fields to the Student model now "just in case."

### 3.10 Transport (confirmed requirement — build this)
- Route management: define routes/stops.
- Vehicle management: vehicle details, driver/attendant contact info, capacity.
- Student-route/stop assignment (which student rides which route, boards at which stop).
- Transport fee as one of the fee heads in §3.7 (already anticipated — "tuition, transport, misc").
- Basic reports: which students are on which route (useful for attendance-adjacent situations, e.g. bus delay notices).
- Not needed for MVP day one, but should land in Phase 1/early Phase 2 since it's a confirmed, active need — see priority tiers in §4.

### 3.11 Inventory / Assets (optional, low priority)
- School asset tracking (furniture, lab equipment, computers).
- Low priority for a 500-student school unless there's a specific pain point (e.g. lab equipment going missing).

### 3.12 Reports & Dashboards
- Admin dashboard: total students, fee collection %, attendance %, staff count — snapshot view.
- Teacher dashboard: their classes, pending grading/homework review, today's schedule.
- Student/Parent dashboard: attendance %, upcoming exams, fee due, recent notices.
- Exportable reports (PDF/Excel) for admin — school boards/inspections often want printed reports.

### 3.13 Public Website (deferred)
- Homepage, About, Admissions info, Gallery, FAQ, Contact, online admission inquiry form — **deferred**, will build later. The current CMS-derived frontend already has most of this scaffolded, so it's low-risk to postpone; nothing else in this plan depends on it.

---

## 4. Priority Tiers (MoSCoW-style)

**MVP (Phase 1) — the ERP is unusable without these:**
1. Auth + RBAC (fixed properly) + user management
2. Student & Staff profile management + bulk import + sibling linking (§7)
3. Class/Section/Subject setup + academic session model
4. Attendance (daily marking + view)
5. Timetable (view only is fine initially, admin-entered)
6. Exams & report card generation (CBSE-aligned template)
7. Fee management: manual entry/claim + admin-approval workflow + receipts (§3.7)
8. Notice board
9. Basic dashboards per role

**Phase 2 — high value, ship soon after MVP is stable:**
1. Transport management (§3.10) — confirmed need, prioritize this early
2. Online payment gateway as an optional path alongside manual fee entry (§3.7) — low expected usage, but the ledger's already shaped for it, so slot it in once MVP is stable
3. Homework/assignments with submissions
4. Teacher↔parent direct messaging
5. Email notifications (fee reminders, absence alerts, new notices) via free SMTP/transactional-email tier
6. Free-tier SMS, only if a provider proves reliable enough at ~500-parent volume
7. Leave management for staff
8. Substitute teacher handling in timetable

**Phase 3 — nice-to-have, build only if there's real demand:**
1. Public website + online admission inquiry (§3.13)
2. Library management (§3.9) — module boundary kept ready for this from day one
3. Payroll beyond basic payslips
4. Inventory/asset tracking
5. Syllabus/lesson-plan tracking
6. Class rank / advanced analytics

---

## 5. Notes Carried Over From Existing Codebase Analysis

These aren't new features but are prerequisites the ERP build will run into immediately (see `README_PROJECT_ANALYSIS.md` and `FRONTEND_CODE_ANALYSIS.md`):
- `protectedRoute.tsx` doesn't actually enforce `allowedRoles` — must fix before role-specific dashboards mean anything.
- Current backend only has `register`/`login`/`ref-token` — everything in section 3 needs new models/controllers/routes.
- Folder structure should move from flat `pages/` to role-segmented (`pages/admin`, `pages/teacher`, `pages/student`, `pages/parent`) as already proposed in `README_PROJECT_ANALYSIS.md` §5.
- API services should be consolidated via RTK Query `injectEndpoints` rather than one flat file per resource, since this list implies 10+ new resource types.

---

## 6. Decisions Log

All open questions from the first draft are now resolved (see the confirmed-decisions box at the top). Nothing outstanding here for now — new questions will get added as they come up during design/build.

---

## 7. Sibling Students — How to Model Them

**Question:** should siblings be treated as fully independent students, or should their records/receipts be combined?

**Recommendation: independent student records, linked via a shared parent account, with receipts staying per-student by default — plus one combined "family view" for convenience.**

Reasoning:
- Each child has their own roll number, class/section, attendance, grades, exam records, and disciplinary/academic history — these are legally/administratively per-student regardless of family relationship, and CBSE reporting is always per-student anyway.
- **Fees should also be tracked per-student**, not merged into one combined ledger, because:
  - Siblings are often in different classes with different fee structures (different tuition amount, one might have transport and the other not, one might have a sibling/staff discount and the other not).
  - If one sibling leaves the school (transfers out, graduates) the other's records shouldn't be entangled with a shared ledger that now has to be split retroactively.
  - Refunds, discounts, and audit trails are cleaner when every payment maps to exactly one student's ledger.
- **What *should* be combined is the parent-facing view, not the underlying data:**
  - One Parent login, linked to multiple Student records (already planned in §2 as "multi-child parent accounts").
  - A **"Family/Household" dashboard or fee summary page** that lists all linked children's dues side by side, so a parent isn't hopping between accounts to check both kids.
  - When a parent pays for both children at once (e.g. a single bank transfer covering both fees), Admin's approval step (§3.7) should support **splitting one payment entry across multiple student ledgers** — record it as two linked payments (one per student) rather than one ambiguous combined payment, so each student's ledger stays self-consistent even though the money moved in one transaction.
  - Receipts stay **one per student** by default (cleanest for accounting/audit and matches how most schools already do it), but it's easy to also offer a "combined statement" print/export that just lists both students' individual receipts on one page for parent convenience — that's a presentation-layer feature on top of the same underlying per-student data, not a different data model.

**Data model implication:** `Student` records are independent and never merged; a `ParentGuardian` (or `Family`) entity links to N `Student` records; `FeePayment` records always reference exactly one `Student`, even when the source transaction covered multiple children (split it into multiple linked payment rows, optionally tagged with a shared `transactionRef` so Admin can see they came from the same transfer).
