import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Icon, Input, Modal, PageHeader, Select, Spinner, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import { useGetMyClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetClassRosterQuery, useGetTeacherStudentOverviewQuery, type ClassRoster } from "../../../../store/api/teaching.api";
import { formatPct, monthLabel, pctTone } from "../../admin/Attendance/attendanceFormat";
import styles from "./MyStudentsPage.module.css";
import StudentSummaryCard from "../../../../components/shared/StudentSummaryCard/StudentSummaryCard";
// Same detail cards as the admin student profile, so both portals look alike.
import card from "../../../../components/shared/StudentProfileView/StudentProfileView.module.css";
import HealthAlertBox, { hasHealthAlert } from "../../admin/Students/records/HealthAlert";
import type { HealthAlert } from "../../../../store/api/studentRecords.api";

const healthSummary = (a: HealthAlert | null) =>
  [a?.allergies && `Allergies: ${a.allergies}`, a?.conditions && `Conditions: ${a.conditions}`, a?.emergencyMedicine && `Emergency medicine: ${a.emergencyMedicine}`, a?.dietary && `Diet: ${a.dietary}`]
    .filter(Boolean)
    .join(" · ");

const ageOf = (dob?: string | null) => {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age -= 1;
  return age >= 0 ? `${age} yrs` : null;
};

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
            <span className={styles.name}>
              {s.name}
              {hasHealthAlert(s.healthAlert) && (
                <span className={styles.healthFlag} title={healthSummary(s.healthAlert)} aria-label={`Health alert: ${healthSummary(s.healthAlert)}`}>
                  <Icon name="heart" size={13} />
                </span>
              )}
            </span>
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
    <Modal title="Student profile" size="lg" onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <p className={styles.muted}>Couldn't load this student.</p>
      ) : (
        <div className={styles.modalBody}>
          <StudentSummaryCard
            heading="h2"
            name={data.profile.name}
            photoUrl={data.profile.photoUrl}
            classLabel={data.profile.classSection}
            meta={`${data.profile.rollNo ? `Roll ${data.profile.rollNo} · ` : ""}Adm ${data.profile.admissionNo}`}
            facts={(() => {
              const pct = data.attendance?.overall.percentage ?? null;
              const latest = data.exams[0];
              return [
                { label: "Attendance", value: formatPct(pct), tone: pct == null ? undefined : pct >= 85 ? "good" : pct >= 75 ? "warn" : "bad", onClick: () => setTab("attendance") },
                { label: latest ? latest.examName : "Latest exam", value: latest?.percentage != null ? `${latest.percentage}%` : "No marks", onClick: () => setTab("exams") },
              ];
            })()}
          />

          <HealthAlertBox alert={data.healthAlert} />

          <div className={styles.tabs} role="tablist">
            {(["profile", "attendance", "exams"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`} onClick={() => setTab(t)}>
                {t === "profile" ? "Profile" : t === "attendance" ? "Attendance" : "Exams"}
              </button>
            ))}
          </div>

          {tab === "profile" && (
            <div className={styles.profileCards}>
              <section className={card.card}>
                <header className={card.cardHead}>
                  <span className={card.cardIcon}>
                    <Icon name="users" size={16} />
                  </span>
                  <h3>Personal</h3>
                </header>
                <div className={card.grid}>
                  {(
                    [
                      ["Date of birth", data.profile.dob ? fmtDate(data.profile.dob) : null, ageOf(data.profile.dob)],
                      ["Gender", data.profile.gender ? data.profile.gender[0] + data.profile.gender.slice(1).toLowerCase() : null, null],
                      ["Blood group", data.profile.bloodGroup, null],
                    ] as const
                  ).map(([label, value, hint]) => (
                    <div key={label} className={card.field}>
                      <span className={card.label}>{label}</span>
                      <span className={`${card.value} ${value ? "" : card.empty}`}>
                        {value || "Not added"}
                        {value && hint && <small className={card.hint}>{hint}</small>}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className={card.card}>
                <header className={card.cardHead}>
                  <span className={card.cardIcon}>
                    <Icon name="familyCheck" size={16} />
                  </span>
                  <h3>Family</h3>
                </header>
                <div className={card.parents}>
                  {(
                    [
                      ["Father", data.profile.fatherName, data.access === "CLASS_TEACHER" ? data.profile.fatherContact : null],
                      ["Mother", data.profile.motherName, data.access === "CLASS_TEACHER" ? data.profile.motherContact : null],
                    ] as ReadonlyArray<readonly [string, string | null | undefined, string | null | undefined]>
                  ).map(([relation, name, phone], i) => (
                    <div key={`${relation}-${i}`} className={card.parent}>
                      <span className={card.parentAvatar}>{(name || relation).charAt(0).toUpperCase()}</span>
                      <span className={card.parentMain}>
                        <small>{relation}</small>
                        <strong className={name ? "" : card.empty}>{name || "Not added"}</strong>
                        {phone && <span className={card.phoneText}>{phone}</span>}
                      </span>
                      {phone && (
                        <a className={card.callBtn} href={`tel:${phone}`} aria-label={`Call ${name || relation}`}>
                          <Icon name="phone" size={16} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
                {data.access === "CLASS_TEACHER" ? (
                  <div className={card.grid} style={{ marginTop: "0.85rem" }}>
                    <div className={card.field}>
                      <span className={card.label}>Student&apos;s phone</span>
                      <span className={`${card.value} ${data.profile.contactNumber ? "" : card.empty}`}>
                        {data.profile.contactNumber ? (
                          <a className={card.link} href={`tel:${data.profile.contactNumber}`}>
                            {data.profile.contactNumber}
                          </a>
                        ) : (
                          "Not added"
                        )}
                      </span>
                    </div>
                    <div className={`${card.field} ${card.wide}`}>
                      <span className={card.label}>Address</span>
                      <span className={`${card.value} ${data.profile.address ? "" : card.empty}`}>{data.profile.address || "Not added"}</span>
                    </div>
                  </div>
                ) : (
                  <p className={styles.privacyNote}>Phone numbers and address are shown to the class teacher.</p>
                )}
              </section>
            </div>
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
