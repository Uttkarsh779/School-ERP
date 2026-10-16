import express, { type Application, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import authRouter from "./modules/auth/routes";
import sessionsRouter from "./modules/sessions/routes";
import staffRouter from "./modules/staff/routes";
import classSectionsRouter from "./modules/classSections/routes";
import studentsRouter from "./modules/students/routes";
import parentsRouter from "./modules/parents/routes";
import dashboardRouter from "./modules/dashboard/routes";
import attendanceRouter from "./modules/attendance/routes";
import subjectsRouter from "./modules/subjects/routes";
import timetableRouter from "./modules/timetable/routes";
import examsRouter from "./modules/exams/routes";
import feesRouter from "./modules/fees/routes";
import noticesRouter from "./modules/notices/routes";
import transportRouter from "./modules/transport/routes";
import concessionsRouter from "./modules/concessions/routes";
import assignmentsRouter from "./modules/assignments/routes";

const app: Application = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/users", authRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/staff", staffRouter);
app.use("/api/class-sections", classSectionsRouter);
app.use("/api/students", studentsRouter);
app.use("/api/parents", parentsRouter);
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

import { runFullResetAndSeed } from "./config/seed";

// Base route
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Welcome to School ERP API Server" });
});

app.post("/api/seed-reset", async (req: Request, res: Response, next: NextFunction) => {
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
