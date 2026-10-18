import React from "react";
import { Link } from "react-router-dom";
import { useGetPublicWebsiteDataQuery } from "../../store/api/cms.api";
import PublicNavbar from "./components/PublicNavbar";
import PublicFooter from "./components/PublicFooter";
import { Icon } from "../../components/ui";
import styles from "./ContactPage.module.css";

const ContactPage: React.FC = () => {
  const { data } = useGetPublicWebsiteDataQuery();
  const settings = data?.settings;

  const schoolName = settings?.schoolName || "RRS International School";
  const address = settings?.address || "Sector 14, Knowledge Park, New Delhi, India - 110001";
  const phone = settings?.phone || "+91 98765 43210";
  const email = settings?.email || "admissions@rrs-school.edu.in";

  return (
    <div className={styles.page}>
      <PublicNavbar settings={settings} />

      <header className={styles.heroHeader}>
        <div className={styles.headerContainer}>
          <div className={styles.badge}>
            <Icon name="phone" size={14} />
            <span>We Are Here For You</span>
          </div>
          <h1 className={styles.title}>Connect With {schoolName}</h1>
          <p className={styles.subtitle}>
            Plan a campus walkthrough, reach out to our academic counselors, or connect with our transport and administrative offices.
          </p>
        </div>
      </header>

      <main className={styles.container}>
        {/* Contact Info Cards */}
        <div className={styles.cardsGrid}>
          <div className={styles.infoCard}>
            <div className={styles.cardIcon}>
              <Icon name="building" size={26} />
            </div>
            <h3 className={styles.cardTitle}>Campus Location</h3>
            <p className={styles.cardText}>
              {address}
            </p>
            <span style={{ fontSize: "0.82rem", color: "#ea580c", fontWeight: 700 }}>
              25-Acre Eco-Campus
            </span>
          </div>

          <div className={styles.infoCard}>
            <div className={styles.cardIcon}>
              <Icon name="phone" size={26} />
            </div>
            <h3 className={styles.cardTitle}>Admissions Desk</h3>
            <p className={styles.cardText}>
              Direct telephone line for enrollment queries, fee guidance, and campus appointment scheduling.
            </p>
            <a href={`tel:${phone}`} className={styles.contactLink}>
              {phone}
            </a>
          </div>

          <div className={styles.infoCard}>
            <div className={styles.cardIcon}>
              <Icon name="mail" size={26} />
            </div>
            <h3 className={styles.cardTitle}>Official Inquiries</h3>
            <p className={styles.cardText}>
              Send written applications, transfer inquiries, academic credentials, and feedback to our desk.
            </p>
            <a href={`mailto:${email}`} className={styles.contactLink}>
              {email}
            </a>
          </div>
        </div>

        {/* Campus Map & Visiting Hours */}
        <div className={styles.mapSection}>
          <div className={styles.campusDetails}>
            <h3>Visiting Hours & Appointments</h3>
            <p>
              Prospective parents and visitors are welcomed at the main reception during official school visiting hours. Prior appointment through our helpline is recommended for principal and counselor meetings.
            </p>

            <div className={styles.scheduleBox}>
              <div className={styles.scheduleRow}>
                <span className={styles.scheduleDay}>Monday – Friday</span>
                <span className={styles.scheduleHours}>8:30 AM – 3:30 PM</span>
              </div>
              <div className={styles.scheduleRow}>
                <span className={styles.scheduleDay}>Saturday</span>
                <span className={styles.scheduleHours}>9:00 AM – 1:30 PM</span>
              </div>
              <div className={styles.scheduleRow}>
                <span className={styles.scheduleDay}>Sunday & Public Holidays</span>
                <span className={styles.scheduleHours}>Closed</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "1rem", padding: "2rem", textAlign: "center" }}>
              <Icon name="calendar" size={32} />
              <h4 style={{ margin: "1rem 0 0.5rem 0", color: "#0a1f42", fontSize: "1.2rem" }}>Schedule a Campus Tour</h4>
              <p style={{ color: "#64748b", fontSize: "0.88rem", marginBottom: "1.25rem" }}>
                Experience our smart classrooms, science labs, and sports arenas firsthand with a dedicated admissions coordinator.
              </p>
              <Link
                to="/admissions"
                style={{
                  display: "inline-block",
                  background: "linear-gradient(135deg, #0a1f42 0%, #1e40af 100%)",
                  color: "#ffffff",
                  fontWeight: 700,
                  padding: "0.75rem 1.75rem",
                  borderRadius: "0.6rem",
                  textDecoration: "none",
                }}
              >
                Book Walkthrough Online
              </Link>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter settings={settings} />
    </div>
  );
};

export default ContactPage;
