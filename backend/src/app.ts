import express, { type Application, type Request, type Response, type NextFunction } from "express";
import { applySecurity } from "./middleware/security";
import authRouter from "./modules/auth/routes";
import privacyRouter from "./modules/privacy/routes";
import exportsRouter from "./modules/exports/routes";
import sessionsRouter from "./modules/sessions/routes";
import staffRouter from "./modules/staff/routes";
import classSectionsRouter from "./modules/classSections/routes";
import studentsRouter from "./modules/students/routes";
import dashboardRouter from "./modules/dashboard/routes";
import teacherDashboardRouter from "./modules/dashboard/teacherRoutes";
import studentDashboardRouter from "./modules/dashboard/studentRoutes";
import attendanceRouter from "./modules/attendance/routes";
import subjectsRouter from "./modules/subjects/routes";
import timetableRouter from "./modules/timetable/routes";
import examsRouter from "./modules/exams/routes";
import feesRouter from "./modules/fees/routes";
import noticesRouter from "./modules/notices/routes";
import transportRouter from "./modules/transport/routes";
import concessionsRouter from "./modules/concessions/routes";
import assignmentsRouter from "./modules/assignments/routes";
import { publicCmsRouter, adminCmsRouter } from "./modules/cms/routes";
import uploadRouter from "./modules/upload/routes";
import { authenticateToken, authorizeRoles } from "./middleware/auth";
import admissionReportRouter from "./modules/admissionReport/routes";
import constructionRouter from "./modules/construction/routes";
import profileRouter from "./modules/profile/routes";
import teachingRouter from "./modules/teaching/routes";
import leavesRouter from "./modules/leaves/routes";
import certificatesRouter from "./modules/certificates/routes";
import studentRecordsRouter from "./modules/studentRecords/routes";
import inventoryRouter from "./modules/inventory/routes";
import admissionsRouter from "./modules/admissions/routes";
import notificationsRouter from "./modules/notifications/routes";
import accountsRouter from "./modules/accounts/routes";
import calendarRouter from "./modules/calendar/routes";
import settingsRouter from "./modules/settings/routes";
import backupRouter from "./modules/backup/routes";

const app: Application = express();

// Middlewares
applySecurity(app);
// Keep the raw body too: the Razorpay webhook signature is computed over the exact bytes.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf.toString("utf8");
    },
  })
);

// Routes
app.use("/api/upload", uploadRouter);
app.use("/api/public", publicCmsRouter);
// Has public routes (website form), so it must come before the routers mounted at "/api"
// that require a login for every path (fees, concessions, assignments).
app.use("/api/admissions", admissionsRouter); // /public/* = website (no login) · rest = office
app.use("/api/admin/cms", adminCmsRouter);
app.use("/api/users", authRouter);
app.use("/api/privacy", privacyRouter);
app.use("/api/exports", exportsRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/staff", staffRouter);
app.use("/api/class-sections", classSectionsRouter);
app.use("/api/students", studentsRouter);
app.use("/api/dashboard/student", studentDashboardRouter); // must precede the admin-only dashboard router
app.use("/api/dashboard/teacher", teacherDashboardRouter); // must precede the admin-only dashboard router
app.use("/api/dashboard", dashboardRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/subjects", subjectsRouter);
app.use("/api/timetable", timetableRouter);
app.use("/api/exams", examsRouter);
app.use("/api", feesRouter); // fees module's own routes already include /fee-structures, /fee-payments
app.use("/api/notices", noticesRouter);
app.use("/api/transport", transportRouter);
app.use("/api", concessionsRouter); // mounts /api/concessions/...
app.use("/api", assignmentsRouter);
app.use("/api/admission-report", admissionReportRouter); // SUPER_ADMIN only
app.use("/api/construction", constructionRouter); // SUPER_ADMIN only
app.use("/api/profile", profileRouter); // the caller's own account
app.use("/api/teaching", teachingRouter); // TEACHER only
app.use("/api/leaves", leavesRouter);
app.use("/api/certificates", certificatesRouter); // office and Principal
app.use("/api/student-records", studentRecordsRouter); // documents + health · office, Principal; /me for families
app.use("/api/inventory", inventoryRouter); // school stock · office and Accountant
app.use("/api/notifications", notificationsRouter); // the caller's own
app.use("/api/accounts", accountsRouter); // office and Accountant
app.use("/api/calendar", calendarRouter); // view: everyone · manage: office and Principal
app.use("/api/settings", settingsRouter); // signature/seal for printouts · change: Super Admin
app.use("/api/backups", backupRouter); // database backups · Super Admin

import { runFullResetAndSeed } from "./config/seed";
import { publicError } from "./utils/publicError";

// Base route
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Welcome to School ERP API Server" });
});

// DESTRUCTIVE: wipes and reseeds the database. Only available when explicitly enabled for
// local development (ALLOW_SEED_RESET=true, never in production) and only to a Super Admin.
app.post("/api/seed-reset", authenticateToken, authorizeRoles(["SUPER_ADMIN"]), async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_SEED_RESET !== "true") {
    res.status(403).json({ success: false, message: "Database reset is disabled on this server" });
    return;
  }
  try {
    const result = await runFullResetAndSeed();
    res.json({ success: true, message: "Database reset and seeded successfully", data: result });
  } catch (err) {
    next(err);
  }
});

// An address that doesn't exist answers in JSON like everything else.
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: "Not found" });
});

// Catch-all error handler — must be registered last. Every route is wrapped in
// asyncHandler, which forwards thrown/rejected errors here instead of crashing
// the process on an unhandled rejection.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (res.headersSent) return _next(err);
  // Only messages we wrote go to the user; see utils/publicError.ts.
  const { status, message } = publicError(err);
  res.status(status).json({ success: false, message });
});

export default app;
