import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  EmptyState,
  FormGrid,
  FormSection,
  Icon,
  Input,
  Modal,
  Select,
  Spinner,
  type SelectOption,
} from "../../../../components/ui";
import StudentProfileView from "../../../../components/shared/StudentProfileView/StudentProfileView";
import {
  useGetStudentByIdQuery,
  useGetStudentHistoryQuery,
  useSetStudentCredentialsMutation,
  useUpdateStudentMutation,
} from "../../../../store/api/students.api";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import {
  useAssignStudentTransportMutation,
  useAssignStudentVillageMutation,
  useGetTransportRoutesQuery,
  useGetVillagesQuery,
} from "../../../../store/api/transport.api";
import StudentFormFields from "./StudentFormFields";
import EndTransportModal from "./EndTransportModal";
import AttendanceHistoryTab from "./history/AttendanceHistoryTab";
import ExamHistoryTab from "./history/ExamHistoryTab";
import FeeHistoryTab from "./history/FeeHistoryTab";
import TransportHistoryTab from "./history/TransportHistoryTab";
import CertificatesTab from "./certificates/CertificatesTab";
import StudentPrivacyTab from "./privacy/StudentPrivacyTab";
import DocumentsTab from "./records/DocumentsTab";
import HealthTab from "./records/HealthTab";
import StudentPhotoModal from "./photos/StudentPhotoModal";
import { useIdCards } from "../../../../components/shared/Print/useIdCards";
import { inr } from "./history/historyFormat";
import historyStyles from "./history/StudentHistory.module.css";
import styles from "./StudentDetailPage.module.css";
import StudentSummaryCard from "../../../../components/shared/StudentSummaryCard/StudentSummaryCard";

// Year-end result recorded by the new-session promotion.
const OUTCOME_BADGE = {
  PROMOTED: { label: "Promoted", tone: "success" },
  DETAINED: { label: "Detained", tone: "warning" },
  PASSED_OUT: { label: "Passed out", tone: "info" },
  LEFT: { label: "Left school", tone: "danger" },
} as const;
import { formatPct } from "../Attendance/attendanceFormat";
import { emptyStudentFormValues, type StudentFormValues } from "./studentForm";
import { useCan } from "../../../../store/permissions";

interface CredentialsFormInputs {
  email?: string;
  password: string;
}

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

const StudentDetailPage = () => {
  const can = useCan();
  const canEdit = can("students.edit"); // the Principal and Accountant view the profile
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const studentId = Number(id);

  const { data: student, isLoading, isError } = useGetStudentByIdQuery(studentId, { skip: !studentId });
  const {
    data: history,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    refetch: refetchHistory,
  } = useGetStudentHistoryQuery(studentId, { skip: !studentId });
  const [tab, setTab] = useState<"overview" | "attendance" | "exams" | "fees" | "transport" | "documents" | "health" | "certificates" | "privacy">("overview");
  const { data: classSections } = useGetClassSectionsQuery();
  const { data: transportRoutes } = useGetTransportRoutesQuery();
  const { data: villages } = useGetVillagesQuery();

  const [setCredentials, { isLoading: isSavingCredentials }] = useSetStudentCredentialsMutation();
  const [updateStudent, { isLoading: isUpdating }] = useUpdateStudentMutation();
  const [assignTransport, { isLoading: isAssigningTransport }] = useAssignStudentTransportMutation();
  const [assignVillage, { isLoading: isAssigningVillage }] = useAssignStudentVillageMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransportModalOpen, setIsTransportModalOpen] = useState(false);
  const [isEndTransportOpen, setIsEndTransportOpen] = useState(false);
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);
  const { printStudents } = useIdCards();

  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [locationSearchQuery, setLocationSearchQuery] = useState<string>("");
  const [selectedVillageId, setSelectedVillageId] = useState<string>("");
  const [transportStartDate, setTransportStartDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [transportPolicy, setTransportPolicy] = useState<"FULL_MONTH" | "PRORATED" | "NEXT_PERIOD">("FULL_MONTH");

  const [loginEmail, setLoginEmail] = useState<string | null>(null);

  const {
    register: credentialsRegister,
    handleSubmit: handleCredentialsSubmit,
    reset: resetCredentials,
    formState: { errors: credentialsErrors },
  } = useForm<CredentialsFormInputs>();

  const {
    register: editRegister,
    handleSubmit: handleEditSubmit,
    reset: resetEditForm,
    formState: { errors: editErrors },
  } = useForm<StudentFormValues>({ defaultValues: emptyStudentFormValues });

  useEffect(() => {
    if (isError) toast.error("Failed to load this student's profile.");
  }, [isError]);

  const classSectionOptions: SelectOption[] = (classSections ?? []).map((cs) => ({
    label: `${cs.className} - ${cs.section}`,
    value: cs.id,
  }));

  const routeOptions: SelectOption[] = [
    { label: "No Route Assigned (Walk / Self)", value: "" },
    ...(transportRoutes ?? []).map((r) => ({
      label: `${r.routeName}${r.stops ? ` — Stops: ${r.stops}` : ""}`,
      value: r.id,
    })),
  ];

  const filteredVillages = (villages ?? [])
    .filter((v) => v.isActive)
    .filter((v) => !locationSearchQuery || v.name.toLowerCase().includes(locationSearchQuery.toLowerCase().trim()));

  const activeVillage = (villages ?? []).find((v) => String(v.id) === selectedVillageId);

  const closeModal = () => {
    setIsModalOpen(false);
    resetCredentials();
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    resetEditForm(emptyStudentFormValues);
  };

  const openEditModal = () => {
    if (student) {
      resetEditForm({
        name: student.name || "",
        rollNo: String(student.rollNo || ""),
        admissionNo: student.admissionNo || "",
        admissionDate: student.admissionDate ? new Date(student.admissionDate).toISOString().split("T")[0] : "",
        classSectionId: student.classSectionId ? String(student.classSectionId) : "",
        dob: student.dob ? new Date(student.dob).toISOString().split("T")[0] : "",
        gender: student.gender || "",
        bloodGroup: student.bloodGroup || "",
        fatherName: student.fatherName || "",
        fatherContact: student.fatherContact || "",
        motherName: student.motherName || "",
        motherContact: student.motherContact || "",
        aadharNumber: student.aadharNumber || "",
        apaarId: student.apaarId || "",
        category: student.category || "",
        address: student.address || "",
        contactNumber: student.contactNumber || "",
        nationality: student.nationality || "",
        previousSchool: student.previousSchool || "",
      });
      setIsEditModalOpen(true);
    }
  };

  const openTransportModal = () => {
    setSelectedRouteId(student?.transportRouteId ? String(student.transportRouteId) : "");
    setLocationSearchQuery("");
    setSelectedVillageId("");
    setTransportStartDate(new Date().toISOString().split("T")[0]);
    setIsTransportModalOpen(true);
  };

  const onCredentialsSubmit = async (values: CredentialsFormInputs) => {
    try {
      const result = await setCredentials({
        id: studentId,
        email: values.email || undefined,
        password: values.password,
      }).unwrap();
      toast.success("Student login saved");
      setLoginEmail(result.email);
      closeModal();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to set student login"));
    }
  };

  const onEditSubmit = async (values: StudentFormValues) => {
    if (!values.classSectionId) {
      toast.error("Please select a class section.");
      return;
    }

    try {
      await updateStudent({
        id: studentId,
        name: values.name,
        rollNo: values.rollNo,
        admissionNo: values.admissionNo,
        admissionDate: values.admissionDate || undefined,
        classSectionId: Number(values.classSectionId),
        dob: values.dob || undefined,
        gender: values.gender ? (values.gender as any) : undefined,
        bloodGroup: values.bloodGroup || undefined,
        fatherName: values.fatherName || undefined,
        fatherContact: values.fatherContact || undefined,
        motherName: values.motherName || undefined,
        motherContact: values.motherContact || undefined,
        aadharNumber: values.aadharNumber || undefined,
        apaarId: values.apaarId || undefined,
        category: values.category ? (values.category as any) : undefined,
        address: values.address || undefined,
        contactNumber: values.contactNumber || undefined,
        nationality: values.nationality || undefined,
        previousSchool: values.previousSchool || undefined,
      }).unwrap();

      toast.success("Student profile updated successfully.");
      closeEditModal();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update student profile."));
    }
  };

  const onTransportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 1. Assign/Unassign Bus Route
      await assignTransport({
        studentId,
        transportRouteId: selectedRouteId ? Number(selectedRouteId) : null,
      }).unwrap();

      // 2. Assign Transport Village/Location Fee Rate if selected
      if (selectedVillageId) {
        await assignVillage({
          studentId,
          villageId: Number(selectedVillageId),
          startDate: transportStartDate,
          policy: transportPolicy,
        }).unwrap();
      }

      toast.success("Student transport route & location fee saved successfully.");
      setIsTransportModalOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save transport assignment."));
    }
  };

  return (
    <div>
      <button type="button" className={styles.back} onClick={() => navigate(-1)}>
        <Icon name="arrowLeft" size={16} /> Back
      </button>

      {loginEmail && (
        <div className={styles.loginSaved}>
          <Icon name="check" size={16} />
          <span>
            Login saved. This student can sign in with <strong>{loginEmail}</strong> (or admission number <strong>{student?.admissionNo}</strong>) and the
            password you just set.
          </span>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : !student ? (
        <EmptyState title="Student not found" description="This student record may have been removed." />
      ) : (
        <>
          {/* Profile header: who, which class, quick actions, and the record at a glance */}
          <StudentSummaryCard
            heading="h1"
            name={student.name}
            photoUrl={student.photoUrl}
            classLabel={student.classSection ? `${student.classSection.className} - ${student.classSection.section}` : null}
            badge={<Badge tone={student.isActive ? "success" : "neutral"}>{student.isActive ? "Active" : "Inactive"}</Badge>}
            meta={`${student.rollNo ? `Roll ${student.rollNo} · ` : ""}Adm ${student.admissionNo}`}
            onPhotoClick={canEdit ? () => setIsPhotoOpen(true) : undefined}
            photoLabel={student.photoUrl ? "Change" : "Add photo"}
            facts={(() => {
              const pct = history?.attendance.overall.percentage ?? null;
              const latest = history?.exams[0];
              const due = history ? Number(history.fees.summary.totalOutstanding) : null;
              const transport =
                history?.transport.find((t) => t.status === "ACTIVE")?.villageName ?? (student.transportRoute ? student.transportRoute.routeName : null);
              // Tap a figure to open its tab
              return [
                {
                  label: "Attendance",
                  value: history ? formatPct(pct) : "…",
                  sub: "overall",
                  tone: pct == null ? undefined : pct >= 85 ? "good" : pct >= 75 ? "warn" : "bad",
                  onClick: () => setTab("attendance"),
                },
                {
                  label: "Latest exam",
                  value: latest?.percentage != null ? `${latest.percentage}%` : history ? "No marks" : "…",
                  sub: latest?.examName,
                  onClick: () => setTab("exams"),
                },
                {
                  label: "Fees due",
                  value: due == null ? "…" : due > 0 ? inr(due) : "No dues",
                  tone: due == null ? undefined : due > 0 ? "bad" : "good",
                  onClick: () => setTab("fees"),
                },
                { label: "Transport", value: transport ?? "Not using", sub: transport ? "active" : undefined, onClick: () => setTab("transport") },
              ];
            })()}
          >
            <div className={styles.actions}>
              {canEdit && (
                <>
                  <Button size="sm" variant="outline" icon={<Icon name="edit" size={15} />} onClick={openEditModal}>
                    Edit profile
                  </Button>
                  <Button size="sm" variant="outline" icon={<Icon name="bus" size={15} />} onClick={openTransportModal}>
                    Transport
                  </Button>
                  <Button size="sm" variant="outline" icon={<Icon name="badge" size={15} />} onClick={() => setIsModalOpen(true)}>
                    Set login
                  </Button>
                </>
              )}
              {can("certificates") && (
                <Button size="sm" variant="outline" icon={<Icon name="fileText" size={15} />} onClick={() => setTab("certificates")}>
                  Certificates
                </Button>
              )}
              {canEdit && (
                <Button size="sm" variant="outline" icon={<Icon name="printer" size={15} />} onClick={() => printStudents([student])}>
                  ID card
                </Button>
              )}
              {canEdit && (history?.transport.some((t) => t.status === "ACTIVE") || student.transportRoute) && (
                <Button size="sm" variant="ghost" icon={<Icon name="close" size={15} />} onClick={() => setIsEndTransportOpen(true)}>
                  End transport
                </Button>
              )}
              {student.fatherContact && (
                <a className={styles.callLink} href={`tel:${student.fatherContact}`}>
                  <Icon name="phone" size={15} /> Call father
                </a>
              )}
            </div>
          </StudentSummaryCard>

          <div className={historyStyles.tabs} role="tablist">
            {(
              [
                ["overview", "Overview"],
                ["attendance", "Attendance"],
                ["exams", "Exams & Marks"],
                ["fees", "Fees"],
                ["transport", "Transport"],
                ["documents", "Documents"],
                ["health", "Health"],
                ["certificates", "Certificates"],
                ["privacy", "Privacy"],
              ] as const
            )
              .filter(
                ([key]) =>
                  (key !== "certificates" || can("certificates")) &&
                  (key !== "privacy" || can("privacy.manage")) &&
                  (key !== "documents" || can("documents.view")) &&
                  (key !== "health" || can("health.view"))
              )
              .map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`${historyStyles.tabBtn} ${tab === key ? historyStyles.tabActive : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "overview" ? (
            <div className={historyStyles.tab}>
              {history && history.academicHistory.length > 0 && (
                <section className={styles.historyCard}>
                  <header className={styles.historyHead}>
                    <span className={styles.historyIcon}>
                      <Icon name="graduationCap" size={16} />
                    </span>
                    <h3>Academic history</h3>
                  </header>
                  <ul className={historyStyles.academicList}>
                    {history.academicHistory.map((a) => (
                      <li key={a.sessionId} className={historyStyles.listItem}>
                        <div className={historyStyles.listMain}>
                          <div className={historyStyles.itemTitle}>Session {a.sessionName}</div>
                          <div className={historyStyles.muted}>
                            {a.classes.join(", ")}
                            {a.remarks ? ` · ${a.remarks}` : ""}
                          </div>
                        </div>
                        {a.outcome && <Badge tone={OUTCOME_BADGE[a.outcome].tone}>{OUTCOME_BADGE[a.outcome].label}</Badge>}
                        {a.current && <Badge tone="primary">Current</Badge>}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <StudentProfileView student={student} />
            </div>
          ) : tab === "documents" ? (
            <DocumentsTab studentId={student.id} />
          ) : tab === "health" ? (
            <HealthTab studentId={student.id} />
          ) : tab === "certificates" ? (
            <CertificatesTab studentId={student.id} />
          ) : tab === "privacy" ? (
            <StudentPrivacyTab studentId={student.id} />
          ) : isHistoryLoading ? (
            <Spinner />
          ) : isHistoryError || !history ? (
            <EmptyState
              title="Couldn't load this student's history"
              description="Check your connection and try again."
              action={<Button variant="outline" onClick={() => refetchHistory()}>Retry</Button>}
            />
          ) : tab === "attendance" ? (
            <AttendanceHistoryTab student={student} history={history} />
          ) : tab === "exams" ? (
            <ExamHistoryTab history={history} />
          ) : tab === "fees" ? (
            <FeeHistoryTab history={history} />
          ) : (
            <TransportHistoryTab
              student={student}
              history={history}
              onManageTransport={openTransportModal}
              onEndTransport={() => setIsEndTransportOpen(true)}
            />
          )}
        </>
      )}

      {isPhotoOpen && student && <StudentPhotoModal student={student} onClose={() => setIsPhotoOpen(false)} />}

      {isEndTransportOpen && student && (
        <EndTransportModal
          studentId={student.id}
          studentName={student.name}
          currentLabel={
            [student.transportRoute?.routeName, history?.transport.find((t) => t.status === "ACTIVE")?.villageName].filter(Boolean).join(" · ") || null
          }
          onClose={() => setIsEndTransportOpen(false)}
        />
      )}

      {/* Edit Student Profile Modal */}
      {isEditModalOpen && (
        <Modal title="Edit Student Profile" onClose={closeEditModal}>
          <form onSubmit={handleEditSubmit(onEditSubmit)}>
            <StudentFormFields
              register={editRegister}
              errors={editErrors}
              classSectionOptions={classSectionOptions}
              studentId={studentId}
            />
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "0.6rem", marginTop: "1.25rem" }}>
              <Button type="button" variant="ghost" onClick={closeEditModal}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isUpdating}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Assign Transport Route & Location Fee Modal */}
      {isTransportModalOpen && (
        <Modal title="Manage Student Transport & Location Fee" onClose={() => setIsTransportModalOpen(false)}>
          <form onSubmit={onTransportSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <FormSection title="1. Bus Route Assignment">
              <Select
                label="Transport Bus Route"
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                options={routeOptions}
              />
            </FormSection>

            <FormSection title="2. Fee Location Rate Selection">
              <Input
                label="Search Location / Village Name"
                placeholder="Type to search location (e.g. Rampur, Lakshmipur, Sector 14...)"
                value={locationSearchQuery}
                onChange={(e) => setLocationSearchQuery(e.target.value)}
              />

              <Select
                label={`Transport Location / Village (${filteredVillages.length} locations matching)`}
                value={selectedVillageId}
                onChange={(e) => setSelectedVillageId(e.target.value)}
                options={[
                  { label: "No Location Selected", value: "" },
                  ...filteredVillages.map((v) => ({
                    label: `${v.name} — Rate: ₹${v.monthlyFee.toLocaleString("en-IN")}/mo`,
                    value: String(v.id),
                  })),
                ]}
              />

              {activeVillage && (
                <div style={{ padding: "0.65rem 0.85rem", background: "rgba(2, 132, 199, 0.06)", border: "1px solid rgba(2, 132, 199, 0.2)", borderRadius: "var(--erp-radius-sm)", fontSize: "0.85rem", color: "var(--erp-primary-700)", fontWeight: 600 }}>
                  Assigned Monthly Rate: ₹{activeVillage.monthlyFee.toLocaleString("en-IN")} / month ({activeVillage.name})
                </div>
              )}
            </FormSection>

            {selectedVillageId && (
              <FormSection title="3. Billing Effective Date & Policy">
                <FormGrid>
                  <Input
                    label="Effective Start Date *"
                    type="date"
                    required
                    value={transportStartDate}
                    onChange={(e) => setTransportStartDate(e.target.value)}
                  />
                  <Select
                    label="Current Month Charge Policy"
                    value={transportPolicy}
                    onChange={(e) => setTransportPolicy(e.target.value as any)}
                    options={[
                      { label: "Full Month — Charge full current month", value: "FULL_MONTH" },
                      { label: "Prorated — Charge only active days", value: "PRORATED" },
                      { label: "Next Month — Start from next month", value: "NEXT_PERIOD" },
                    ]}
                  />
                </FormGrid>
              </FormSection>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "0.6rem", marginTop: "1.25rem" }}>
              <Button type="button" variant="ghost" onClick={() => setIsTransportModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isAssigningTransport || isAssigningVillage}>
                Save Transport Assignment
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Set Login Credentials Modal */}
      {isModalOpen && (
        <Modal title="Set Student Login" onClose={closeModal}>
          <form onSubmit={handleCredentialsSubmit(onCredentialsSubmit)}>
            <FormSection title="Login Details">
              <FormGrid>
                <Input
                  label="Email"
                  type="email"
                  placeholder="Optional — leave blank to use admission number only"
                  style={{ gridColumn: "1 / -1" }}
                  {...credentialsRegister("email")}
                />
                <Input
                  label="Password"
                  type="password"
                  required
                  style={{ gridColumn: "1 / -1" }}
                  error={credentialsErrors.password?.message}
                  {...credentialsRegister("password", { required: "Password is required" })}
                />
              </FormGrid>
            </FormSection>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "0.6rem", marginTop: "0.4rem" }}>
              <Button type="button" variant="ghost" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSavingCredentials}>
                Save Login
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default StudentDetailPage;
