import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui";
import type { IWebsiteFacility } from "../../../store/api/cms.api";
import styles from "./FacilitiesSection.module.css";

import smartClassImg from "../../../assets/images/smart_classroom.jpg";
import stemLabImg from "../../../assets/images/stem_lab.jpg";
import sportsImg from "../../../assets/images/sports_complex.jpg";
import libraryImg from "../../../assets/images/library.jpg";
import auditoriumImg from "../../../assets/images/auditorium.jpg";
import campusImg from "../../../assets/images/campus_hero.jpg";

interface FacilitiesSectionProps {
  facilities?: IWebsiteFacility[];
}

const defaultFacilityImages: Record<number, string> = {
  1: smartClassImg,
  2: stemLabImg,
  3: sportsImg,
  4: libraryImg,
  5: campusImg,
  6: auditoriumImg,
};

const FacilitiesSection: React.FC<FacilitiesSectionProps> = ({ facilities }) => {
  const displayFacilities = facilities && facilities.length > 0 ? facilities : [
    {
      id: 1,
      title: "Smart Digital Classrooms",
      description: "Interactive smart boards, high-speed connectivity, and ergonomic acoustic setups for engaging visual learning.",
      iconName: "building",
      order: 1,
      isActive: true,
    },
    {
      id: 2,
      title: "Advanced STEM & Computer Labs",
      description: "Cutting-edge physics, chemistry, biology, robotics, and coding labs with hands-on experimentation kits.",
      iconName: "layers",
      order: 2,
      isActive: true,
    },
    {
      id: 3,
      title: "Sports Complex & Athletic Turf",
      description: "Dedicated courts for basketball, badminton, football turf, cricket nets, and indoor games supervised by NIS coaches.",
      iconName: "dashboard",
      order: 3,
      isActive: true,
    },
    {
      id: 4,
      title: "Comprehensive Digital Library",
      description: "Over 15,000 physical volumes, research journals, e-book readers, and serene reading spaces for curious minds.",
      iconName: "graduationCap",
      order: 4,
      isActive: true,
    },
    {
      id: 5,
      title: "GPS-Monitored Safe Transport",
      description: "Air-conditioned bus fleet equipped with real-time GPS tracking, speed governors, CCTV cameras, and female attendants.",
      iconName: "bus",
      order: 5,
      isActive: true,
    },
    {
      id: 6,
      title: "Visual & Performing Arts Studio",
      description: "Acoustically treated auditorium, classical & western music rooms, dance studio, and pottery & fine arts workshop.",
      iconName: "users",
      order: 6,
      isActive: true,
    },
  ];

  return (
    <section id="facilities" className={styles.facilitiesSection}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.preTitle}>World-Class Infrastructure</span>
          <h2 className={styles.mainTitle}>Designed to Inspire, Built to Excel</h2>
          <p className={styles.leadText}>
            Our sprawling, green campus combines safety, modern technology, and vibrant recreational zones to nurture every student’s potential.
          </p>
        </div>

        <div className={styles.grid}>
          {displayFacilities.map((fac, idx) => {
            const imgSrc = fac.imageUrl || defaultFacilityImages[fac.id] || defaultFacilityImages[(idx % 6) + 1];
            return (
              <div key={fac.id} className={`${styles.card} ${styles.cardHasImage}`}>
                <div className={styles.imageBanner}>
                  <img src={imgSrc} alt={fac.title} className={styles.facilityImg} loading="lazy" />
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.iconCircle}>
                    <Icon name={(fac.iconName as any) || "building"} size={26} />
                  </div>
                  <h3 className={styles.facilityTitle}>{fac.title}</h3>
                  <p className={styles.facilityDesc}>{fac.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className={styles.viewAllRow}>
          <Link to="/facilities" className={styles.viewAllBtn}>
            <span>Explore All Campus Infrastructure & Labs</span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default FacilitiesSection;
