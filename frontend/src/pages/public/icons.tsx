import type { CSSProperties } from "react";

// Line icons for the public website (24×24, stroke = currentColor).
const PATHS = {
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  chevronDown: "M6 9l6 6 6-6",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  close: "M6 6l12 12M18 6L6 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  calendar: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M9 7h6",
  flask: "M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-2.5L14 9V3M7.5 15h9",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9 17h6v4H9z",
  palette: "M12 3a9 9 0 0 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-.9-.6-1.2-.6-2 0-.8.7-1.5 1.6-1.5H17a4 4 0 0 0 4-4c0-5-4-9-9-9zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01",
  bus: "M5 17V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v11M5 12h14M5 17h14v2M7 19v2M17 19v2M8 15h.01M16 15h.01",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6zM9 12l2 2 4-4",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6 6 0 0 1 3 6",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z",
  megaphone: "M3 10v4h3l7 4V6L6 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01",
  heart: "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z",
  leaf: "M5 19C5 10 11 5 20 4c0 9-5 15-14 15zM5 19l7-7",
  building: "M4 21V7l8-4 8 4v14M9 21v-5h6v5M8 10h.01M12 10h.01M16 10h.01M8 13h.01M16 13h.01",
  graduation: "M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6",
  layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18",
  bell: "M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0",
  fileText: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  clipboard: "M9 4h6v3H9zM7 5H5v16h14V5h-2M9 13l2 2 4-4",
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  quote: "M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6",
  login: "M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 16l4-4-4-4M18 12H9",
  whatsapp: "M4 20l1.3-4A8 8 0 1 1 8 18.8zM9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.5-2-1-1 1c-1-.5-2.5-2-3-3l1-1-1-2z",
  facebook: "M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z",
  instagram: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.5 6.5h.01",
  youtube: "M3 8.5A3 3 0 0 1 5.6 5.6C7.4 5.3 9.7 5 12 5s4.6.3 6.4.6A3 3 0 0 1 21 8.5v7a3 3 0 0 1-2.6 2.9c-1.8.3-4.1.6-6.4.6s-4.6-.3-6.4-.6A3 3 0 0 1 3 15.5zM10 9v6l5-3z",
  xLogo: "M4 4l16 16M20 4L4 20",
  award: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14L7 21l5-3 5 3-1.5-7",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  pin2: "M12 2v4M12 18v4M2 12h4M18 12h4",
} as const;

export type SiteIconName = keyof typeof PATHS;

// CMS facility icon names (shared with the ERP icon set) → public icons.
export const facilityIcon = (name?: string | null): SiteIconName => {
  const map: Record<string, SiteIconName> = {
    building: "building",
    layers: "flask",
    graduationCap: "book",
    bus: "bus",
    users: "palette",
    calendar: "calendar",
    star: "trophy",
    globe: "globe",
    clipboardCheck: "clipboard",
    bell: "bell",
    fileText: "fileText",
    dashboard: "dashboard",
  };
  return map[name ?? ""] ?? "building";
};

interface SiteIconProps {
  name: SiteIconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

export const SiteIcon = ({ name, size = 20, className, style, strokeWidth = 1.8 }: SiteIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
    aria-hidden="true"
    focusable="false"
  >
    <path d={PATHS[name]} />
  </svg>
);
