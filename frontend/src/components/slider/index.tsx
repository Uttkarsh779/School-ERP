import React, { useState, useEffect, useRef } from "react";
import styles from "./Slider.module.css";
import { useGetSlidersQuery } from "../../store/services/sliders.api";

const Slider: React.FC = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false); // New state to track hover status
  const audioRef = useRef<HTMLAudioElement>(null);
  const [sliderData, setSliderData] = useState<ISliders[]>([]);
  const [totalSlides, setTotalSlides] = useState(0);

  const { data: sliders, isLoading: sliderLoading } =
    useGetSlidersQuery(undefined);

  useEffect(() => {
    if (!sliderLoading && sliders?.data) {
      setSliderData(sliders.data ?? []);
      setTotalSlides(sliders.data.length || 0);
    }
  }, [sliderLoading, sliders]);

  // Handles the automatic sliding
  useEffect(() => {
    // Only run the interval if the slider is not hovered
    if (!isHovered) {
      const slideInterval = setInterval(() => {
        setCurrentSlide((prevSlide) => (prevSlide + 1) % totalSlides);
      }, 3000);
      return () => clearInterval(slideInterval);
    }
  }, [totalSlides, isHovered]); // Re-run effect when isHovered changes

  // Handle manual navigation to the previous slide
  const handlePrev = () => {
    setCurrentSlide((prevSlide) => (prevSlide - 1 + totalSlides) % totalSlides);
  };

  // Handle manual navigation to the next slide
  const handleNext = () => {
    setCurrentSlide((prevSlide) => (prevSlide + 1) % totalSlides);
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch((error) => {
          console.error("Audio play failed:", error);
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div
      className={styles.sliderContainer}
      onMouseEnter={() => setIsHovered(true)} // Set hovered state to true
      onMouseLeave={() => setIsHovered(false)} // Set hovered state to false
    >
      <div
        className={styles.sliderWrapper}
        style={{ transform: `translateX(-${currentSlide * 100}%)` }}
      >
        {sliderData.map((slide) => (
          <div key={slide.id} className={styles.slide}>
            <img
              src={
                typeof slide.image === "string"
                  ? import.meta.env.VITE_BACKEND_SERVER + slide.image
                  : slide.image instanceof File
                  ? URL.createObjectURL(slide.image)
                  : undefined
              }
              alt={slide.title}
              className={styles.slideImage}
            />
            <div className={styles.slideContent}>
              <h2 className={styles.slideTitle}>{slide.title}</h2>
              <p className={styles.slideDescription}>{slide.description}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        className={`${styles.navButton} ${styles.prevButton}`}
        onClick={handlePrev}
      >
        &#10094;
      </button>
      <button
        className={`${styles.navButton} ${styles.nextButton}`}
        onClick={handleNext}
      >
        &#10095;
      </button>

      <div className={styles.indicators}>
        {sliderData.map((_, index) => (
          <span
            key={index}
            className={`${styles.indicator} ${
              index === currentSlide ? styles.active : ""
            }`}
            onClick={() => setCurrentSlide(index)}
          ></span>
        ))}
      </div>

      <audio ref={audioRef} src={""} loop />

      <button
        onClick={handlePlayPause}
        className={styles.playPauseButton}
        title={isPlaying ? "Pause Audio" : "Play Audio"}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>
    </div>
  );
};

export default Slider;
