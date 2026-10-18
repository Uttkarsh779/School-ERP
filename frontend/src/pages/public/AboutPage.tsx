import React from "react";
import { useGetPublicWebsiteDataQuery } from "../../store/api/cms.api";
import PublicNavbar from "./components/PublicNavbar";
import PublicFooter from "./components/PublicFooter";
import { Icon } from "../../components/ui";
import principalImg from "../../assets/images/principal.jpg";
import styles from "./AboutPage.module.css";

const AboutPage: React.FC = () => {
  const { data } = useGetPublicWebsiteDataQuery();
  const settings = data?.settings;

  const schoolName = settings?.schoolName || "RRS International School";
  const principalName = settings?.principalName || "Dr. S. K. Sharma";
  const establishedYear = settings?.establishedYear || 1998;
  const affiliationNo = settings?.affiliationNo || "CBSE-2130892";

  return (
    <div className={styles.page}>
      <PublicNavbar settings={settings} />

      <header className={styles.heroHeader}>
        <div className={styles.headerContainer}>
          <div className={styles.badge}>
            <Icon name="star" size={14} />
            <span>Founded in {establishedYear} • Legacy of 28+ Years</span>
          </div>
          <h1 className={styles.title}>Nurturing Character, Inspiring Global Excellence</h1>
          <p className={styles.subtitle}>
            At {schoolName}, we ignite intellectual curiosity, foster emotional empathy, and prepare resilient global leaders equipped to thrive in an interconnected world.
          </p>
        </div>
      </header>

      <main className={styles.container}>
        {/* Section 1: Principal's Address */}
        <section className={styles.section}>
          <div className={styles.principalSection}>
            <div className={styles.principalPhotoWrapper}>
              <img src={principalImg} alt={principalName} className={styles.principalPhoto} />
              <div className={styles.principalAccolade}>
                <strong>25+ Years</strong>
                <span>Pedagogical Excellence</span>
              </div>
            </div>

            <div className={styles.principalContent}>
              <div className={styles.quoteMark}>“</div>
              <h2 className={styles.principalHeading}>From the Principal's Desk</h2>
              <p className={styles.principalBio}>
                {settings?.principalMessage || "Education at RRS International transcends textbook memorization and exam scores. It is about kindling the spark of curiosity, instilling unwavering integrity, and fostering empathetic hearts capable of understanding diverse cultures and perspectives."}
              </p>
              <p className={styles.principalBio}>
                Our holistic curriculum balances intellectual rigor with competitive sports, advanced robotics, performing arts, and community service. Every student is recognized as a unique universe of limitless possibilities. We warmly invite you to be a part of our thriving educational family.
              </p>
              <div className={styles.principalSignature}>
                <strong>{principalName}</strong>
                <span>Principal & Director of Academics • Ph.D., M.Ed., Gold Medalist</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Core Values */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.preTitle}>Our Institutional Ethos</span>
            <h2 className={styles.sectionTitle}>The Four Pillars of {schoolName}</h2>
            <p className={styles.sectionDesc}>
              Guided by timeless human values and future-ready 21st century learning competencies.
            </p>
          </div>

          <div className={styles.valuesGrid}>
            <div className={styles.valueCard}>
              <div className={styles.valueIcon}>
                <Icon name="graduationCap" size={26} />
              </div>
              <h3 className={styles.valueTitle}>Intellectual Rigor</h3>
              <p className={styles.valueText}>
                Deep conceptual understanding driven by analytical inquiry, scientific questioning, and interdisciplinary problem solving.
              </p>
            </div>

            <div className={styles.valueCard}>
              <div className={styles.valueIcon}>
                <Icon name="layers" size={26} />
              </div>
              <h3 className={styles.valueTitle}>Holistic Mastery</h3>
              <p className={styles.valueText}>
                Harmonious integration of high academics, Olympic-level athletics, robotics experimentation, and soulful classical fine arts.
              </p>
            </div>

            <div className={styles.valueCard}>
              <div className={styles.valueIcon}>
                <Icon name="users" size={26} />
              </div>
              <h3 className={styles.valueTitle}>Moral Leadership</h3>
              <p className={styles.valueText}>
                Cultivating compassionate global citizens who act with empathy, social responsibility, and ethical courage.
              </p>
            </div>

            <div className={styles.valueCard}>
              <div className={styles.valueIcon}>
                <Icon name="globe" size={26} />
              </div>
              <h3 className={styles.valueTitle}>Global Perspective</h3>
              <p className={styles.valueText}>
                Preparing scholars for global universities with multilingual proficiency, Model United Nations, and cross-cultural exchanges.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Affiliation & Board Banner */}
        <section className={styles.section}>
          <div className={styles.accreditationBanner}>
            <div className={styles.accreditationText}>
              <h3>Official CBSE Board Affiliation & Standards</h3>
              <p>
                {schoolName} is permanently affiliated with the Central Board of Secondary Education (CBSE), New Delhi, compliant with the National Education Policy (NEP 2020).
              </p>
            </div>
            <div className={styles.accreditationPills}>
              <div className={styles.pillItem}>
                <strong>{affiliationNo}</strong>
                <span>Affiliation Number</span>
              </div>
              <div className={styles.pillItem}>
                <strong>100%</strong>
                <span>Board Distinction</span>
              </div>
              <div className={styles.pillItem}>
                <strong>ISO 9001:2015</strong>
                <span>Quality Certified</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter settings={settings} />
    </div>
  );
};

export default AboutPage;
