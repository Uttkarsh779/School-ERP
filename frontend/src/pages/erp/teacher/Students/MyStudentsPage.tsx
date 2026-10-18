import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Input, Modal, PageHeader, Select, Spinner, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import { useGetMyClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetClassRosterQuery, useGetTeacherStudentOverviewQuery, type ClassRoster } from "../../../../store/api/teaching.api";
import { formatPct, monthLabel, pctTone } from "../../admin/Attendance/attendanceFormat";
import styles from "./MyStudentsPage.module.css";

type Row = ClassRoster["students"][number];

const RESULT_LABEL: Record<string, string> = { PASS: "Pass", FAIL: "Fail", ABSENT: "Absent", PENDING: "Pending", NOT_ENTERED: "—" };
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");

// Students in the classes this teacher teaches. Class teachers see contacts and all marks;
// subject teachers see the roster and their own subjects' marks.
const MyStudentsPage = () => {
  const [params, setParams] = useSearchParams();
  const { data: classes = [], isLoading: classesLoading } = useGetMyClassSectionsQuery();
  const [classId, setClassId] = useState<number | null>(params.get("classSectionId") ? Number(params.get("classSectionId")) : null);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<number | null>(null);

  useEffect(() => {
    if (classId || classes.length === 0) return;
    setClassId(classes[0].id);
  }, [classes, classId]);

  const { data: roster, isFetching, isError, refetch } = useGetClassRosterQuery(classId ?? 0, { skip: !classId });

  const rows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (roster?.students ?? []).filter((s) => !q || s.name.toLowerCase().includes(q) || s.rollNo.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q));
  }, [roster, search]);

  const isClassTeacher = roster?.access === "CLASS_TEACHER";

  const columns: TableColumn<Row>[] = [
    { key: "rollNo", label: "Roll" },
    {
      key: "name",
      label: "Student",
      render: (s) => (
        <button type="button" className={styles.studentCell} onClick={() => setViewing(s.id)}>
          {s.photoUrl ? <img src={s.photoUrl} alt="" className={styles.thumb} /> : <span className={styles.thumbFallback}>{s.name.charAt(0)}</span>}
          <span>
            <span className={styles.name}>{s.name}</span>
            <span className={styles.muted}>Adm {s.admissionNo}</span>
          </span>
        </button>
      ),
    },
    ...(isClassTeacher
      ? [{ key: "contact", label: "Contact", render: (s: Row) => (s.contact ? <a href={`tel:${s.contact}`}>{s.contact}</a> : "—") }]
      : []),
    { key: "attendanceMonth", label: "Attendance (month)", render: (s) => <Badge tone={pctTone(s.attendanceMonth)}>{formatPct(s.attendanceMonth)}</Badge> },
    { key: "attendanceOverall", label: "Overall", render: (s) => formatPct(s.attendanceOverall) },
    {
      key: "exam",
      label: roster?.latestExam ? `${roster.latestExam.name}${isClassTeacher ? "" : " (your subjects)"}` : "Latest exam",
      render: (s) =>
        !s.latestExam ? (
          "—"
        ) : (
          <span>
            {formatPct(s.latestExam.percentage)}{" "}
            <span className={styles.muted}>
              {RESULT_LABEL[s.latestExam.status] ?? s.latestExam.status}
              {s.latestExam.rank ? ` · Rank ${s.latestExam.rank}` : ""}
            </span>
          </span>
        ),
    },
    {
      key: "actions",
      label: "",
      render: (s) => (
        <Button size="sm" variant="outline" onClick={() => setViewing(s.id)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader title="My Students" subtitle="Students in the classes you teach" />

      {classesLoading ? (
        <Spinner />
      ) : classes.length === 0 ? (
        <Card>
          <EmptyState title="No classes yet" description="You'll see students here once you're a class teacher or are allocated a subject." />
        </Card>
      ) : (
        <Card
          title={roster?.classSection?.label ?? "Students"}
          subtitle={
            roster
              ? `${roster.students.length} students · ${isClassTeacher ? "You're the class teacher" : `Class teacher: ${roster.classSection?.classTeacher ?? "not assigned"}`}`
              : undefined
          }
        >
          <div className={styles.filters}>
            <Select
              label="Class"
              value={classId ? String(classId) : ""}
              onChange={(e) => {
                const id = Number(e.target.value);
                setClassId(id);
                setParams({ classSectionId: String(id) }, { replace: true });
              }}
              options={classes.map((c) => ({ label: `${c.className} - ${c.section}`, value: String(c.id) }))}
            />
            <Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, roll or admission no…" />
          </div>
          {isFetching ? (
            <Spinner />
          ) : isError ? (
            <EmptyState title="Couldn't load this class" action={<Button variant="outline" onClick={() => refetch()}>Retry</Button>} />
          ) : (
            <Table columns={columns} data={rows} keyField="id" defaultPageSize={50} emptyMessage="No students match." />
          )}
        </Card>
      )}

      {viewing !== null && <StudentModal studentId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
};

const StudentModal = ({ studentId, onClose }: { studentId: number; onClose: () => void }) => {
  const { data, isLoading, isError } = useGetTeacherStudentOverviewQuery(studentId);
  const [tab, setTab] = useState<"profile" | "attendance" | "exams">("profile");

  return (
    <Modal title={data?.profile.name ?? "Student"} size="lg" onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <p className={styles.muted}>Couldn't load this student.</p>
      ) : (
        <div className={styles.modalBody}>
          <div className={styles.modalHero}>
            {data.profile.photoUrl ? (
              <img src={data.profile.photoUrl} alt="" className={styles.bigThumb} />
            ) : (
              <span className={`${styles.thumbFallback} ${styles.bigThumb}`}>{data.profile.name.charAt(0)}</span>
            )}
            <div>
              <div className={styles.name}>{data.profile.name}</div>
              <div className={styles.muted}>
                {data.profile.classSection} · Roll {data.profile.rollNo} · Adm {data.profile.admissionNo}
              </div>
            </div>
            <Badge tone="info">{formatPct(data.attendance?.overall.percentage ?? null)} attendance</Badge>
          </div>

          <div className={styles.tabs} role="tablist">
            {(["profile", "attendance", "exams"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`} onClick={() => setTab(t)}>
                {t === "profile" ? "Profile" : t === "attendance" ? "Attendance" : "Exams"}
              </button>
            ))}
          </div>

          {tab === "profile" && (
            <dl className={styles.fields}>
              {[
                ["Date of birth", fmtDate(data.profile.dob)],
                ["Gender", data.profile.gender ? data.profile.gender[0] + data.profile.gender.slice(1).toLowerCase() : "—"],
                ["Blood group", data.profile.bloodGroup ?? "—"],
                ["Father", data.profile.fatherName ?? "—"],
                ["Mother", data.profile.motherName ?? "—"],
                ...(data.access === "CLASS_TEACHER"
                  ? [
                      ["Father's phone", data.profile.fatherContact ?? "—"],
                      ["Mother's phone", data.profile.motherContact ?? "—"],
                      ["Student's phone", data.profile.contactNumber ?? "—"],
                      ["Address", data.profile.address ?? "—"],
                    ]
                  : []),
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
              {data.profile.guardians.length > 0 && (
                <div className={styles.full}>
                  <dt>Guardian accounts</dt>
                  <dd>{data.profile.guardians.map((g) => `${g.name}${g.relationship ? ` (${g.relationship})` : ""}${g.contact ? ` · ${g.contact}` : ""}`).join("; ")}</dd>
                </div>
              )}
              {data.access !== "CLASS_TEACHER" && <p className={`${styles.muted} ${styles.full}`}>Family contact details are shown to the class teacher.</p>}
            </dl>
          )}

          {tab === "attendance" &&
            (!data.attendance || data.attendance.sessions.length === 0 ? (
              <p className={styles.muted}>No attendance recorded yet.</p>
            ) : (
              <table className={styles.simpleTable}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Late</th>
                    <th>Leave</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.attendance.sessions.flatMap((s) =>
                    s.months.map((m) => (
                      <tr key={`${s.sessionId}-${m.year}-${m.month}`}>
                        <td>{monthLabel(m.year, m.month)}</td>
                        <td>{m.counts.PRESENT}</td>
                        <td>{m.counts.ABSENT}</td>
                        <td>{m.counts.LATE}</td>
                        <td>{m.counts.LEAVE}</td>
                        <td>
                          <Badge tone={pctTone(m.percentage)}>{formatPct(m.percentage)}</Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ))}

          {tab === "exams" &&
            (data.exams.length === 0 ? (
              <p className={styles.muted}>No marks yet{data.access !== "CLASS_TEACHER" ? " in your subjects" : ""}.</p>
            ) : (
              <div className={styles.examList}>
                {data.exams.map((e) => (
                  <div key={e.examId} className={styles.examCard}>
                    <div className={styles.examHead}>
                      <strong>{e.examName}</strong>
                      <span className={styles.muted}>
                        {e.className}
                        {e.percentage != null && ` · ${e.percentage}%`}
                        {e.rank ? ` · Rank ${e.rank} of ${e.rankedCount}` : ""}
                      </span>
                    </div>
                    <div className={styles.subjectChips}>
                      {e.subjects.map((s) => (
                        <span key={s.subjectId} className={styles.chip}>
                          {s.subjectName}:{" "}
                          {!s.entered ? "—" : s.isAbsent ? "AB" : `${s.marksObtained}/${s.maxMarks}`}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}
    </Modal>
  );
};

export default MyStudentsPage;
