import express, { type Application, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import authRouter from "./modules/auth/routes";
import sessionsRouter from "./modules/sessions/routes";
import staffRouter from "./modules/staff/routes";
import classSectionsRouter from "./modules/classSections/routes";
import studentsRouter from "./modules/students/routes";
import parentsRouter from "./modules/parents/routes";
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

const app: Application = express();

// Middlewares
app.use(cors());
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
app.use("/api/admin/cms", adminCmsRouter);
app.use("/api/users", authRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/staff", staffRouter);
app.use("/api/class-sections", classSectionsRouter);
app.use("/api/students", studentsRouter);
app.use("/api/parents", parentsRouter);
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

import { runFullResetAndSeed } from "./config/seed";

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

// Catch-all error handler — must be registered last. Every route is wrapped in
// asyncHandler, which forwards thrown/rejected errors here instead of crashing
// the process on an unhandled rejection.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const message = err?.message || "Internal server error";
  const statusCode = err?.statusCode || err?.status || 400;
  res.status(statusCode).json({ success: false, message });
});

export default app;
