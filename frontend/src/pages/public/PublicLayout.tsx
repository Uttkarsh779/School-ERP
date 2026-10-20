import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { SiteIcon, type SiteIconName } from "./icons";
import { cx } from "./parts";
import { telHref, useSite, whatsappHref } from "./useSite";
import s from "./site.module.css";

export const NAV_LINKS = [
  { to: "/", label: "Home", end: true },
  { to: "/about", label: "About" },
  { to: "/academics", label: "Academics" },
  { to: "/campus", label: "Campus Life" },
  { to: "/admissions", label: "Admissions" },
  { to: "/notices", label: "Notices" },
  { to: "/gallery", label: "Gallery" },
  { to: "/contact", label: "Contact" },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w && w[0] === w[0].toUpperCase())
    .map((w) => w[0])
    .slice(0, 3)
    .join("") || name.slice(0, 2).toUpperCase();

export const Brand = ({ footer }: { footer?: boolean }) => {
  const { settings } = useSite();
  return (
    <Link to="/" className={s.brand} aria-label={`${settings.schoolName} home`}>
      {settings.logoUrl ? (
        <img src={settings.logoUrl} alt="" className={s.crestImg} />
      ) : (
        <span className={s.crest} aria-hidden="true">
          {initials(settings.schoolName)}
        </span>
      )}
      <span className={s.brandText}>
        <span className={s.brandName}>{settings.schoolName}</span>
        <span className={s.brandSub}>
          {settings.boardName}
          {settings.affiliationNo ? ` Affiliated · No. ${settings.affiliationNo}` : footer ? "" : " · Nursery to XII"}
        </span>
      </span>
    </Link>
  );
};

const PublicLayout = () => {
  const site = useSite();
  const { settings, session } = site;
  const { pathname, hash } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // New page → top (or to the #anchor); always close the mobile menu.
  useEffect(() => {
    setMenuOpen(false);
    if (hash) {
      const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
      return () => window.clearTimeout(t);
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 300);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const wa = whatsappHref(settings.whatsapp);
  const socials: { href?: string | null; icon: SiteIconName; label: string }[] = [
    { href: settings.facebookUrl, icon: "facebook", label: "Facebook" },
    { href: settings.instagramUrl, icon: "instagram", label: "Instagram" },
    { href: settings.youtubeUrl, icon: "youtube", label: "YouTube" },
    { href: settings.twitterUrl, icon: "xLogo", label: "X (Twitter)" },
  ];

  return (
    <div className={s.site}>
      <a href="#main" className={s.skipLink}>
        Skip to content
      </a>

      <div className={s.topBar}>
        <div className={cx(s.container, s.topBarInner)}>
          <div className={s.topBarGroup}>
            {settings.phone && (
              <a href={telHref(settings.phone)} className={s.topBarItem}>
                <SiteIcon name="phone" size={14} /> {settings.phone}
              </a>
            )}
            {settings.email && (
              <a href={`mailto:${settings.email}`} className={cx(s.topBarItem, s.topBarHideSm)}>
                <SiteIcon name="mail" size={14} /> {settings.email}
              </a>
            )}
            {settings.officeHours && (
              <span className={cx(s.topBarItem, s.topBarHideSm, s.desktopOnly)}>
                <SiteIcon name="clock" size={14} /> {settings.officeHours}
              </span>
            )}
          </div>
          <div className={s.topBarGroup}>
            {settings.admissionsOpen && (
              <Link to="/admissions" className={s.topBarBadge}>
                Admissions open {session}
              </Link>
            )}
            <Link to="/admin/login" className={cx(s.topBarItem, s.topBarHideSm)}>
              <SiteIcon name="login" size={14} /> Portal login
            </Link>
          </div>
        </div>
      </div>

      <header className={cx(s.header, scrolled && s.headerScrolled)}>
        <div className={cx(s.container, s.headerInner)}>
          <Brand />
          <button
            type="button"
            className={s.menuToggle}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="site-nav"
          >
            <SiteIcon name={menuOpen ? "close" : "menu"} size={22} />
          </button>
          {menuOpen && <div className={s.navBackdrop} onClick={() => setMenuOpen(false)} aria-hidden="true" />}
          <nav id="site-nav" className={cx(s.nav, menuOpen && s.navOpen)} aria-label="Main">
            {NAV_LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => cx(s.navLink, isActive && s.navLinkActive)}>
                {l.label}
              </NavLink>
            ))}
            <div className={s.navActions}>
              <Link to="/admin/login" className={cx(s.btn, s.btnOutline, s.btnSm, s.mobileOnly)} style={{ textAlign: "center" }}>
                Portal login
              </Link>
              <Link to="/admissions#enquiry" className={cx(s.btn, s.btnPrimary, s.btnSm)}>
                Apply now
              </Link>
            </div>
          </nav>
        </div>
      </header>

      <main id="main" className={s.main}>
        <Outlet />
      </main>

      <footer className={s.footer}>
        <div className={cx(s.container, s.footerGrid)}>
          <div>
            <Brand footer />
            <p className={s.footerAbout}>{settings.tagline}</p>
            {socials.some((x) => x.href) && (
              <div className={s.socials}>
                {socials
                  .filter((x) => x.href)
                  .map((x) => (
                    <a key={x.label} href={x.href!} className={s.social} target="_blank" rel="noopener noreferrer" aria-label={x.label}>
                      <SiteIcon name={x.icon} size={17} />
                    </a>
                  ))}
              </div>
            )}
          </div>
          <div>
            <h4>Explore</h4>
            <ul className={s.footerLinks}>
              {NAV_LINKS.slice(1, 5).map((l) => (
                <li key={l.to}>
                  <Link to={l.to}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Quick links</h4>
            <ul className={s.footerLinks}>
              <li>
                <Link to="/notices">Notices & circulars</Link>
              </li>
              <li>
                <Link to="/gallery">Photo gallery</Link>
              </li>
              <li>
                <Link to="/admissions#enquiry">Admission enquiry</Link>
              </li>
              <li>
                <Link to="/admin/login">Student / staff login</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Contact us</h4>
            <ul className={s.footerLinks}>
              {settings.address && (
                <li className={s.footerContact}>
                  <SiteIcon name="pin" size={17} />
                  <span>{settings.address}</span>
                </li>
              )}
              {settings.phone && (
                <li>
                  <a href={telHref(settings.phone)} className={s.footerContact}>
                    <SiteIcon name="phone" size={17} />
                    <span>{settings.phone}</span>
                  </a>
                </li>
              )}
              {settings.email && (
                <li>
                  <a href={`mailto:${settings.email}`} className={s.footerContact}>
                    <SiteIcon name="mail" size={17} />
                    <span style={{ wordBreak: "break-all" }}>{settings.email}</span>
                  </a>
                </li>
              )}
              {settings.officeHours && (
                <li className={s.footerContact}>
                  <SiteIcon name="clock" size={17} />
                  <span>{settings.officeHours}</span>
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className={cx(s.container, s.footerBottom)}>
          <span>
            © {new Date().getFullYear()} {settings.schoolName}. All rights reserved.
          </span>
          <span>
            {settings.boardName}
            {settings.affiliationNo && ` Affiliation No. ${settings.affiliationNo}`}
            {settings.schoolCode && ` · School Code ${settings.schoolCode}`}
          </span>
        </div>
      </footer>

      <div className={s.floating}>
        {scrolled && (
          <button type="button" className={cx(s.fab, s.fabTop)} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Back to top">
            <SiteIcon name="arrowUp" size={20} />
          </button>
        )}
        {wa && (
          <a href={wa} className={cx(s.fab, s.fabWhatsapp)} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp">
            <SiteIcon name="whatsapp" size={24} />
          </a>
        )}
      </div>
    </div>
  );
};

export default PublicLayout;
