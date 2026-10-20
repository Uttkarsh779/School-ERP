import type { SVGProps } from "react";

// Small dependency-free icon set (no external font/CDN — matters for a PWA
// aimed at low-bandwidth rural connections). Hand-drawn, stroke-based, 24x24.
const paths: Record<string, string> = {
  dashboard: "M4 4h7v7H4V4zm9 0h7v4h-7V4zm0 6h7v10h-7V10zM4 13h7v7H4v-7z",
  calendar: "M7 3v3M17 3v3M4 8h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
  layers: "M12 3 3 8l9 5 9-5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5",
  users: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 8a3 3 0 1 0 0-6M22 20c0-2.8-2-5.1-4.7-5.7",
  graduationCap: "M2 9l10-5 10 5-10 5-10-5zM6 11.5V17c0 1.5 3 3 6 3s6-1.5 6-3v-5.5M22 9v6",
  familyCheck: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 2.5-5.5 5.5-5.5S14 17 14 20M17 8l1.8 1.8L22 6.5",
  clipboardCheck: "M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM6 6h12v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6zM9 13l2 2 4-4",
  logout: "M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h13",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  bell: "M12 3a5 5 0 0 0-5 5v3.5c0 .9-.4 1.8-1.1 2.4L4 16h16l-1.9-2.1a3.3 3.3 0 0 1-1.1-2.4V8a5 5 0 0 0-5-5zM9.5 19a2.5 2.5 0 0 0 5 0",
  chevronDown: "M6 9l6 6 6-6",
  building: "M4 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16M12 21V9a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v12M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01",
  plus: "M12 5v14M5 12h14",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  bus: "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 12 10s-6.7.6-8.5 1.1C2.7 11.3 2 12.1 2 13v3c0 .6.4 1 1 1h2M4 6h16a2 2 0 0 1 2 2v2H2V8a2 2 0 0 1 2-2zM6.5 17a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM17.5 17a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",
  mail: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  check: "M20 6L9 17l-5-5",
  arrowRight: "M5 12h14M12 5l7 7-7 7",
  arrowLeft: "M19 12H5M12 19l-7-7 7-7",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  fileText: "M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4zM14 3v4h4M9 12h6M9 16h6M9 8h2",
  badge: "M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01M9.5 14.5l5-5",
  externalLink: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  chevronRight: "M9 6l6 6-6 6",
  hardHat: "M3 18h18M5 18v-2a7 7 0 0 1 14 0v2M10 9.5V6h4v3.5M9 6h6",
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: keyof typeof paths;
  size?: number;
}

const Icon = ({ name, size = 20, ...rest }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    <path d={paths[name]} />
  </svg>
);

export default Icon;
