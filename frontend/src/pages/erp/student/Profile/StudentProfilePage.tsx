import { useEffect, type ReactNode } from "react";
import { toast } from "react-toastify";
import { Badge, EmptyState, Icon, PageHeader, Spinner } from "../../../../components/ui";
import { useGetMyStudentProfileQuery } from "../../../../store/api/students.api";
import { useGetStudentDashboardQuery } from "../../../../store/api/dashboard.api";
import ChangePasswordCard from "../../../../components/shared/Account/ChangePasswordCard";
// Same detail cards as the admin and teacher student profiles, so all portals look alike.
import card from "../../../../components/shared/StudentProfileView/StudentProfileView.module.css";
import styles from "./StudentProfilePage.module.css";

const GENDER: Record<string, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : null;

const ageFrom = (dob?: string | null) => {
  if (!dob) return null;
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) age -= 1;
  return age >= 0 ? `${age} yrs` : null;
};

// "GENERAL" → "General", "OBC" stays "OBC".
const nice = (v?: string | null) => (!v ? null : v.length <= 3 ? v : v.charAt(0) + v.slice(1).toLowerCase());

// Government IDs are shown masked on the student's own screen (shared devices, screenshots);
// the full number stays visible to the school office in the admin profile.
const mask = (value?: string | null, visible = 4) =>
  value ? `${"•".repeat(Math.max(0, value.replace(/\s/g, "").length - visible))}${value.replace(/\s/g, "").slice(-visible)}` : null;

const Field = ({ label, value, wide, hint }: { label: string; value?: ReactNode; wide?: boolean; hint?: string | null }) => (
  <div className={`${card.field} ${wide ? card.wide : ""}`}>
    <span className={card.label}>{label}</span>
    <span className={`${card.value} ${value ? "" : card.empty}`}>
      {value || "Not on record"}
      {value && hint && <small className={card.hint}>{hint}</small>}
    </span>
  </div>
);

const InfoCard = ({ icon, title, note, children }: { icon: string; title: string; note?: string; children: ReactNode }) => (
  <section className={card.card}>
    <header className={card.cardHead}>
      <span className={card.cardIcon}>
        <Icon name={icon} size={16} />
      </span>
      <h3>{title}</h3>
      {note && <span className={styles.cardNote}>{note}</span>}
    </header>
    {children}
  </section>
);

const Person = ({ relation, name, phone, badge, callable }: { relation: string; name?: string | null; phone?: string | null; badge?: ReactNode; callable?: boolean }) => (
  <div className={card.parent}>
    <span className={card.parentAvatar}>{(name || relation).charAt(0).toUpperCase()}</span>
    <span className={card.parentMain}>
      <small>{relation}</small>
      <strong className={name ? "" : card.empty}>{name || "Not on record"}</strong>
      {phone && <span className={card.phoneText}>{phone}</span>}
    </span>
    {badge}
    {callable && phone && (
      <a className={card.callBtn} href={`tel:${phone}`} aria-label={`Call ${name || relation}`}>
        <Icon name="phone" size={16} />
      </a>
    )}
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
  const route = profile.transportRoute;
  const usesTransport = !!(extras?.transport || route);

  return (
    <div className={styles.container}>
      {/* Header card: who I am, my class, my session and class teacher */}
      <section className={styles.hero}>
        <div className={styles.heroTop}>
          {profile.photoUrl ? (
            <img src={profile.photoUrl} alt="" className={styles.avatar} />
          ) : (
            <span className={styles.avatar}>{profile.name.charAt(0).toUpperCase()}</span>
          )}
          <div className={styles.heroMain}>
            <h1 className={styles.name}>{profile.name}</h1>
            <div className={styles.chips}>
              {classLabel && <span className={`${styles.chip} ${styles.chipStrong}`}>{classLabel}</span>}
              {profile.rollNo && <span className={styles.chip}>Roll {profile.rollNo}</span>}
              <span className={styles.chip}>Adm {profile.admissionNo}</span>
              <Badge tone={profile.isActive ? "success" : "neutral"}>{profile.isActive ? "Active" : "Inactive"}</Badge>
            </div>
          </div>
        </div>
        <div className={styles.tiles}>
          <div className={styles.tile}>
            <span>Session</span>
            <strong>{extras?.sessionName ?? "…"}</strong>
          </div>
          <div className={styles.tile}>
            <span>Class teacher</span>
            <strong>{extras ? extras.classTeacherName ?? "Not assigned" : "…"}</strong>
          </div>
        </div>
      </section>

      <p className={styles.officeNote}>
        <Icon name="fileText" size={14} /> This is your school record. To correct anything, please contact the school office.
      </p>

      <div className={styles.grid}>
        <InfoCard icon="users" title="Personal">
          <div className={card.grid}>
            <Field label="Date of birth" value={formatDate(profile.dob)} hint={ageFrom(profile.dob)} />
            <Field label="Gender" value={profile.gender ? GENDER[profile.gender] : null} />
            <Field label="Blood group" value={profile.bloodGroup} />
            <Field label="Category" value={nice(profile.category)} />
            <Field label="Nationality" value={profile.nationality} />
          </div>
        </InfoCard>

        <InfoCard icon="graduationCap" title="Admission">
          <div className={card.grid}>
            <Field label="Admission number" value={profile.admissionNo} />
            <Field label="Admission date" value={formatDate(profile.admissionDate)} />
            <Field label="Previous school" value={profile.previousSchool} wide />
          </div>
        </InfoCard>

        <InfoCard icon="familyCheck" title="Parents & guardians">
          <div className={card.parents}>
            <Person relation="Father" name={profile.fatherName} phone={profile.fatherContact} />
            <Person relation="Mother" name={profile.motherName} phone={profile.motherContact} />
            {(extras?.guardians ?? []).map((g, i) => (
              <Person
                key={i}
                relation={g.relationship ? `Guardian · ${g.relationship}` : "Guardian"}
                name={g.name}
                phone={g.contact ?? g.email}
                badge={g.isPrimary ? <Badge tone="primary">Primary</Badge> : undefined}
              />
            ))}
          </div>
        </InfoCard>

        <InfoCard icon="phone" title="Contact & address">
          <div className={card.grid}>
            <Field label="My phone" value={profile.contactNumber} />
            <Field label="Address" value={profile.address} wide />
          </div>
        </InfoCard>

        <InfoCard icon="bus" title="School transport">
          {!usesTransport ? (
            <p className={styles.muted}>You are not using school transport.</p>
          ) : (
            <div className={styles.transport}>
              <div className={card.grid}>
                <Field label="Bus route" value={route?.routeName} />
                <Field label="My stop" value={extras?.transport?.villageName} />
                <Field label="Using since" value={extras?.transport ? formatDate(extras.transport.startDate) : null} />
              </div>
              {route?.stops && (
                <div className={styles.stops}>
                  {route.stops
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((s) => (
                      <span key={s} className={`${styles.stop} ${s === extras?.transport?.villageName ? styles.stopMine : ""}`}>
                        {s}
                      </span>
                    ))}
                </div>
              )}
              {(route?.vehicles ?? []).map((v) => (
                <div key={v.id} className={styles.bus}>
                  <span className={styles.busPlate}>{v.vehicleNo}</span>
                  <Person relation="Driver" name={v.driverName} phone={v.driverContact} callable />
                </div>
              ))}
            </div>
          )}
        </InfoCard>

        <InfoCard icon="badge" title="Government IDs" note="Partly hidden for privacy">
          <div className={card.grid}>
            <Field label="Aadhaar number" value={mask(profile.aadharNumber)} />
            <Field label="APAAR ID" value={mask(profile.apaarId)} />
          </div>
        </InfoCard>

        <ChangePasswordCard />
      </div>
    </div>
  );
};

export default StudentProfilePage;
