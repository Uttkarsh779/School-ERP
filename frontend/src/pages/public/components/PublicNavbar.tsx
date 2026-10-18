import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Icon } from "../../../components/ui";
import type { IWebsiteSetting } from "../../../store/api/cms.api";
import styles from "./PublicNavbar.module.css";

interface PublicNavbarProps {
  settings?: IWebsiteSetting;
}

const PublicNavbar: React.FC<PublicNavbarProps> = ({ settings }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const schoolName = settings?.schoolName || "RRS International School";
  const affiliation = settings?.affiliationNo || "CBSE Affiliated • No: 2130892";
  const phone = settings?.phone || "+91 98765 43210";
  const email = settings?.email || "admissions@rrs-school.edu.in";

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className={styles.header}>
      {/* Top micro bar with prestigious dark navy & gold theme */}
      <div className={styles.topBar}>
        <div className={styles.topContact}>
          <a href={`tel:${phone}`} className={styles.topItem}>
            <Icon name="phone" size={13} />
            <span>{phone}</span>
          </a>
          <a href={`mailto:${email}`} className={styles.topItem}>
            <Icon name="mail" size={13} />
            <span>{email}</span>
          </a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {settings?.admissionsOpen !== false && (
            <span className={styles.topBadge}>
              ★ Admissions Open for 2026-27
            </span>
          )}
          <span className={styles.affiliationText}>{affiliation}</span>
        </div>
      </div>

      {/* Main navigation container */}
      <div className={styles.navContainer}>
        <Link to="/" className={styles.brand} onClick={closeMenu}>
          <div className={styles.crest}>
            {schoolName.split(" ").map(w => w[0]).slice(0, 3).join("")}
          </div>
          <div className={styles.brandInfo}>
            <span className={styles.schoolName}>{schoolName}</span>
            <span className={styles.schoolAffiliation}>{affiliation}</span>
          </div>
        </Link>

        {/* Mobile menu hamburger toggle */}
        <button
          className={styles.mobileToggle}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle Navigation Menu"
        >
          <Icon name={mobileMenuOpen ? "close" : "menu"} size={24} />
        </button>

        {/* Navigation Links with real multi-page routing */}
        <nav>
          <ul className={`${styles.navLinks} ${mobileMenuOpen ? styles.navLinksOpen : ""}`}>
            <li>
              <NavLink to="/" end className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`} onClick={closeMenu}>
                Home
              </NavLink>
            </li>
            <li>
              <NavLink to="/about" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`} onClick={closeMenu}>
                About Us
              </NavLink>
            </li>
            <li>
              <NavLink to="/academics" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`} onClick={closeMenu}>
                Academics
              </NavLink>
            </li>
            <li>
              <NavLink to="/facilities" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`} onClick={closeMenu}>
                Campus Life
              </NavLink>
            </li>
            <li>
              <NavLink to="/gallery" className={({ isActive }) => `${styles.navLink} ${styles.galleryHighlight} ${isActive ? styles.navLinkActive : ""}`} onClick={closeMenu}>
                Photo Gallery
              </NavLink>
            </li>
            <li>
              <NavLink to="/admissions" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`} onClick={closeMenu}>
                Admissions
              </NavLink>
            </li>
            <li>
              <NavLink to="/contact" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`} onClick={closeMenu}>
                Contact
              </NavLink>
            </li>
            <li>
              <Link to="/admin/login" className={styles.portalBtn} onClick={closeMenu}>
                <Icon name="dashboard" size={15} />
                <span>ERP Portal</span>
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
};

export default PublicNavbar;
