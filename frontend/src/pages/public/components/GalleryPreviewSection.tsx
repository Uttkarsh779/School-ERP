import React from "react";
import { Link } from "react-router-dom";
import { galleryItems } from "../galleryData";
import styles from "./GalleryPreviewSection.module.css";

const GalleryPreviewSection: React.FC = () => {
  // Take first 4 highlights
  const highlights = galleryItems.slice(0, 4);

  return (
    <section className={styles.previewSection}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <div className={styles.headerText}>
            <span className={styles.preTitle}>Life at Our Campus</span>
            <h2 className={styles.mainTitle}>A Vibrant Community of Learning & Joy</h2>
            <p className={styles.leadText}>
              From robotics arenas and Olympic-standard sports grounds to musical symphonies and digital libraries, glimpse life inside our 25-acre international school.
            </p>
          </div>

          <Link to="/gallery" className={styles.galleryLinkBtn}>
            <span>View Full Photo Gallery</span>
            <span>→</span>
          </Link>
        </div>

        <div className={styles.grid}>
          {highlights.map((item) => (
            <Link key={item.id} to="/gallery" className={styles.card}>
              <img src={item.imageUrl} alt={item.title} className={styles.image} loading="lazy" />
              <div className={styles.overlay}>
                <span className={styles.badge}>{item.category}</span>
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <p className={styles.cardDesc}>{item.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default GalleryPreviewSection;
