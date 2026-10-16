# School ERP — Implementation Plan

Companion to `FEATURE_ANALYSIS.md`. That doc says *what* to build and in what order; this one says *how*, grounded in what's actually in the repo today.

---

## 1. Current State (verified in-repo, 2026-07-24)

**Backend** (`backend/src`):
- Express + TypeScript, JWT auth scaffolded (`auth.controller.ts`, `auth.routes.ts`, `middleware/auth.ts`).
- `authorizeRoles` middleware already correctly checks `allowedRoles` server-side — no fix needed there.
- No database wired up — `config/db.ts` is a stub, `models/user.model.ts` is an in-memory array. Nothing else exists: no student/staff/attendance/fee models or routes at all.
- Only 3 endpoints exist: register, login, refresh-token.

**Frontend** (`frontend/src`):
- React 18 + TS + Vite, Redux Toolkit + RTK Query, i18n (EN/HI), a small reusable component kit (Button, Input, Select, DataTable, etc.).
- `ProtectedRoute` **already enforces `allowedRoles` correctly** — the bug flagged in the earlier codebase analysis (`README_PROJECT_ANALYSIS.md`) has already been fixed in the current code. No action needed.
- Every existing "admin" page is a **CMS management screen** (FAQ, menus, gallery, sliders, social links, telephonic directory) inherited from the placement-portal origin of this codebase. None of the ERP domain (students, teachers, attendance, fees, etc.) exists yet — it's a real component library + auth shell, not a partial ERP.
- No PWA setup at all (no manifest, no service worker, no `vite-plugin-pwa`).

**Conclusion:** we're building the ERP domain from near-zero on top of solid auth/RBAC/UI-kit scaffolding. The existing CMS admin pages aren't in the way — they'll just sit unrouted/deferred until the public website work (Phase 3 in `FEATURE_ANALYSIS.md`).

---

## 2. New Technical Decisions

### 2.1 Database: PostgreSQL + Prisma
- **Why relational over document store:** fee ledgers, sibling-linked payments, attendance-per-session, exam results — this data is fundamentally relational (foreign keys, joins, transactional integrity on money records). Postgres fits that better than MongoDB here.
- **Why Prisma:** type-safe client generated from a single `schema.prisma`, migrations built in, pairs naturally with the existing TypeScript backend, minimal ceremony for a small team.
- **Hosting for a no-budget rural-school project:** a free tier is enough at this scale (500 students, ~20 staff) — Neon or Supabase both offer a free Postgres instance sized well beyond this school's data volume. Self-hosting on a cheap VPS is the fallback if a managed free tier ever becomes a problem.
- This is a default, not a locked decision — flag if you'd rather use MongoDB or something else before we scaffold the schema.

### 2.2 PWA: `vite-plugin-pwa`
- Adds a web manifest + Workbox-generated service worker to the existing Vite build — no separate app, no store submission.
- **Caching strategy:**
  - App shell (JS/CSS/fonts/icons): `CacheFirst` — loads instantly even on poor connections after the first visit.
  - API GET requests (timetable, notices, attendance %, fee status): `NetworkFirst` with a short timeout, falling back to the last cached response when offline — parents on a weak rural signal still see last-known data instead of a blank error screen.
  - Mutating requests (marking attendance, entering marks, approving payments) are **not** cached or queued for background sync in Phase 1 — that adds real complexity (conflict resolution, retry semantics) that isn't worth it until the read-side offline experience is proven out. Revisit if offline data entry turns out to matter in practice.
- **Install experience:** manifest with proper `name`, `short_name`, `theme_color`, `background_color`, and icons (192px, 512px, plus a maskable icon) so Android's "Add to Home Screen" produces a real app-like icon — this matters more than usual here since many parents will primarily interact via that home-screen icon, not a browser bookmark.
- **Push notifications:** deferred until Phase 2 notifications (§ Phase 2 in `FEATURE_ANALYSIS.md`) — web push needs its own backend piece (VAPID keys + subscription storage) and isn't needed for the MVP.

### 2.3 Mobile-first UI approach
- Build every new ERP screen mobile-first (single-column, touch-sized tap targets, minimal data per screen) and progressively enhance for wider viewports — not the other way around (i.e. not "build desktop, squeeze into mobile" like a lot of admin panels default to).
- Admin/teacher-heavy data-entry screens (attendance grid, marks entry) are the exception: they get a tablet/desktop-optimized layout too, since office staff and teachers will mostly use those on a laptop/tablet at school, not a phone.

### 2.4 Folder restructuring
Adopt the role-segmented structure already proposed in `README_PROJECT_ANALYSIS.md` §5, since we're building the domain from scratch anyway:

```
frontend/src/
├── components/
│   ├── ui/                 # existing reusable kit (Button, Input, Select, DataTable, ...)
│   └── shared/              # cross-role ERP widgets (AttendanceGrid, FeeStatusCard, ...)
├── pages/
│   ├── auth/                # login, password reset
│   ├── admin/                # existing CMS pages stay here, untouched, unrouted for now
│   ├── erp/
│   │   ├── admin/            # student/staff mgmt, fees, transport, notices, reports
│   │   ├── teacher/          # attendance, gradebook, homework, timetable
│   │   ├── student/           # own timetable, grades, homework, fee status
│   │   └── parent/            # per-child views + family fee summary
│   └── public/                 # deferred (Phase 3)
└── store/
    ├── slices/                  # authReducer stays; add uiSlice etc. as needed
    └── api/                      # one erpApi.ts using RTK Query injectEndpoints,
                                    # grouped by domain (students, attendance, fees, ...)
                                    # instead of one file per resource
```

```
backend/src/
├── config/          # db.ts (Prisma client singleton), env
├── prisma/
│   └── schema.prisma
├── modules/          # one folder per domain instead of flat controllers/routes
│   ├── auth/
│   ├── students/
│   ├── staff/
│   ├── attendance/
│   ├── timetable/
│   ├── exams/
│   ├── fees/
│   ├── transport/
│   └── notices/
│       (each: controller.ts, routes.ts, service.ts)
└── middleware/        # existing auth.ts stays
```

---

## 3. Data Model (Phase 1 MVP scope)

Matches `FEATURE_ANALYSIS.md` §4 MVP list + the sibling-handling design in §7.

- `User` — id, email, passwordHash, role (`SUPER_ADMIN`/`ADMIN`/`TEACHER`/`STUDENT`/`PARENT`), name, isActive.
- `AcademicSession` — e.g. "2026-27", isCurrent flag. Everything below scopes to this.
- `ClassSection` — sessionId, className (e.g. "Grade 5"), section (e.g. "A"), classTeacherId (→ User/Teacher).
- `Subject` — name, classSectionId (or class-level, subject-to-class mapping).
- `Student` — userId (nullable if students don't log in independently — decide per your earlier note that young children aren't the actual app users; a Student row can exist purely as a data record linked to a Parent, with its own login optional/Phase 2), name, rollNo, classSectionId, dob, photo, documents, transportRouteId (nullable).
- `ParentGuardian` — userId, name, contact. Links to N students via a join table `ParentStudent` (parentId, studentId) — this is what makes sibling accounts work per §7.
- `Staff` (Teacher) — userId, name, qualifications, subjects (join table `TeacherSubject`), contact.
- `Attendance` — studentId, classSectionId, date, status (present/absent/late/leave), markedByStaffId.
- `Exam` — sessionId, name (e.g. "Term 1"), classSectionId.
- `ExamResult` — examId, studentId, subjectId, marksObtained, maxMarks.
- `FeeStructure` — classSectionId, sessionId, head (tuition/transport/misc), amount.
- `FeePayment` — studentId, feeStructureId, amount, mode (`cash`/`bank_transfer`/`upi_manual`/`gateway`), status (`pending_review`/`approved`), transactionRef (nullable, links split payments per §7), approvedByAdminId, receiptNumber, paidAt.
- `Notice` — title, body, targetRole (nullable = everyone), targetClassSectionId (nullable), postedByUserId, postedAt.
- `TransportRoute` / `Vehicle` — routeName, stops; vehicleNo, driverContact, capacity (Phase 2, but modeled now since transport is confirmed).

Deliberately **not modeled yet** (per Phase 2/3 decisions): Library, Payroll detail beyond a flat salary field, Homework/Syllabus, Timetable table itself (Phase 1 timetable can start as admin-entered static data rendered read-only, formalize the model once the manual process is understood).

---

## 4. Milestones (sequenced, each should be independently shippable/testable)

**M0 — Foundations**
1. Backend: install Prisma + Postgres driver, `prisma init`, write `schema.prisma` for the models in §3, run first migration against a dev DB (needs a connection string from you — local Postgres install or a free Neon/Supabase URL).
2. Frontend: add `vite-plugin-pwa`, manifest, icons, register service worker with the caching strategy in §2.2.
3. Restructure folders per §2.4 (empty/stub files at first, so imports don't break mid-move).
4. Extend `User`/JWT payload to carry role consistently end-to-end (already mostly there).

**M1 — Core directory**
1. Student CRUD + bulk CSV import + class/section/session setup.
2. Staff CRUD.
3. Parent account creation + multi-child linking (`ParentStudent`).
4. Admin dashboards: basic counts (students, staff, classes).

**M2 — Attendance**
1. Teacher: mark daily attendance per class.
2. Student/Parent: view attendance %.
3. Admin: defaulter list, monthly report.

**M3 — Timetable (read-first)**
1. Admin enters weekly timetable per class/section.
2. Teacher/Student/Parent: view-only rendering.
3. Conflict detection + substitute-teacher handling deferred to Phase 2 per `FEATURE_ANALYSIS.md`.

**M4 — Exams & Report Cards**
1. Exam/term setup, marks entry by teachers.
2. Auto-calculated grade/percentage.
3. PDF report card generation (single CBSE-aligned template).

**M5 — Fees**
1. Fee structure setup per class.
2. Manual payment entry + parent-claim + admin-approval flow (§3.7 of `FEATURE_ANALYSIS.md`).
3. Receipt PDF generation.
4. Family fee summary view for parents with multiple linked children.
5. *(Phase 2, not this milestone)* online gateway integration — schema already supports it via `mode`.

**M6 — Notices + Dashboards polish**
1. Notice board (role/class targeted).
2. Round out per-role dashboards (teacher: today's schedule + pending grading; parent/student: attendance/exams/fees/notices at a glance).

**M7 — PWA polish & rural-network hardening**
1. Verify offline fallback behavior on the read-heavy screens (timetable, notices, fee status, attendance %) with network throttled/offline in devtools.
2. Add lightweight "you're offline, showing last-saved data" UI indicator so it's never ambiguous whether data is live.
3. Lighthouse PWA + performance audit, tune bundle size for low-end Android devices.

Transport (§3.10 of `FEATURE_ANALYSIS.md`) slots in as **M8**, right after M6, since it's a confirmed Phase 2 priority — not blocking the MVP milestones above but scheduled immediately after.

---

## 5. M0 Status — Done (2026-07-24)

1. ✅ `schema.prisma` scaffolded with the Phase 1 models from §3, migrated to a live Neon Postgres database (`init_phase1_mvp`), running on Prisma 7 with the `@prisma/adapter-pg` driver adapter (Prisma 7 requires an explicit adapter — no more implicit engine-managed connections).
2. ✅ `vite-plugin-pwa` added to the frontend: manifest + Workbox service worker, `CacheFirst` app shell, `NetworkFirst` for `/api/*` GET requests (5s timeout, falls back to last-cached response offline). Verified with a real `vite build` — generates `sw.js` + `manifest.webmanifest` correctly. Icons are a plain placeholder (`public/pwa-icons/icon.svg`) — swap for the school's real branded 192/512 PNG + maskable icon before real deployment.
3. ✅ Auth migrated from the flat `controllers/`/`routes/`/`models/` files (in-memory mock table) into `src/modules/auth/{service,controller,routes}.ts`, now reading/writing the real `User` table via Prisma. Old dead files removed. `middleware/auth.ts` now types roles from the generated Prisma `Role` enum (fixed a gap where it was missing `SUPER_ADMIN`). Verified end-to-end: server boots, connects to Neon, seeds the default admin (`admin@school.com` / `admin123`), and `/api/users/login` returns a real JWT with the correct role.
4. **Deliberate scope call:** did *not* pre-create empty stub folders for the other Phase 1 domains (students, attendance, exams, fees, etc.) or the frontend's `pages/erp/*` tree. Empty scaffolding with nothing real in it is the kind of premature structure worth avoiding — each domain's module folder gets created when that milestone (M1, M2, ...) is actually built, not before. The `auth` module above is the one real example of the target module shape (`service.ts` / `controller.ts` / `routes.ts`) to follow when building the next one.

**Known pre-existing issue (not introduced by this work, not fixed):** `frontend`'s production build (`npm run build`, which runs `tsc -b` first) currently fails on a long list of type errors in the legacy CMS admin pages (`Admin/socialLink`, `Admin/SubMenu`, `Admin/telephonic`, a `Slider`/`slider` casing collision, etc.) — all pre-dating this session. `vite build` alone (skipping the `tsc -b` gate) succeeds and produces a working PWA build. This will need cleanup before a real production build/deploy pipeline is wired up — worth its own pass, since it's unrelated to the ERP feature work.

## M1 Status — Done (2026-07-24)

Six new backend modules, all following the `auth` module's `service.ts` / `controller.ts` / `routes.ts` shape, all admin-only (`SUPER_ADMIN`/`ADMIN` via `authorizeRoles`):

- **`modules/sessions`** — AcademicSession create/list/set-current.
- **`modules/staff`** — Staff CRUD; creating a staff member creates its linked `User` (role `TEACHER`) in one call.
- **`modules/classSections`** — ClassSection create/list/update, optional class-teacher assignment.
- **`modules/students`** — Student CRUD, plus **bulk CSV import** (`POST /api/students/bulk-import`, multipart file upload via `multer`, parsed with `csv-parse`). Rows are resolved by `className`/`section` against the current session (friendlier for office staff than raw IDs) and processed independently — one bad row doesn't sink the batch, and every row's outcome (imported / reason it failed) comes back in the response.
- **`modules/parents`** — ParentGuardian CRUD with multi-child linking (`studentIds` at creation, plus add/remove endpoints) — this is the sibling-handling design from `FEATURE_ANALYSIS.md` §7 actually wired up: one parent `User`, N independent `Student` records linked via `ParentStudent`.
- **`modules/dashboard`** — admin counts endpoint (active students, active staff, class sections, parents).

**Two real bugs found and fixed while testing against live Neon, not hypothetical:**
1. **Server crashed on the first thrown error.** Express 4 doesn't catch rejected promises from `async` route handlers — an unhandled rejection took the whole process down (surfaced when `setCurrentSession`'s transaction failed, see #2). Fixed with a shared `utils/asyncHandler.ts` wrapper applied to every route across every module, plus a catch-all error middleware in `app.ts`. This was a foundational gap that would have made the API unacceptably fragile in real use — worth fixing immediately rather than noting for later.
2. **`prisma.$transaction([...])` (array/batch form) failed against Neon** with "Unable to start a transaction in the given time" on `setCurrentSession`. Resolved by dropping the wrapping transaction in favor of two sequential statements — defensible here since it's an infrequent admin toggle, not a financial operation; the tiny window between the two calls isn't worth the added complexity. (Flagging in case the same batch-transaction pattern is tempting elsewhere against Neon — worth testing early, and for real financial operations in M5's fee ledger, an interactive `prisma.$transaction(async (tx) => ...)` should be tried and tested against Neon specifically before relying on it.)

**One schema fix along the way:** `Staff` and `ParentGuardian` originally had their own redundant `name` field duplicating `User.name` (a copy-paste artifact from writing the schema off the §3 model list without deduplicating against the linked `User`). Removed via a second migration (`remove_redundant_name_fields`) — caught immediately by the TypeScript compiler once real create calls were written against it, before any real data existed.

**Verified end-to-end against the live Neon database** (not just compiled): logged in as the seeded admin, created a session and set it current, created a teacher (with linked login), created a class section with that teacher assigned, created a student, bulk-imported a CSV with one deliberately-bad row (2/3 imported, the bad row's reason reported back correctly), created a parent linked to two sibling students in one call, confirmed dashboard counts matched, and confirmed a teacher's JWT gets a real 403 on an admin-only endpoint. Test data (1 session, 1 teacher, 3 students, 1 parent) is left in the dev database as a working example — wipe it with `prisma migrate reset` if you'd rather start clean before building more on top.

**Not built in M1** (deliberately out of scope, matching `FEATURE_ANALYSIS.md`): Subject/TeacherSubject (belongs with M4 Exams, since subjects are mainly used for exam results), frontend UI for any of this (M1 was backend-only — the frontend `pages/erp/*` restructuring happens alongside whichever milestone builds its first real screen), forced password-change-on-first-login (noted as a fast-follow, not blocking).

## M2 Status — Done (2026-07-24)

**`modules/attendance`** — mark (bulk, per-class-per-date, partial-success like the CSV import), get-by-class-date, per-student summary (records + %), admin defaulter list (below a threshold), admin monthly report (per-student status counts). Resource-level authorization (not just role-level): a `TEACHER` can only mark/view attendance for the class section they're the assigned class teacher of; a `PARENT` can only view their own linked child's summary (checked via `ParentStudent`, reusing the M1 sibling-linking design); `SUPER_ADMIN`/`ADMIN` can do anything.

**Also done alongside M2, at your request:**
- **Expanded the Student profile** with the real fields an Indian CBSE school record needs: `admissionNo` (permanent, unique — distinct from the class-scoped `rollNo`), `admissionDate`, `gender`, `bloodGroup`, `fatherName`/`fatherContact`, `motherName`/`motherContact`, `aadharNumber` (unique when present), `apaarId` (unique when present), `category` (GENERAL/OBC/SC/ST/EWS — standard RTE/govt-reporting field), `address`, `contactNumber`, `nationality` (defaults `"Indian"`), `previousSchool`. All wired through create, update, and the bulk CSV importer (which now accepts these as optional columns). Verified live against Neon.
- **Fixed a schema design gap surfaced while building this**: `Attendance.markedByStaffId` originally referenced `Staff` only, but `SUPER_ADMIN`/`ADMIN` users aren't `Staff` records — an admin marking/overriding attendance would have had no valid foreign key to write. Changed to `markedByUserId` referencing `User` instead, which is what the actual authorization model requires.
- **Migration mechanics note for future sessions:** `prisma migrate dev` cannot run in this non-interactive shell — any warning (e.g. a new unique constraint) makes it block on a confirmation prompt that never arrives. The working pattern here is: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` to generate the SQL, hand-create the `prisma/migrations/<timestamp>_<name>/migration.sql` file with it, then `prisma migrate deploy` to apply non-interactively. Also: this Neon instance intermittently drops the first connection after being idle (seen 3 times this session as `ECONNREFUSED`/`Connection terminated unexpectedly`/`P1001`) — a bare retry has resolved it every time; not a bug in our code.

**Verified end-to-end against live Neon**: teacher marks attendance for two students (present/absent) in their own class, class-attendance-by-date read back correctly, a parent linked to one of the two students can read that child's summary but gets a clean 403 on the other child, admin's defaulter list correctly flags the 0%-present student against a 75% threshold, admin's monthly report shows correct per-status counts, and a teacher attempting to mark attendance for a class section they don't own gets 403.

**Not built in M2** (deferred, matching `FEATURE_ANALYSIS.md`): parent/absence notifications (Phase 2 email/SMS, not MVP), STUDENT-role read access (students don't have logins yet per the Phase 1 design decision — parents are the read path for now).

## Next: Frontend vs M3

Backend now covers M1 (directory) + M2 (attendance) across 8 modules, but there is still no UI to actually use any of it — confirmed as the priority: build the frontend next so the work so far is demonstrable, then return to M3 (Timetable) or further backend milestones. Given the go-ahead to not be bound by the legacy CMS component kit, the frontend gets a fresh, purpose-built design system rather than reusing the placement-portal-era components.
