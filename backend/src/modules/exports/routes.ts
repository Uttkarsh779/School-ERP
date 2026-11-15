import { Router, type Response } from "express";
import { authenticateToken, type CustomRequest } from "../../middleware/auth";
import { allow } from "../../config/permissions";
import { asyncHandler } from "../../utils/asyncHandler";
import { createAuditLog } from "../fees/ledgerService";
import { istDate, sendWorkbook, type Sheet } from "./workbook";
import * as svc from "./service";
import { stockRegisterSheets } from "../inventory/service";

// Excel downloads. Each one is permission-checked by area and written to the audit log
// (who downloaded what, when), since these files carry children's personal data.
const router = Router();
router.use(authenticateToken);

const optId = (v: unknown) => (v ? Number(v) || undefined : undefined);

const exportRoute = (kind: string, build: (req: CustomRequest) => Promise<{ filename: string; sheets: Sheet[] }>) =>
  asyncHandler(async (req: CustomRequest, res: Response) => {
    const { filename, sheets } = await build(req);
    await createAuditLog({
      action: `EXPORT_${kind}`,
      entityType: "Export",
      entityId: 0,
      userId: req.user!.id,
      newValues: { filters: req.query, rows: sheets.reduce((n, s) => n + s.rows.length, 0) },
    });
    await sendWorkbook(res, filename, sheets);
  });

router.get(
  "/students",
  allow("exports.students"),
  exportRoute("STUDENTS", async (req) => ({
    filename: `Students_${istDate()}`,
    sheets: await svc.studentsSheet({ classSectionId: optId(req.query.classSectionId), status: String(req.query.status ?? "active") }),
  }))
);
router.get("/udise-students", allow("exports.students"), exportRoute("UDISE", async () => ({ filename: `UDISE_students_${istDate()}`, sheets: await svc.udiseSheets() })));
router.get(
  "/cbse-loc",
  allow("exports.students"),
  exportRoute("CBSE_LOC", async (req) => ({ filename: `CBSE_LOC_Class_X_${istDate()}`, sheets: await svc.cbseLocSheets(optId(req.query.classSectionId)) }))
);
router.get(
  "/attendance",
  allow("exports.students"),
  exportRoute("ATTENDANCE", async (req) => {
    const [cs, y, m] = [Number(req.query.classSectionId), Number(req.query.year), Number(req.query.month)];
    return { filename: `Attendance_${y}-${String(m).padStart(2, "0")}_class${cs}`, sheets: await svc.attendanceSheet(cs, y, m) };
  })
);
router.get("/staff", allow("exports.staff"), exportRoute("STAFF", async () => ({ filename: `Staff_${istDate()}`, sheets: await svc.staffSheet() })));
router.get(
  "/fee-dues",
  allow("exports.fees"),
  exportRoute("FEE_DUES", async (req) => ({ filename: `Overdue_fees_${istDate()}`, sheets: await svc.duesSheet(optId(req.query.classSectionId)) }))
);
router.get(
  "/day-book",
  allow("exports.fees"),
  exportRoute("DAY_BOOK", async (req) => ({
    filename: `Day_book_${req.query.from}${req.query.to && req.query.to !== req.query.from ? `_to_${req.query.to}` : ""}`,
    sheets: await svc.dayBookSheets(req.query.from, req.query.to),
  }))
);

router.get(
  "/marks-register",
  allow("exams.coordinate"),
  exportRoute("MARKS_REGISTER", async (req) => svc.marksRegisterSheets(Number(req.query.examId)))
);
router.get("/transport", allow("exports.students"), exportRoute("TRANSPORT", async () => ({ filename: `Transport_students_${istDate()}`, sheets: await svc.transportSheets() })));
router.get(
  "/inventory",
  allow("inventory.view"),
  exportRoute("INVENTORY", async (req) => ({ filename: `Stock_register_${istDate()}`, sheets: await stockRegisterSheets(req.query.from, req.query.to) }))
);
// The same transport list as JSON, for the printed version (also recorded).
router.get(
  "/transport/rows",
  allow("exports.students"),
  asyncHandler(async (req: CustomRequest, res: Response) => {
    const rows = await svc.transportRiders();
    await createAuditLog({ action: "PRINT_TRANSPORT", entityType: "Export", entityId: 0, userId: req.user!.id, newValues: { rows: rows.length } });
    res.json({ success: true, data: rows });
  })
);

export default router;
