import React from "react";
import { Icon } from "../../../components/ui";
import styles from "./AcademicsSection.module.css";

const AcademicsSection: React.FC = () => {
  const stages = [
    {
      badge: "Foundational",
      title: "Early Years Wing",
      grades: "Nursery – Grade II",
      desc: "Play-based inquiry, phonics, sensorial discovery, and foundational numeracy in a caring, joyful setting.",
      points: ["Activity-based discovery", "Speech & Motor development", "Creative Arts & Storytelling"]
    },
    {
      badge: "Preparatory",
      title: "Primary School",
      grades: "Grade III – Grade V",
      desc: "Building rock-solid literacy, logical reasoning, scientific curiosity, and collaborative communication.",
      points: ["Core Language & Math skills", "Experiential Environmental Studies", "Weekly Reading & Library hours"]
    },
    {
      badge: "Middle Years",
      title: "Middle School",
      grades: "Grade VI – Grade VIII",
      desc: "Deepening critical thinking, coding, STEM lab experiments, languages, and leadership clubs.",
      points: ["Hands-on Physics, Chem, Bio Labs", "Computer Coding & AI Basics", "Inter-school debates & quizzing"]
    },
    {
      badge: "Senior Secondary",
      title: "Senior School",
      grades: "Grade IX – Grade XII",
      desc: "Rigorous CBSE Board preparation alongside specialized streams in Science, Commerce, and Humanities.",
      points: ["Integrated Competitive Exam prep", "Career Counseling & Mentorship", "Proven 100% Board distinctions"]
    }
  ];

  return (
    <section id="academics" className={styles.academicsSection}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.preTitle}>Academics & Pedagogy</span>
          <h2 className={styles.mainTitle}>A Continuum of Academic Excellence</h2>
          <p className={styles.leadText}>
            From early childhood discovery to senior board success, our progressive CBSE curriculum prepares students for global universities and purposeful careers.
          </p>
        </div>

        <div className={styles.stagesGrid}>
          {stages.map((stg, idx) => (
            <div key={idx} className={styles.stageCard}>
              <span className={styles.stageBadge}>{stg.badge}</span>
              <h3 className={styles.stageTitle}>{stg.title}</h3>
              <div className={styles.stageGrades}>{stg.grades}</div>
              <p className={styles.stageDesc}>{stg.desc}</p>

              <ul className={styles.featuresList}>
                {stg.points.map((pt, pIdx) => (
                  <li key={pIdx} className={styles.featureItem}>
                    <span className={styles.checkIcon}>
                      <Icon name="check" size={14} />
                    </span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default AcademicsSection;
