import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui";
import type { IWebsiteSetting } from "../../../store/api/cms.api";
import campusHeroImg from "../../../assets/images/campus_hero.jpg";
import styles from "./HeroSection.module.css";

interface HeroSectionProps {
  settings?: IWebsiteSetting;
}

const HeroSection: React.FC<HeroSectionProps> = ({ settings }) => {
  const heroTitle = settings?.heroTitle || "Empowering Inquiring Minds, Cultivating Compassionate Leaders";
  const heroSubtitle = settings?.heroSubtitle || "Ranked among India's premier international K-12 day-boarding schools. Combining rigorous CBSE academics with global STEM innovation, Olympic-standard athletics, and profound moral character.";
  const admissionsOpen = settings?.admissionsOpen !== false;
  const establishedYear = settings?.establishedYear || 1998;
  const yearsOfExcellence = new Date().getFullYear() - establishedYear;

  return (
    <section id="home" className={styles.hero}>
      <div className={styles.container}>
        <div className={styles.splitGrid}>
          {/* Left Text & CTA Column */}
          <div className={styles.heroTextContent}>
            {admissionsOpen && (
              <div className={styles.badge}>
                <span className={styles.badgeDot} />
                <span>★ Admissions Open for Academic Session 2026-27</span>
              </div>
            )}

            <h1 className={styles.title}>
              {heroTitle}
            </h1>

            <p className={styles.subtitle}>
              {heroSubtitle}
            </p>

            <div className={styles.ctaGroup}>
              <Link to="/admissions" className={styles.primaryCta}>
                <span>{settings?.heroCtaText || "Apply for Admission 2026-27"}</span>
                <Icon name="arrowRight" size={18} />
              </Link>
              <Link to="/gallery" className={styles.secondaryCta}>
                <Icon name="star" size={17} />
                <span>Explore Photo Gallery</span>
              </Link>
            </div>
          </div>

          {/* Right Visual Image Showcase with Floating Accolade Badges */}
          <div className={styles.heroMediaWrapper}>
            <div className={styles.heroImageFrame}>
              <img
                src={campusHeroImg}
                alt="RRS International School Campus"
                className={styles.heroImage}
              />
            </div>

            {/* Floating Accolade 1 */}
            <div className={styles.floatingBadge1}>
              <div className={styles.badgeIcon}>🏆</div>
              <div className={styles.badgeText}>
                <span className={styles.badgeTitle}>Ranked #1 K-12 School</span>
                <span className={styles.badgeSub}>Education World & Times School Survey</span>
              </div>
            </div>

            {/* Floating Accolade 2 */}
            <div className={styles.floatingBadge2}>
              <div className={styles.badgeIcon}>🎓</div>
              <div className={styles.badgeText}>
                <span className={styles.badgeTitle}>100% Board Distinction</span>
                <span className={styles.badgeSub}>Average Batch Aggregate 92.4%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Four Key Stats Ribbon */}
        <div className={styles.statsGrid}>
          <div className={styles.statItem}>
            <div className={styles.statValue}>
              {yearsOfExcellence}<span>+</span>
            </div>
            <div className={styles.statLabel}>Years of Educational Legacy</div>
          </div>

          <div className={styles.statItem}>
            <div className={styles.statValue}>
              100<span>%</span>
            </div>
            <div className={styles.statLabel}>CBSE Board Distinction Rate</div>
          </div>

          <div className={styles.statItem}>
            <div className={styles.statValue}>
              2,500<span>+</span>
            </div>
            <div className={styles.statLabel}>Scholars & Distinguished Alums</div>
          </div>

          <div className={styles.statItem}>
            <div className={styles.statValue}>
              1<span>:18</span>
            </div>
            <div className={styles.statLabel}>Faculty to Student Ratio</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
