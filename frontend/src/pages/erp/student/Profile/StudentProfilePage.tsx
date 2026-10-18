import { useEffect } from "react";
import { toast } from "react-toastify";
import { Badge, Card, EmptyState, PageHeader, Spinner } from "../../../../components/ui";
import { useGetMyStudentProfileQuery } from "../../../../store/api/students.api";
import { useGetStudentDashboardQuery } from "../../../../store/api/dashboard.api";
import ChangePasswordCard from "../../../../components/shared/Account/ChangePasswordCard";
import styles from "./StudentProfilePage.module.css";

const GENDER: Record<string, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : null;

const ageFrom = (dob?: string | null) => {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) age -= 1;
  return age >= 0 ? `${age} years` : null;
};

// Government IDs are shown masked on the student's own screen (shared devices, screenshots);
// the full number stays visible to the school office in the admin profile.
const mask = (value?: string | null, visible = 4) =>
  value ? `${"•".repeat(Math.max(0, value.replace(/\s/g, "").length - visible))}${value.replace(/\s/g, "").slice(-visible)}` : null;

const Field = ({ label, value, full }: { label: string; value?: string | null; full?: boolean }) => (
  <div className={full ? `${styles.field} ${styles.fieldFull}` : styles.field}>
    <dt>{label}</dt>
    <dd>{value || <span className={styles.missing}>Not on record</span>}</dd>
  </div>
);

const StudentProfilePage = () => {
  const { data: profile, isLoading, isError } = useGetMyStudentProfileQuery();
  const { data: dashboard } = useGetStudentDashboardQuery();
  const extras = dashboard?.profileExtras;

  useEffect(() => {
    if (isError) toast.error("Failed to load your profile.");
  }, [isError]);

  if (isLoading) {
    return (
      <div>
        <PageHeader title="My Profile" />
        <Spinner />
      </div>
    );
  }

  if (!profile) {
    return (
      <div>
        <PageHeader title="My Profile" />
        <EmptyState title="Couldn't load your profile" description="Please try refreshing the page." />
      </div>
    );
  }

  const classLabel = profile.classSection ? `${profile.classSection.className} - ${profile.classSection.section}` : null;

  return (
    <div className={styles.container}>
      <PageHeader title="My Profile" subtitle="Your school record. To correct anything, please contact the school office." />

      <Card>
        <div className={styles.hero}>
          {profile.photoUrl ? (
            <img src={profile.photoUrl} alt={profile.name} className={styles.photo} />
          ) : (
            <div className={styles.avatar}>{profile.name.charAt(0).toUpperCase()}</div>
          )}
          <div className={styles.heroMain}>
            <h2 className={styles.name}>{profile.name}</h2>
            <div className={styles.heroMeta}>
              {classLabel && <span>{classLabel}</span>}
              <span>Roll No {profile.rollNo}</span>
              <span>Adm. No {profile.admissionNo}</span>
            </div>
          </div>
          <Badge tone={profile.isActive ? "success" : "neutral"}>{profile.isActive ? "Active student" : "Inactive"}</Badge>
        </div>
      </Card>

      <div className={styles.grid}>
        <Card title="Academic">
          <dl className={styles.fields}>
            <Field label="Class & Section" value={classLabel} />
            <Field label="Roll Number" value={profile.rollNo} />
            <Field label="Admission Number" value={profile.admissionNo} />
            <Field label="Admission Date" value={formatDate(profile.admissionDate)} />
            <Field label="Academic Session" value={extras?.sessionName} />
            <Field label="Class Teacher" value={extras?.classTeacherName} />
            <Field label="Previous School" value={profile.previousSchool} full />
          </dl>
        </Card>

        <Card title="Personal">
          <dl className={styles.fields}>
            <Field label="Date of Birth" value={formatDate(profile.dob)} />
            <Field label="Age" value={ageFrom(profile.dob)} />
            <Field label="Gender" value={profile.gender ? GENDER[profile.gender] : null} />
            <Field label="Blood Group" value={profile.bloodGroup} />
            <Field label="Category" value={profile.category} />
            <Field label="Nationality" value={profile.nationality} />
          </dl>
        </Card>

        <Card title="Parents & Guardians">
          <dl className={styles.fields}>
            <Field label="Father's Name" value={profile.fatherName} />
            <Field label="Father's Contact" value={profile.fatherContact} />
            <Field label="Mother's Name" value={profile.motherName} />
            <Field label="Mother's Contact" value={profile.motherContact} />
          </dl>
          {extras && extras.guardians.length > 0 && (
            <>
              <div className={styles.subHeading}>Linked guardian accounts</div>
              <ul className={styles.guardianList}>
                {extras.guardians.map((g, i) => (
                  <li key={i} className={styles.guardian}>
                    <div>
                      <div className={styles.guardianName}>
                        {g.name}
                        {g.relationship && <span className={styles.muted}> · {g.relationship}</span>}
                      </div>
                      <div className={styles.muted}>{[g.contact, g.email].filter(Boolean).join(" · ") || "No contact on record"}</div>
                    </div>
                    {g.isPrimary && <Badge tone="primary">Primary</Badge>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title="Contact & Address">
          <dl className={styles.fields}>
            <Field label="Contact Number" value={profile.contactNumber} />
            <Field label="Address" value={profile.address} full />
          </dl>
        </Card>

        <Card title="Transport">
          {extras?.transport ? (
            <dl className={styles.fields}>
              <Field label="Village / Stop" value={extras.transport.villageName} />
              <Field label="Using Transport Since" value={formatDate(extras.transport.startDate)} />
            </dl>
          ) : (
            <p className={styles.muted}>Not using school transport.</p>
          )}
        </Card>

        <ChangePasswordCard />

        <Card title="Government IDs" subtitle="Shown partly hidden for your privacy">
          <dl className={styles.fields}>
            <Field label="Aadhaar Number" value={mask(profile.aadharNumber)} />
            <Field label="APAAR ID" value={mask(profile.apaarId)} />
          </dl>
        </Card>
      </div>
    </div>
  );
};

export default StudentProfilePage;
