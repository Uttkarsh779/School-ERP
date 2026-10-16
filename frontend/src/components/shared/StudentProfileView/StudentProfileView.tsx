import { Badge, FormSection } from "../../ui";
import TransportInfoCard from "../TransportInfoCard/TransportInfoCard";
import StudentFeeHistoryCard from "../StudentFeeHistoryCard/StudentFeeHistoryCard";
import styles from "./StudentProfileView.module.css";

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const Field = ({ label, value }: { label: string; value?: string | null }) => (
  <div className={styles.field}>
    <span className={styles.label}>{label}</span>
    <span className={styles.value}>{value || "—"}</span>
  </div>
);

interface StudentProfileViewProps {
  student: IStudent;
  onAssignTransport?: () => void;
}

const StudentProfileView = ({ student, onAssignTransport }: StudentProfileViewProps) => (
  <div>
    <div className={styles.header}>
      <div className={styles.avatar}>{student.name.charAt(0).toUpperCase()}</div>
      <div>
        <h2 className={styles.name}>{student.name}</h2>
        <p className={styles.meta}>
          Roll No {student.rollNo} · Admission No {student.admissionNo}
          {student.classSection ? ` · ${student.classSection.className} - ${student.classSection.section}` : ""}
        </p>
      </div>
      <div style={{ marginLeft: "auto" }}>
        <Badge tone={student.isActive ? "success" : "neutral"}>{student.isActive ? "Active" : "Inactive"}</Badge>
      </div>
    </div>

    <FormSection title="Personal Details">
      <div className={styles.row}>
        <Field label="Date of Birth" value={formatDate(student.dob)} />
        <Field label="Gender" value={student.gender} />
        <Field label="Blood Group" value={student.bloodGroup} />
        <Field label="Category" value={student.category} />
        <Field label="Nationality" value={student.nationality} />
        <Field label="Admission Date" value={formatDate(student.admissionDate)} />
      </div>
    </FormSection>

    <FormSection title="Family Information">
      <div className={styles.row}>
        <Field label="Father's Name" value={student.fatherName} />
        <Field label="Father's Contact" value={student.fatherContact} />
        <Field label="Mother's Name" value={student.motherName} />
        <Field label="Mother's Contact" value={student.motherContact} />
      </div>
    </FormSection>

    <FormSection title="Government ID & Contact">
      <div className={styles.row}>
        <Field label="Aadhar Number" value={student.aadharNumber} />
        <Field label="APAAR ID" value={student.apaarId} />
        <Field label="Contact Number" value={student.contactNumber} />
        <Field label="Address" value={student.address} />
        <Field label="Previous School" value={student.previousSchool} />
      </div>
    </FormSection>

    <TransportInfoCard student={student} onAssignTransport={onAssignTransport} />

    <StudentFeeHistoryCard student={student} />
  </div>
);

export default StudentProfileView;
