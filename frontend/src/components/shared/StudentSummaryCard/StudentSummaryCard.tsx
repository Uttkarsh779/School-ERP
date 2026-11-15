import type { ReactNode } from "react";
import styles from "./StudentSummaryCard.module.css";

export interface StudentSummaryFact {
  label: string;
  value: ReactNode;
  sub?: string | null;
  tone?: "good" | "warn" | "bad";
  /** Makes the figure a button, used to open the matching tab. */
  onClick?: () => void;
}

interface StudentSummaryCardProps {
  name: string;
  photoUrl?: string | null;
  classLabel?: string | null;
  /** Quiet text beside the class, such as roll and admission numbers. */
  meta?: ReactNode;
  badge?: ReactNode;
  /** Shown at the right of the name row. */
  action?: ReactNode;
  /** Makes the photo a button. Left out for people who can't change it. */
  onPhotoClick?: () => void;
  photoLabel?: string;
  facts: StudentSummaryFact[];
  heading?: "h1" | "h2" | "div";
  /** Anything that sits between the name row and the facts, such as office actions. */
  children?: ReactNode;
}

// The student's header card, shared by the student dashboard, My Profile, and the office and
// teacher views of a student, so every portal shows it the same way.
const StudentSummaryCard = ({
  name,
  photoUrl,
  classLabel,
  meta,
  badge,
  action,
  onPhotoClick,
  photoLabel,
  facts,
  heading: Heading = "div",
  children,
}: StudentSummaryCardProps) => {
  const photo = photoUrl ? (
    <img src={photoUrl} alt="" className={styles.photo} />
  ) : (
    <span className={styles.avatar}>{name.charAt(0).toUpperCase()}</span>
  );

  return (
    <section className={styles.card}>
      <div className={styles.top}>
        {onPhotoClick ? (
          <button type="button" className={styles.photoButton} onClick={onPhotoClick} title={photoLabel}>
            {photo}
            {photoLabel && <span className={styles.photoBadge}>{photoLabel}</span>}
          </button>
        ) : (
          photo
        )}
        <div className={styles.who}>
          <Heading className={styles.name}>{name}</Heading>
          {(classLabel || meta || badge) && (
            <div className={styles.line}>
              {classLabel && <span className={styles.classBadge}>{classLabel}</span>}
              {badge}
              {meta && <span className={styles.meta}>{meta}</span>}
            </div>
          )}
        </div>
        {action}
      </div>

      {children}

      {facts.length > 0 && (
        <div className={styles.facts}>
          {facts.map((fact) => {
            const content = (
              <>
                <span className={styles.factLabel}>{fact.label}</span>
                <span className={`${styles.factValue} ${fact.tone ? styles[`tone_${fact.tone}`] : ""}`}>{fact.value}</span>
                {fact.sub && <span className={styles.factSub}>{fact.sub}</span>}
              </>
            );
            return fact.onClick ? (
              <button key={fact.label} type="button" className={`${styles.fact} ${styles.factButton}`} onClick={fact.onClick}>
                {content}
              </button>
            ) : (
              <div key={fact.label} className={styles.fact}>
                {content}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default StudentSummaryCard;
