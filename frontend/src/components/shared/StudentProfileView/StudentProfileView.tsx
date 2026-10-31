import type { ReactNode } from "react";
import { Icon } from "../../ui";
import styles from "./StudentProfileView.module.css";

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
};

// "MALE" → "Male", "OBC" stays "OBC".
const nice = (v?: string | null) => (!v ? null : v.length <= 3 ? v : v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, " "));
// "946119701070" → "9461 1970 1070"
const groups4 = (v?: string | null) => (v && /^\d{12}$/.test(v) ? v.replace(/(\d{4})(?=\d)/g, "$1 ") : v || null);
const ageOf = (dob?: string | null) => {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age -= 1;
  return age >= 0 ? `${age} yrs` : null;
};

const Field = ({ label, value, wide, hint }: { label: string; value?: ReactNode; wide?: boolean; hint?: string | null }) => (
  <div className={`${styles.field} ${wide ? styles.wide : ""}`}>
    <span className={styles.label}>{label}</span>
    <span className={`${styles.value} ${value ? "" : styles.empty}`}>
      {value || "Not added"}
      {value && hint && <small className={styles.hint}>{hint}</small>}
    </span>
  </div>
);

const InfoCard = ({ icon, title, children }: { icon: string; title: string; children: ReactNode }) => (
  <section className={styles.card}>
    <header className={styles.cardHead}>
      <span className={styles.cardIcon}>
        <Icon name={icon} size={16} />
      </span>
      <h3>{title}</h3>
    </header>
    <div className={styles.grid}>{children}</div>
  </section>
);

// A parent with a one-tap call button.
const Parent = ({ relation, name, phone }: { relation: string; name?: string | null; phone?: string | null }) => (
  <div className={styles.parent}>
    <span className={styles.parentAvatar}>{(name || relation).charAt(0).toUpperCase()}</span>
    <span className={styles.parentMain}>
      <small>{relation}</small>
      <strong className={name ? "" : styles.empty}>{name || "Not added"}</strong>
      {phone && <span className={styles.phoneText}>{phone}</span>}
    </span>
    {phone && (
      <a className={styles.callBtn} href={`tel:${phone}`} aria-label={`Call ${name || relation}`}>
        <Icon name="phone" size={16} />
      </a>
    )}
  </div>
);

interface StudentProfileViewProps {
  student: IStudent;
}

// Personal, family, ID and admission details as cards. The student's name, class and photo
// are in the page header; fees, transport, attendance and marks live in their own tabs.
const StudentProfileView = ({ student }: StudentProfileViewProps) => (
  <div className={styles.cards}>
    <InfoCard icon="users" title="Personal">
      <Field label="Date of birth" value={formatDate(student.dob)} hint={ageOf(student.dob)} />
      <Field label="Gender" value={nice(student.gender)} />
      <Field label="Blood group" value={student.bloodGroup} />
      <Field label="Category" value={nice(student.category)} />
      <Field label="Nationality" value={student.nationality} />
    </InfoCard>

    <section className={styles.card}>
      <header className={styles.cardHead}>
        <span className={styles.cardIcon}>
          <Icon name="familyCheck" size={16} />
        </span>
        <h3>Family</h3>
      </header>
      <div className={styles.parents}>
        <Parent relation="Father" name={student.fatherName} phone={student.fatherContact} />
        <Parent relation="Mother" name={student.motherName} phone={student.motherContact} />
      </div>
    </section>

    <InfoCard icon="phone" title="Contact & address">
      <Field
        label="Student's phone"
        value={
          student.contactNumber ? (
            <a className={styles.link} href={`tel:${student.contactNumber}`}>
              {student.contactNumber}
            </a>
          ) : null
        }
      />
      <Field label="Address" value={student.address} wide />
    </InfoCard>

    <InfoCard icon="badge" title="IDs & admission">
      <Field label="Aadhaar number" value={groups4(student.aadharNumber)} />
      <Field label="APAAR ID" value={groups4(student.apaarId)} />
      <Field label="Admission date" value={formatDate(student.admissionDate)} />
      <Field label="Previous school" value={student.previousSchool} />
    </InfoCard>
  </div>
);

export default StudentProfileView;
