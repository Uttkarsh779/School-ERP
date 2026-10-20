// Student enrollment history: which class a student was in for each academic session.
// Student.classSectionId is always the class *now*; StudentEnrollment keeps one row per
// session so older fees, receipts and records still resolve to the class of that year.

// Records (or refreshes) the student's enrollment for their current class's session.
export const syncCurrentEnrollment = async (db: any, studentId: number) => {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { id: true, rollNo: true, classSectionId: true, classSection: { select: { sessionId: true } } },
  });
  if (!student?.classSection) return null;
  return db.studentEnrollment.upsert({
    where: { studentId_sessionId: { studentId, sessionId: student.classSection.sessionId } },
    update: { classSectionId: student.classSectionId, rollNo: student.rollNo },
    create: { studentId, sessionId: student.classSection.sessionId, classSectionId: student.classSectionId, rollNo: student.rollNo },
  });
};

// The class a student belonged to in a given session: their current class when it is in
// that session, else the enrollment history row, else (no history) the current class.
export const classSectionForSession = async (
  db: any,
  student: { id: number; classSection?: { id: number; sessionId: number; className: string; section: string } | null },
  sessionId: number
) => {
  if (!student.classSection || student.classSection.sessionId === sessionId) return student.classSection ?? null;
  const enrollment = await db.studentEnrollment.findUnique({
    where: { studentId_sessionId: { studentId: student.id, sessionId } },
    include: { classSection: true },
  });
  return enrollment?.classSection ?? student.classSection;
};
