import { prisma } from "../../config/prisma";
import type { Role } from "../../generated/prisma/enums";
import { httpError } from "../../utils/httpError";

// Homework: create/edit/delete (teachers for what they teach, admins for anything),
// online submissions by students (text and/or a Cloudinary attachment), and teacher review
// (Checked / Redo with a comment, or "handed in on paper").

type Actor = { id: number; role: Role };
const isAdmin = (a: Actor) => a.role === "SUPER_ADMIN" || a.role === "ADMIN";
const ATTACHMENT_RE = /^https:\/\/res\.cloudinary\.com\//;

// Only names leave the API — never full user rows (they carry password hashes).
const baseInclude = {
  classSection: { select: { id: true, className: true, section: true } },
  subject: { select: { id: true, name: true } },
  assignedBy: { select: { id: true, user: { select: { name: true } } } },
};

const staffOf = (userId: number) => prisma.staff.findUnique({ where: { userId }, select: { id: true } });

// May this staff member post homework for this class + subject?
const canTeach = async (staffId: number, classSectionId: number, subjectId: number) => {
  const cs = await prisma.classSection.findUnique({ where: { id: classSectionId }, select: { classTeacherId: true } });
  if (!cs) return false;
  if (cs.classTeacherId === staffId) return true;
  return Boolean(await prisma.teacherSubject.findFirst({ where: { staffId, subjectId, subject: { classSectionId } } }));
};

// May this user see/review submissions of this assignment?
const canReview = async (actor: Actor, assignment: { assignedById: number; classSectionId: number }) => {
  if (isAdmin(actor)) return true;
  const staff = await staffOf(actor.id);
  if (!staff) return false;
  if (assignment.assignedById === staff.id) return true;
  const cs = await prisma.classSection.findUnique({ where: { id: assignment.classSectionId }, select: { classTeacherId: true } });
  return cs?.classTeacherId === staff.id;
};

const endOfDay = (d: Date) => new Date(new Date(d).setHours(23, 59, 59, 999));

export const parseAssignmentInput = (body: Record<string, unknown>, partial = false) => {
  const out: Record<string, unknown> = {};
  const req = (k: string) => !partial || body[k] !== undefined;
  if (req("title")) {
    const t = typeof body.title === "string" ? body.title.trim() : "";
    if (t.length < 3) throw httpError(400, "Title must be at least 3 characters");
    if (t.length > 200) throw httpError(400, "Title is too long");
    out.title = t;
  }
  if (req("description")) {
    const d = typeof body.description === "string" ? body.description.trim() : "";
    if (!d) throw httpError(400, "Add the homework instructions");
    out.description = d;
  }
  if (req("classSectionId")) out.classSectionId = Number(body.classSectionId);
  if (req("subjectId")) out.subjectId = Number(body.subjectId);
  if (req("dueDate")) {
    const d = new Date(String(body.dueDate));
    if (Number.isNaN(d.getTime())) throw httpError(400, "Choose a valid due date");
    out.dueDate = d;
  }
  if (body.endDate !== undefined && body.endDate !== "" && body.endDate !== null) {
    const e = new Date(String(body.endDate));
    if (Number.isNaN(e.getTime())) throw httpError(400, "Choose a valid closing date");
    out.endDate = e;
  }
  if (body.attachmentUrl !== undefined) {
    const a = body.attachmentUrl ? String(body.attachmentUrl) : null;
    if (a && !ATTACHMENT_RE.test(a)) throw httpError(400, "Attach files using the upload button");
    out.attachmentUrl = a;
  }
  if (out.dueDate && out.endDate && (out.endDate as Date) < (out.dueDate as Date)) {
    throw httpError(400, "Closing date can't be before the due date");
  }
  return out;
};

export const listAssignments = async (actor: Actor, filters: { classSectionId?: number; subjectId?: number }) => {
  const where: Record<string, unknown> = {};
  if (actor.role === "STUDENT") {
    const student = await prisma.student.findUnique({ where: { userId: actor.id }, select: { id: true, classSectionId: true } });
    if (!student) return [];
    where.classSectionId = student.classSectionId;
    const rows = await prisma.assignment.findMany({
      where,
      include: { ...baseInclude, submissions: { where: { studentId: student.id } } },
      orderBy: { dueDate: "desc" },
    });
    return rows.map((r: any) => ({ ...r, mySubmission: r.submissions[0] ?? null, submissions: undefined }));
  }

  if (filters.classSectionId) where.classSectionId = filters.classSectionId;
  if (filters.subjectId) where.subjectId = filters.subjectId;
  if (actor.role === "TEACHER") {
    const staff = await staffOf(actor.id);
    if (!staff) return [];
    // Homework they set, plus all homework of classes they're class teacher of.
    where.OR = [{ assignedById: staff.id }, { classSection: { classTeacherId: staff.id } }];
  }
  const rows = await prisma.assignment.findMany({
    where,
    include: {
      ...baseInclude,
      _count: { select: { submissions: true } },
      classSection: { select: { id: true, className: true, section: true, _count: { select: { students: { where: { isActive: true } } } } } },
    },
    orderBy: { dueDate: "desc" },
  });
  const pendingReview = await prisma.homeworkSubmission.groupBy({
    by: ["assignmentId"],
    where: { assignmentId: { in: rows.map((r: any) => r.id) }, status: "SUBMITTED" },
    _count: { _all: true },
  });
  const pendingById = new Map(pendingReview.map((p: any) => [p.assignmentId, p._count._all]));
  return rows.map((r: any) => ({
    ...r,
    stats: { submitted: r._count.submissions, students: r.classSection?._count?.students ?? 0, toReview: pendingById.get(r.id) ?? 0 },
    _count: undefined,
  }));
};

export const createAssignment = async (actor: Actor, body: Record<string, unknown>) => {
  const input = parseAssignmentInput(body) as any;
  const staff = await staffOf(actor.id);
  if (!staff) throw httpError(400, "Your account needs a staff profile to set homework");
  if (!isAdmin(actor) && !(await canTeach(staff.id, input.classSectionId, input.subjectId))) {
    throw httpError(403, "You can only set homework for classes and subjects you teach");
  }
  const subject = await prisma.subject.findUnique({ where: { id: input.subjectId }, select: { classSectionId: true } });
  if (!subject || subject.classSectionId !== input.classSectionId) throw httpError(400, "That subject doesn't belong to this class");
  return prisma.assignment.create({
    data: {
      title: input.title,
      description: input.description,
      classSectionId: input.classSectionId,
      subjectId: input.subjectId,
      assignedById: staff.id,
      dueDate: input.dueDate,
      endDate: input.endDate ?? input.dueDate,
      attachmentUrl: input.attachmentUrl ?? null,
    },
    include: baseInclude,
  });
};

const loadOwned = async (actor: Actor, id: number) => {
  const a = await prisma.assignment.findUnique({ where: { id } });
  if (!a) throw httpError(404, "Homework not found");
  if (!isAdmin(actor)) {
    const staff = await staffOf(actor.id);
    if (!staff || a.assignedById !== staff.id) throw httpError(403, "You can only change homework you set");
  }
  return a;
};

export const updateAssignment = async (actor: Actor, id: number, body: Record<string, unknown>) => {
  const existing = await loadOwned(actor, id);
  const input = parseAssignmentInput(body, true) as any;
  delete input.classSectionId; // moving homework to another class isn't supported — create a new one
  delete input.subjectId;
  const due = input.dueDate ?? existing.dueDate;
  const end = input.endDate ?? existing.endDate;
  if (end < due) throw httpError(400, "Closing date can't be before the due date");
  return prisma.assignment.update({ where: { id }, data: input, include: baseInclude });
};

export const deleteAssignment = async (actor: Actor, id: number) => {
  await loadOwned(actor, id);
  await prisma.assignment.delete({ where: { id } }); // submissions cascade
};

export const listSubmissions = async (actor: Actor, assignmentId: number) => {
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId }, include: baseInclude });
  if (!a) throw httpError(404, "Homework not found");
  if (!(await canReview(actor, a))) throw httpError(403, "You can't view submissions for this homework");
  const [students, subs] = await Promise.all([
    prisma.student.findMany({ where: { classSectionId: a.classSectionId, isActive: true }, orderBy: { rollNo: "asc" }, select: { id: true, name: true, rollNo: true } }),
    prisma.homeworkSubmission.findMany({ where: { assignmentId }, include: { checkedByUser: { select: { name: true } } } }),
  ]);
  const byStudent = new Map(subs.map((s: any) => [s.studentId, s]));
  return {
    assignment: a,
    rows: students.map((st: any) => {
      const s: any = byStudent.get(st.id);
      return {
        studentId: st.id,
        name: st.name,
        rollNo: st.rollNo,
        submission: s
          ? {
              id: s.id,
              text: s.text,
              attachmentUrl: s.attachmentUrl,
              submittedOffline: s.submittedOffline,
              submittedAt: s.submittedAt,
              isLate: s.isLate,
              status: s.status,
              teacherComment: s.teacherComment,
              checkedAt: s.checkedAt,
              checkedBy: s.checkedByUser?.name ?? null,
            }
          : null,
      };
    }),
  };
};

export const submitHomework = async (actor: Actor, assignmentId: number, body: Record<string, unknown>) => {
  const student = await prisma.student.findUnique({ where: { userId: actor.id }, select: { id: true, classSectionId: true } });
  if (!student) throw httpError(400, "Your student record isn't linked yet");
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!a || a.classSectionId !== student.classSectionId) throw httpError(404, "Homework not found");
  const now = new Date();
  if (now > endOfDay(a.endDate)) throw httpError(409, "This homework is closed for submissions");

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const attachmentUrl = body.attachmentUrl ? String(body.attachmentUrl) : null;
  if (attachmentUrl && !ATTACHMENT_RE.test(attachmentUrl)) throw httpError(400, "Attach files using the upload button");
  if (!text && !attachmentUrl) throw httpError(400, "Write your answer or attach a photo/PDF");
  if (text.length > 5000) throw httpError(400, "Answer is too long (max 5000 characters)");

  const existing = await prisma.homeworkSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId: student.id } } });
  if (existing?.status === "CHECKED") throw httpError(409, "Your teacher has already checked this homework");

  const data = { text: text || null, attachmentUrl, submittedOffline: false, submittedAt: now, isLate: now > endOfDay(a.dueDate), status: "SUBMITTED" as const };
  return existing
    ? prisma.homeworkSubmission.update({ where: { id: existing.id }, data })
    : prisma.homeworkSubmission.create({ data: { ...data, assignmentId, studentId: student.id } });
};

// Teacher review: CHECKED / REDO (with comment) or OFFLINE (handed in on paper).
export const reviewSubmission = async (actor: Actor, assignmentId: number, studentId: number, body: Record<string, unknown>) => {
  const a = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!a) throw httpError(404, "Homework not found");
  if (!(await canReview(actor, a))) throw httpError(403, "You can't review this homework");
  const action = String(body.action ?? "");
  if (!["CHECKED", "REDO", "OFFLINE"].includes(action)) throw httpError(400, "action must be CHECKED, REDO or OFFLINE");
  const comment = typeof body.comment === "string" && body.comment.trim() ? body.comment.trim().slice(0, 500) : null;
  if (action === "REDO" && !comment) throw httpError(400, "Tell the student what to fix");

  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { classSectionId: true } });
  if (!student || student.classSectionId !== a.classSectionId) throw httpError(404, "Student not in this class");
  const existing = await prisma.homeworkSubmission.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId } } });

  if (action === "OFFLINE") {
    const now = new Date();
    const data = { submittedOffline: true, submittedAt: now, isLate: now > endOfDay(a.dueDate), status: "CHECKED" as const, teacherComment: comment, checkedAt: now, checkedByUserId: actor.id };
    return existing
      ? prisma.homeworkSubmission.update({ where: { id: existing.id }, data })
      : prisma.homeworkSubmission.create({ data: { ...data, assignmentId, studentId } });
  }
  if (!existing) throw httpError(409, "This student hasn't submitted yet");
  return prisma.homeworkSubmission.update({
    where: { id: existing.id },
    data: { status: action as "CHECKED" | "REDO", teacherComment: comment, checkedAt: new Date(), checkedByUserId: actor.id },
  });
};
