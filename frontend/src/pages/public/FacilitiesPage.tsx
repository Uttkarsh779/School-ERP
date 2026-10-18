import React from "react";
import { useGetPublicWebsiteDataQuery } from "../../store/api/cms.api";
import PublicNavbar from "./components/PublicNavbar";
import PublicFooter from "./components/PublicFooter";
import { Icon } from "../../components/ui";

import smartClassroomImg from "../../assets/images/smart_classroom.jpg";
import stemLabImg from "../../assets/images/stem_lab.jpg";
import sportsComplexImg from "../../assets/images/sports_complex.jpg";
import libraryImg from "../../assets/images/library.jpg";
import auditoriumImg from "../../assets/images/auditorium.jpg";
import campusHeroImg from "../../assets/images/campus_hero.jpg";

import styles from "./FacilitiesPage.module.css";

const defaultFacilitiesWithImages = [
  {
    id: 1,
    title: "Smart Digital Classrooms",
    description: "Interactive smart boards, high-speed connectivity, and ergonomic acoustic setups for engaging visual learning.",
    image: smartClassroomImg,
  },
  {
    id: 2,
    title: "Advanced STEM & Robotics Laboratories",
    description: "Cutting-edge physics, chemistry, biology, robotics, and coding labs with hands-on experimentation kits.",
    image: stemLabImg,
  },
  {
    id: 3,
    title: "Olympic-Standard Athletics Track & Sports Complex",
    description: "Dedicated courts for basketball, badminton, football turf, cricket nets, and indoor games supervised by NIS coaches.",
    image: sportsComplexImg,
  },
  {
    id: 4,
    title: "Comprehensive Central Digital Library",
    description: "Over 15,000 physical volumes, research journals, e-book readers, and serene reading spaces for curious minds.",
    image: libraryImg,
  },
  {
    id: 5,
    title: "Visual & Performing Arts Auditorium",
    description: "Acoustically treated auditorium, classical & western music rooms, dance studio, and pottery & fine arts creative workshop.",
    image: auditoriumImg,
  },
  {
    id: 6,
    title: "GPS-Monitored Safe Transport Fleet",
    description: "Air-conditioned bus fleet equipped with real-time GPS tracking, speed governors, CCTV cameras, and trained female attendants.",
    image: campusHeroImg,
  },
];

const FacilitiesPage: React.FC = () => {
  const { data } = useGetPublicWebsiteDataQuery();
  const settings = data?.settings;

  // Combine dynamic facilities with default images if not customized
  const facilitiesList = defaultFacilitiesWithImages.map((def, idx) => {
    const liveFac = data?.facilities?.[idx];
    return {
      id: liveFac?.id || def.id,
      title: liveFac?.title || def.title,
      description: liveFac?.description || def.description,
      image: liveFac?.imageUrl || def.image,
    };
  });

  return (
    <div className={styles.page}>
      <PublicNavbar settings={settings} />

      <header className={styles.heroHeader}>
        <div className={styles.headerContainer}>
          <div className={styles.badge}>
            <Icon name="star" size={14} />
            <span>25-Acre World-Class Campus</span>
          </div>
          <h1 className={styles.title}>Infrastructure Built for Human Flourishing</h1>
          <p className={styles.subtitle}>
            Every corner of our campus is designed to stimulate intellectual curiosity, physical vigor, emotional well-being, and absolute student safety.
          </p>
        </div>
      </header>

      <main className={styles.container}>
        {/* Facilities Grid */}
        <section className={styles.section}>
          <div className={styles.facilitiesGrid}>
            {facilitiesList.map((fac) => (
              <div key={fac.id} className={styles.facilityCard}>
                <div className={styles.imageWrapper}>
                  <img src={fac.image} alt={fac.title} className={styles.facilityImage} loading="lazy" />
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.facilityTitle}>{fac.title}</h3>
                  <p className={styles.facilityDesc}>{fac.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Safety & Health Protocols */}
        <section className={styles.safetySection}>
          <div className={styles.safetyHeader}>
            <h2 className={styles.safetyTitle}>Uncompromising Safety & Well-Being</h2>
            <p className={styles.safetyDesc}>
              A secure, caring sanctuary where parents entrust their children with complete peace of mind.
            </p>
          </div>

          <div className={styles.safetyGrid}>
            <div className={styles.safetyCard}>
              <Icon name="building" size={28} />
              <h4>24/7 CCTV & Security</h4>
              <p>Over 180 high-resolution cameras covering all entries, corridors, and perimeters with trained security personnel.</p>
            </div>

            <div className={styles.safetyCard}>
              <Icon name="users" size={28} />
              <h4>Full-Time Infirmary</h4>
              <p>Resident medical officer and certified pediatric nurses equipped with emergency oxygen and first-response care.</p>
            </div>

            <div className={styles.safetyCard}>
              <Icon name="bus" size={28} />
              <h4>RFID & GPS Tracking</h4>
              <p>Live parent tracking app for school buses, automated boarding alerts, and speed governors on all vehicles.</p>
            </div>

            <div className={styles.safetyCard}>
              <Icon name="star" size={28} />
              <h4>Eco-Friendly Green Campus</h4>
              <p>Zero-plastic campus, solar-powered lighting, multi-stage RO drinking water, and rain-water harvesting systems.</p>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter settings={settings} />
    </div>
  );
};

export default FacilitiesPage;
