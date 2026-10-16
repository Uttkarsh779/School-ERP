import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGetGalleryListQuery } from "../../store/services/galleryImage.api";
import styles from "./Gallery.module.css";

interface GalleryImage {
  id: number;
  ref_id: number;
  image: string;
  status?: number;
  updatedOn?: string;
  createdOn?: string;
}

interface GalleryItem {
  id: number;
  title: string;
  description: string;
  status?: number;
  updatedOn?: string;
  createdOn?: string;
  images: GalleryImage[];
}

interface ModalImage {
  src: string;
  title: string;
  description: string;
  id?: number;
}

const Gallery: React.FC = () => {
  const {
    data: fetchedGalleryData,
    isLoading,
    isError,
    error,
  } = useGetGalleryListQuery({});

  const galleryItems: GalleryItem[] = Array.isArray(fetchedGalleryData?.data)
    ? fetchedGalleryData.data
    : Array.isArray(fetchedGalleryData)
    ? fetchedGalleryData
    : [];

  const [selectedImage, setSelectedImage] = useState<ModalImage | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [currentGroup, setCurrentGroup] = useState<GalleryItem | null>(null);

  const openModal = (group: GalleryItem, img: ModalImage, index: number) => {
    setCurrentGroup(group);
    setSelectedImage(img);
    setCurrentIndex(index);
    document.body.style.overflow = "hidden";
  };

  const closeModal = () => {
    setSelectedImage(null);
    setCurrentGroup(null);
    document.body.style.overflow = "unset";
  };

  const nextImage = () => {
    if (!currentGroup) return;
    const nextIndex = (currentIndex + 1) % currentGroup.images.length;
    const nextImg = currentGroup.images[nextIndex];
    setCurrentIndex(nextIndex);
    setSelectedImage({
      src: nextImg.image.startsWith("http")
        ? nextImg.image
        : `${import.meta.env.VITE_BACKEND_SERVER}${nextImg.image}`,
      title: currentGroup.title,
      description: currentGroup.description,
      id: nextImg.id,
    });
  };

  const prevImage = () => {
    if (!currentGroup) return;
    const prevIndex =
      (currentIndex - 1 + currentGroup.images.length) %
      currentGroup.images.length;
    const prevImg = currentGroup.images[prevIndex];
    setCurrentIndex(prevIndex);
    setSelectedImage({
      src: prevImg.image.startsWith("http")
        ? prevImg.image
        : `${import.meta.env.VITE_BACKEND_SERVER}${prevImg.image}`,
      title: currentGroup.title,
      description: currentGroup.description,
      id: prevImg.id,
    });
  };

  useEffect(() => {
    const handleDocumentKeyDown = (e: KeyboardEvent) => {
      if (!selectedImage) return;
      if (e.key === "Escape") closeModal();
      if (e.key === "ArrowRight") nextImage();
      if (e.key === "ArrowLeft") prevImage();
    };

    if (selectedImage) {
      document.addEventListener("keydown", handleDocumentKeyDown);
    }
    return () => {
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [selectedImage, currentIndex, currentGroup]);

  useEffect(() => {
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.9 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.5, ease: "easeOut" },
    },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: { duration: 0.3, ease: "easeOut" },
    },
    exit: { opacity: 0, scale: 0.8, transition: { duration: 0.2 } },
  };

  if (isLoading) {
    return (
      <div className={styles.galleryContainer}>
        <h1 className={styles.galleryTitle}>Photo Gallery</h1>
        <div className={styles.loadingState}>Loading gallery...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.galleryContainer}>
        <h1 className={styles.galleryTitle}>Photo Gallery</h1>
        <div className={styles.errorState}>
          Error loading gallery: {error?.toString() || "Unknown error"}
        </div>
      </div>
    );
  }

  if (galleryItems.length === 0) {
    return (
      <div className={styles.galleryContainer}>
        <h1 className={styles.galleryTitle}>Photo Gallery</h1>
        <div className={styles.emptyState}>No galleries found.</div>
      </div>
    );
  }

  return (
    <div className={styles.galleryContainer}>
      <motion.div
        className={styles.galleryHeader}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className={styles.galleryTitle}>Photo Gallery</h1>
      </motion.div>

      {galleryItems.map((group) => (
        <motion.div
          key={group.id}
          className={styles.eventSection}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className={styles.eventHeader}>
            <h2 className={styles.eventTitle}>{group.title}</h2>
            <p className={styles.eventDescription}>{group.description}</p>

            <motion.div
              className={styles.galleryGrid}
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {group.images.map((img, imgIdx) => {
                const imgData: ModalImage = {
                  src: img.image.startsWith("http")
                    ? img.image
                    : `${import.meta.env.VITE_BACKEND_SERVER}${img.image}`,
                  title: group.title,
                  description: group.description,
                  id: img.id,
                };
                return (
                  <motion.div
                    key={`gallery-${group.id}-${img.id}`}
                    className={styles.galleryItem}
                    variants={itemVariants}
                    whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <div className={styles.imageWrapper}>
                      <img
                        src={imgData.src}
                        alt={group.title}
                        className={styles.galleryImage}
                        onClick={() => openModal(group, imgData, imgIdx)}
                        loading="lazy"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openModal(group, imgData, imgIdx);
                          }
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                      <div
                        className={styles.imageOverlay}
                        onClick={() => openModal(group, imgData, imgIdx)}
                      >
                        <div className={styles.overlayContent}>
                          <span className={styles.viewIcon}>👁️</span>
                          <span className={styles.imageNumber}>
                            #{imgIdx + 1}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </motion.div>
      ))}

      <AnimatePresence>
        {selectedImage && (
          <motion.div
            className={styles.galleryModal}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
            tabIndex={0}
          >
            <motion.div
              className={styles.galleryModalContent}
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={(e) => e.stopPropagation()}
            >
              {currentGroup?.images.length! > 1 && (
                <>
                  <button
                    className={`${styles.navArrow} ${styles.navArrowLeft}`}
                    onClick={prevImage}
                    aria-label="Previous image"
                  >
                    ←
                  </button>
                  <button
                    className={`${styles.navArrow} ${styles.navArrowRight}`}
                    onClick={nextImage}
                    aria-label="Next image"
                  >
                    →
                  </button>
                </>
              )}

              <div className={styles.modalContentWrapper}>
                <div className={styles.modalImageContainer}>
                  <motion.img
                    key={selectedImage.src}
                    src={selectedImage.src}
                    alt={selectedImage.title}
                    className={styles.galleryModalImage}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                </div>

                <div className={styles.modalInfoPanel}>
                  <div className={styles.modalInfoContent}>
                    <div className={styles.imageCounterModal}>
                      {currentIndex + 1} / {currentGroup?.images.length}
                    </div>
                    <h2 className={styles.modalImageTitle}>
                      {selectedImage.title}
                    </h2>
                    <p className={styles.modalImageDescription}>
                      {selectedImage.description}
                    </p>
                    {selectedImage.id && (
                      <div className={styles.modalImageMeta}>
                        <div className={styles.metaItem}>
                          <span className={styles.metaLabel}>ID:</span>
                          <span className={styles.metaValue}>
                            {selectedImage.id}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button
                className={styles.galleryCloseBtn}
                onClick={closeModal}
                aria-label="Close modal"
              >
                ✕
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Gallery;
