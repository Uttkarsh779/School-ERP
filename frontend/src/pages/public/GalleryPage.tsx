import React, { useState } from "react";
import { useGetPublicWebsiteDataQuery } from "../../store/api/cms.api";
import PublicNavbar from "./components/PublicNavbar";
import PublicFooter from "./components/PublicFooter";
import { Icon } from "../../components/ui";
import { GALLERY_ITEMS, type GalleryItem } from "./galleryData";
import styles from "./GalleryPage.module.css";

const categories = ["All", "Campus", "Academics", "Sports", "Arts"] as const;

const GalleryPage: React.FC = () => {
  const { data } = useGetPublicWebsiteDataQuery();
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [activeItem, setActiveItem] = useState<GalleryItem | null>(null);

  const filteredItems = selectedCategory === "All"
    ? GALLERY_ITEMS
    : GALLERY_ITEMS.filter((item) => item.category === selectedCategory);

  return (
    <div className={styles.page}>
      <PublicNavbar settings={data?.settings} />

      <header className={styles.headerSection}>
        <div className={styles.headerContainer}>
          <div className={styles.badge}>
            <Icon name="star" size={14} />
            <span>Campus in Action</span>
          </div>
          <h1 className={styles.title}>Visual Life at RRS International</h1>
          <p className={styles.subtitle}>
            Explore our vibrant campus architecture, world-class athletic facilities, cutting-edge STEM laboratories, and inspiring artistic achievements.
          </p>
        </div>
      </header>

      <main className={styles.contentContainer}>
        {/* Category Filter Chips */}
        <div className={styles.filterBar}>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`${styles.filterBtn} ${selectedCategory === cat ? styles.filterBtnActive : ""}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat === "All" ? "All Moments" : cat}
            </button>
          ))}
        </div>

        {/* Gallery Cards Grid */}
        <div className={styles.galleryGrid}>
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className={styles.galleryCard}
              onClick={() => setActiveItem(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setActiveItem(item)}
            >
              <div className={styles.imageWrapper}>
                <img src={item.imageUrl} alt={item.title} className={styles.cardImage} loading="lazy" />
                <span className={styles.categoryTag}>{item.category}</span>
                <div className={styles.cardOverlay}>
                  <div className={styles.zoomIcon}>
                    <Icon name="arrowRight" size={18} />
                  </div>
                </div>
              </div>
              <div className={styles.cardContent}>
                <h3 className={styles.cardTitle}>{item.title}</h3>
                <p className={styles.cardDesc}>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Lightbox Modal */}
      {activeItem && (
        <div className={styles.lightboxOverlay} onClick={() => setActiveItem(null)}>
          <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.lightboxClose}
              onClick={() => setActiveItem(null)}
              aria-label="Close Preview"
            >
              <Icon name="close" size={20} />
            </button>
            <img src={activeItem.imageUrl} alt={activeItem.title} className={styles.lightboxImage} />
            <div className={styles.lightboxDetails}>
              <span className={styles.categoryTag} style={{ position: "static", display: "inline-block", marginBottom: "0.5rem" }}>
                {activeItem.category}
              </span>
              <h2 className={styles.lightboxTitle}>{activeItem.title}</h2>
              <p className={styles.lightboxDesc}>{activeItem.description}</p>
            </div>
          </div>
        </div>
      )}

      <PublicFooter settings={data?.settings} />
    </div>
  );
};

export default GalleryPage;
