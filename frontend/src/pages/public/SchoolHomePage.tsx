import React from "react";
import { useGetPublicWebsiteDataQuery } from "../../store/api/cms.api";
import PublicNavbar from "./components/PublicNavbar";
import HeroSection from "./components/HeroSection";
import AboutSection from "./components/AboutSection";
import AcademicsSection from "./components/AcademicsSection";
import FacilitiesSection from "./components/FacilitiesSection";
import PublicNoticesSection from "./components/PublicNoticesSection";
import AdmissionsSection from "./components/AdmissionsSection";
import GalleryPreviewSection from "./components/GalleryPreviewSection";
import PublicFooter from "./components/PublicFooter";
import styles from "./SchoolHomePage.module.css";

const SchoolHomePage: React.FC = () => {
  const { data, isLoading } = useGetPublicWebsiteDataQuery();

  return (
    <div className={styles.homePage}>
      <PublicNavbar settings={data?.settings} />

      <main className={styles.mainContent}>
        <HeroSection settings={data?.settings} />
        <AboutSection settings={data?.settings} />
        <AcademicsSection />
        <FacilitiesSection facilities={data?.facilities} />
        <GalleryPreviewSection />
        <PublicNoticesSection notices={data?.notices} />
        <AdmissionsSection />
      </main>

      <PublicFooter settings={data?.settings} />
    </div>
  );
};

export default SchoolHomePage;
