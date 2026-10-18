import React from "react";
import { Link } from "react-router-dom";
import type { IWebsiteSetting } from "../../../store/api/cms.api";
import principalImg from "../../../assets/images/principal.jpg";
import styles from "./AboutSection.module.css";

interface AboutSectionProps {
  settings?: IWebsiteSetting;
}

const AboutSection: React.FC<AboutSectionProps> = ({ settings }) => {
  const schoolName = settings?.schoolName || "Delhi Public Academy";
  const aboutText = settings?.aboutText || "Delhi Public Academy is committed to fostering academic brilliance, character development, and holistic innovation. Our campus provides an inspiring atmosphere where every child discovers their unique talents and excels in a rapidly changing world.";
  const principalName = settings?.principalName || "Dr. S. K. Sharma";
  const principalMessage = settings?.principalMessage || "Education is not just about scores; it is the ignition of curiosity, empathy, and resilience. We empower each student to dream boldly, think critically, and lead with compassion.";

  return (
    <section id="about" className={styles.aboutSection}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.preTitle}>Our Heritage & Ethos</span>
          <h2 className={styles.mainTitle}>Shaping Leaders with Values & Wisdom</h2>
          <p className={styles.leadText}>
            For over two decades, {schoolName} has stood as a beacon of scholastic distinction, modern infrastructure, and human values.
          </p>
        </div>

        <div className={styles.grid}>
          {/* Vision and Pillars */}
          <div className={styles.visionBox}>
            <p className={styles.aboutParagraph}>{aboutText}</p>

            <div className={styles.pillarsGrid}>
              <div className={styles.pillarCard}>
                <h4 className={styles.pillarTitle}>Holistic Development</h4>
                <p className={styles.pillarDesc}>
                  Seamless balance of academics, competitive exams, performing arts, and physical fitness.
                </p>
              </div>

              <div className={styles.pillarCard}>
                <h4 className={styles.pillarTitle}>Global Curriculum</h4>
                <p className={styles.pillarDesc}>
                  CBSE aligned syllabus enriched with experiential STEM learning and robotics.
                </p>
              </div>

              <div className={styles.pillarCard}>
                <h4 className={styles.pillarTitle}>Distinguished Faculty</h4>
                <p className={styles.pillarDesc}>
                  Passionate, regularly trained educators focused on individualized student attention.
                </p>
              </div>

              <div className={styles.pillarCard}>
                <h4 className={styles.pillarTitle}>Safe & Smart Campus</h4>
                <p className={styles.pillarDesc}>
                  CCTV monitored secure premises, biometric transport, and green eco-friendly grounds.
                </p>
              </div>
            </div>

            <div className={styles.readMoreRow}>
              <Link to="/about" className={styles.readMoreBtn}>
                <span>Learn More About Our Philosophy & Leadership</span>
                <span>→</span>
              </Link>
            </div>
          </div>

          {/* Principal's Desk Card */}
          <div className={styles.principalCard}>
            <div className={styles.quoteIcon}>“</div>
            <div className={styles.principalHeading}>From the Principal's Desk</div>
            <p className={styles.principalText}>{principalMessage}</p>

            <div className={styles.principalMeta}>
              <div className={styles.principalAvatar}>
                <img
                  src={principalImg}
                  alt={principalName}
                  className={styles.principalAvatarImg}
                  onError={(e) => {
                    // Fallback to initials if image error
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>
              <div className={styles.principalInfo}>
                <strong>{principalName}</strong>
                <span>Principal, M.Sc., Ph.D., B.Ed.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
