import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/ui";
import type { IWebsiteSetting } from "../../../store/api/cms.api";
import styles from "./PublicFooter.module.css";

interface PublicFooterProps {
  settings?: IWebsiteSetting;
}

const PublicFooter: React.FC<PublicFooterProps> = ({ settings }) => {
  const schoolName = settings?.schoolName || "Delhi Public Academy";
  const tagline = settings?.tagline || "Empowering Minds, Inspiring Excellence";
  const phone = settings?.phone || "+91 98765 43210";
  const email = settings?.email || "info@dpa-school.edu.in";
  const address = settings?.address || "Sector 14, Knowledge Park, New Delhi, India - 110001";
  const affiliation = settings?.affiliationNo || "CBSE Affiliated";

  return (
    <footer id="contact" className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.grid}>
          {/* Brand Col */}
          <div className={styles.brandCol}>
            <div className={styles.brand}>
              <div className={styles.crest}>
                {schoolName.split(" ").map((w) => w[0]).slice(0, 3).join("")}
              </div>
              <span className={styles.schoolName}>{schoolName}</span>
            </div>
            <p className={styles.brandDesc}>
              {tagline}. Affiliated to Central Board of Secondary Education ({affiliation}). Dedicated to holistic development and global excellence.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className={styles.colTitle}>Quick Navigation</h4>
            <ul className={styles.linksList}>
              <li><Link to="/">Home Overview</Link></li>
              <li><Link to="/about">About Our Vision & Heritage</Link></li>
              <li><Link to="/academics">Academic Programs</Link></li>
              <li><Link to="/facilities">Campus Facilities & Labs</Link></li>
              <li><Link to="/gallery">Campus Photo Gallery</Link></li>
              <li><Link to="/admissions">Admissions & Eligibility</Link></li>
              <li><Link to="/contact">Contact & Campus Tour</Link></li>
            </ul>
          </div>

          {/* Academic Wings */}
          <div>
            <h4 className={styles.colTitle}>Academic Wings</h4>
            <ul className={styles.linksList}>
              <li><Link to="/academics">Foundational Wing (Nursery-II)</Link></li>
              <li><Link to="/academics">Preparatory Stage (Grades III-V)</Link></li>
              <li><Link to="/academics">Middle Years (Grades VI-VIII)</Link></li>
              <li><Link to="/academics">Senior Secondary Science</Link></li>
              <li><Link to="/academics">Commerce & Humanities</Link></li>
              <li><Link to="/facilities">STEM & Robotics Innovation Hub</Link></li>
            </ul>
          </div>

          {/* Contact Details */}
          <div>
            <h4 className={styles.colTitle}>Campus & Admissions Desk</h4>
            <ul className={styles.contactList}>
              <li className={styles.contactItem}>
                <Icon name="phone" size={16} />
                <a href={`tel:${phone}`}>{phone}</a>
              </li>
              <li className={styles.contactItem}>
                <Icon name="mail" size={16} />
                <a href={`mailto:${email}`}>{email}</a>
              </li>
              <li className={styles.contactItem}>
                <Icon name="building" size={16} />
                <span>{address}</span>
              </li>
              <li className={styles.contactItem}>
                <Icon name="calendar" size={16} />
                <span>Visiting Hours: Mon – Sat (9:00 AM – 3:00 PM)</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom copyright & ERP link */}
        <div className={styles.bottomBar}>
          <div>
            © {new Date().getFullYear()} {schoolName}. All rights reserved. Affiliation No: {affiliation}.
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <Link to="/admin/login" className={styles.erpButton}>
              <Icon name="dashboard" size={14} />
              <span>Staff & Student ERP Portal</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default PublicFooter;
