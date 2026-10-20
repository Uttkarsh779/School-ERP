import { useEffect, useMemo } from "react";
import { useGetPublicWebsiteDataQuery, type IWebsiteSetting, type IWebsiteStat } from "../../store/api/cms.api";
import { FALLBACK_GALLERY, IMAGES } from "./content";

const FALLBACK_SETTINGS: IWebsiteSetting = {
  id: 0,
  schoolName: "RRS International School",
  tagline: "Empowering Minds, Inspiring Excellence",
  boardName: "CBSE",
  affiliationNo: "",
  establishedYear: 1998,
  heroTitle: "Where Curious Minds Grow Into Confident Leaders",
  heroSubtitle: "A caring, future-ready school offering strong academics, sports, arts and values from Nursery to Class XII.",
  heroCtaText: "Apply for Admission",
  heroCtaLink: "/admissions",
  admissionsOpen: true,
  aboutText: "",
  principalName: "",
  principalTitle: "Principal",
  principalMessage: "",
  phone: "",
  email: "",
  address: "",
};

// Indian sessions start in April; from October the school is admitting for the next one.
export const upcomingSession = (now = new Date()) => {
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = m < 3 ? y : m >= 9 ? y + 1 : y;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};

export const telHref = (phone?: string | null) => `tel:${(phone ?? "").replace(/[^\d+]/g, "")}`;
export const whatsappHref = (n?: string | null) => {
  const digits = (n ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}` : null;
};

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// Internal links ("/admissions") use the router; "#..." and external links stay as <a>.
export const isInternalLink = (href: string) => href.startsWith("/") && !href.startsWith("//");

export const useSite = () => {
  const query = useGetPublicWebsiteDataQuery();
  const data = query.data;

  return useMemo(() => {
    const s = { ...FALLBACK_SETTINGS, ...(data?.settings ?? {}) } as IWebsiteSetting;
    const years = Math.max(1, new Date().getFullYear() - (s.establishedYear || new Date().getFullYear()));
    const defaultStats: IWebsiteStat[] = [
      { value: `${years}+`, label: "Years of excellence" },
      { value: "Nur–XII", label: "Classes offered" },
      { value: s.boardName || "CBSE", label: "Affiliated board" },
      { value: "100%", label: "Safe, CCTV campus" },
    ];
    // "#admissions" was the old single-page anchor; the site now has a real page for it.
    const ctaLink = !s.heroCtaLink || s.heroCtaLink === "#admissions" ? "/admissions" : s.heroCtaLink;
    return {
      ...query,
      settings: { ...s, heroCtaLink: ctaLink },
      session: s.academicSession || upcomingSession(),
      years,
      stats: s.stats && s.stats.length > 0 ? s.stats : defaultStats,
      heroImage: s.heroImageUrl || IMAGES.campusHero,
      aboutImage: s.aboutImageUrl || IMAGES.smartClassroom,
      principalPhoto: s.principalPhotoUrl || IMAGES.principal,
      facilities: data?.facilities ?? [],
      notices: data?.notices ?? [],
      gallery: data?.gallery && data.gallery.length > 0 ? data.gallery : FALLBACK_GALLERY,
      testimonials: data?.testimonials ?? [],
      faqs: data?.faqs ?? [],
    };
  }, [data, query]);
};

export const usePageTitle = (title: string | null, schoolName: string) => {
  useEffect(() => {
    document.title = title ? `${title} | ${schoolName}` : `${schoolName} — Official Website`;
  }, [title, schoolName]);
};
