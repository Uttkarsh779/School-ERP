import React from "react";
import { Link } from "react-router-dom";
import { useGetPublicWebsiteDataQuery } from "../../store/api/cms.api";
import PublicNavbar from "./components/PublicNavbar";
import PublicFooter from "./components/PublicFooter";
import { Icon } from "../../components/ui";
import styles from "./AcademicsPage.module.css";

const AcademicsPage: React.FC = () => {
  const { data } = useGetPublicWebsiteDataQuery();
  const settings = data?.settings;

  return (
    <div className={styles.page}>
      <PublicNavbar settings={settings} />

      <header className={styles.heroHeader}>
        <div className={styles.headerContainer}>
          <div className={styles.badge}>
            <Icon name="star" size={14} />
            <span>NEP 2020 Aligned • Experiential Pedagogy</span>
          </div>
          <h1 className={styles.title}>Academic Rigor, Boundless Inquiry</h1>
          <p className={styles.subtitle}>
            From early exploratory sensory learning to senior secondary mastery in Science, Commerce, and Humanities, our curriculum nurtures critical thinkers and creative problem-solvers.
          </p>
        </div>
      </header>

      <main className={styles.container}>
        {/* Section 1: Academic Stages */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.preTitle}>Progressive Continuum</span>
            <h2 className={styles.sectionTitle}>Four Developmental Academic Wings</h2>
            <p className={styles.sectionDesc}>
              Tailored learning environments engineered for every developmental phase of childhood and adolescence.
            </p>
          </div>

          <div className={styles.stagesGrid}>
            {/* Stage 1 */}
            <div className={styles.stageCard}>
              <div className={styles.stageHeader}>
                <span className={styles.gradePill}>Nursery to Grade 2</span>
                <Icon name="star" size={20} />
              </div>
              <h3 className={styles.stageTitle}>Foundational Learning Wing</h3>
              <p className={styles.stageText}>
                Play-based and discovery-centered curriculum that kindles sensory curiosity, phonetic literacy, joyful numeracy, and social-emotional confidence.
              </p>
              <ul className={styles.featuresList}>
                <li className={styles.featureItem}><span className={styles.checkIcon}>✓</span> Montessori & Reggio Emilia sensory corners</li>
                <li className={styles.featureItem}><span className={styles.checkIcon}>✓</span> Phonics, storytelling & motor-skill refinement</li>
                <li className={styles.featureItem}><span className={styles.checkIcon}>✓</span> Dedicated teacher-student ratio of 1:12</li>
              </ul>
            </div>

            {/* Stage 2 */}
            <div className={styles.stageCard}>
              <div className={styles.stageHeader}>
                <span className={styles.gradePill}>Grades 3 to 5</span>
                <Icon name="layers" size={20} />
              </div>
              <h3 className={styles.stageTitle}>Preparatory Wing</h3>
              <p className={styles.stageText}>
                Transitioning into structured conceptual inquiry in mathematics, bilingual communication, applied environmental studies, and computer logic.
              </p>
              <ul className={styles.featuresList}>
                <li className={styles.featureItem}><span className={styles.checkIcon}>✓</span> Hands-on experiential science experiment kits</li>
                <li className={styles.featureItem}><span className={styles.checkIcon}>✓</span> Visual coding, Scratch programming & robotics basics</li>
                <li className={styles.featureItem}><span className={styles.checkIcon}>✓</span> Creative writing workshops and public speaking</li>
              </ul>
            </div>

            {/* Stage 3 */}
            <div className={styles.stageCard}>
              <div className={styles.stageHeader}>
                <span className={styles.gradePill}>Grades 6 to 8</span>
                <Icon name="building" size={20} />
              </div>
              <h3 className={styles.stageTitle}>Middle School Wing</h3>
              <p className={styles.stageText}>
                Deepening scientific inquiry, computational logic, social sciences, and multilingual mastery with modern lab hours and interdisciplinary project work.
              </p>
              <ul className={styles.featuresList}>
                <li className={styles.featureItem}><span className={styles.checkIcon}>✓</span> Third language options (Sanskrit, French, German)</li>
                <li className={styles.featureItem}><span className={styles.checkIcon}>✓</span> Olympiad preparation (IMO, NSO, Cyber Olympiad)</li>
                <li className={styles.featureItem}><span className={styles.checkIcon}>✓</span> Atal Tinkering Lab electronics & prototyping</li>
              </ul>
            </div>

            {/* Stage 4 */}
            <div className={styles.stageCard}>
              <div className={styles.stageHeader}>
                <span className={styles.gradePill}>Grades 9 to 12</span>
                <Icon name="graduationCap" size={20} />
              </div>
              <h3 className={styles.stageTitle}>Secondary & Senior Secondary Wing</h3>
              <p className={styles.stageText}>
                High-stakes CBSE Board examination mastery, targeted competitive entrance mentorship (JEE, NEET, CLAT, CUET), and university placement advisory.
              </p>
              <ul className={styles.featuresList}>
                <li className={styles.featureItem}><span className={styles.checkIcon}>✓</span> Specialized faculty with 15+ years board experience</li>
                <li className={styles.featureItem}><span className={styles.checkIcon}>✓</span> Comprehensive mock examinations and test analytics</li>
                <li className={styles.featureItem}><span className={styles.checkIcon}>✓</span> Profile-building for prestigious international admissions</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 2: Senior Secondary Career Streams */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.preTitle}>Grade XI & XII Pathways</span>
            <h2 className={styles.sectionTitle}>Senior Secondary Specialized Streams</h2>
            <p className={styles.sectionDesc}>
              World-class academic guidance with rigorous lab work and competitive entrance prep.
            </p>
          </div>

          <div className={styles.streamsGrid}>
            <div className={styles.streamCard}>
              <h3 className={styles.streamTitle}>Science Stream</h3>
              <p style={{ color: "#64748b", fontSize: "0.88rem", margin: 0 }}>
                For aspiring engineers, doctors, data scientists, and pure research scholars.
              </p>
              <div className={styles.streamSubjectPills}>
                <span className={styles.streamPill}>Physics</span>
                <span className={styles.streamPill}>Chemistry</span>
                <span className={styles.streamPill}>Mathematics</span>
                <span className={styles.streamPill}>Biology</span>
                <span className={styles.streamPill}>Computer Science / AI</span>
              </div>
              <div className={styles.careerHeading}>Future Horizons</div>
              <p className={styles.careerText}>IIT-JEE, NEET, AIIMS, MIT, B.Tech, Medicine, Quantum Computing & Aerospace.</p>
            </div>

            <div className={styles.streamCard}>
              <h3 className={styles.streamTitle}>Commerce Stream</h3>
              <p style={{ color: "#64748b", fontSize: "0.88rem", margin: 0 }}>
                For future corporate leaders, investment bankers, chartered accountants, and entrepreneurs.
              </p>
              <div className={styles.streamSubjectPills}>
                <span className={styles.streamPill}>Accountancy</span>
                <span className={styles.streamPill}>Business Studies</span>
                <span className={styles.streamPill}>Economics</span>
                <span className={styles.streamPill}>Applied Mathematics</span>
                <span className={styles.streamPill}>Informatics Practices</span>
              </div>
              <div className={styles.careerHeading}>Future Horizons</div>
              <p className={styles.careerText}>Chartered Accountancy (CA), Investment Banking, Corporate Law, MBA, Fintech.</p>
            </div>

            <div className={styles.streamCard}>
              <h3 className={styles.streamTitle}>Humanities Stream</h3>
              <p style={{ color: "#64748b", fontSize: "0.88rem", margin: 0 }}>
                For diplomats, civil servants, policy analysts, legal luminaries, and creative journalists.
              </p>
              <div className={styles.streamSubjectPills}>
                <span className={styles.streamPill}>Political Science</span>
                <span className={styles.streamPill}>Psychology</span>
                <span className={styles.streamPill}>Economics</span>
                <span className={styles.streamPill}>History / Sociology</span>
                <span className={styles.streamPill}>Legal Studies</span>
              </div>
              <div className={styles.careerHeading}>Future Horizons</div>
              <p className={styles.careerText}>UPSC Civil Services, Judicial Services (CLAT), International Diplomacy, Media & Public Policy.</p>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter settings={settings} />
    </div>
  );
};

export default AcademicsPage;
