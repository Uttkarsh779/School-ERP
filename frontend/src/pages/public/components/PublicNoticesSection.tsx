import React, { useState } from "react";
import { Icon, Modal, Button } from "../../../components/ui";
import type { IWebsitePublicNotice } from "../../../store/api/cms.api";
import styles from "./PublicNoticesSection.module.css";

interface PublicNoticesSectionProps {
  notices?: IWebsitePublicNotice[];
}

const PublicNoticesSection: React.FC<PublicNoticesSectionProps> = ({ notices }) => {
  const [activeNotice, setActiveNotice] = useState<IWebsitePublicNotice | null>(null);

  const displayNotices = notices && notices.length > 0 ? notices : [
    {
      id: 1,
      title: "Admission Open for Academic Session 2026-27",
      content: "Registrations are now open for Nursery through Grade XI. Prospective parents can submit the online enquiry form or visit the school admissions desk between 9:00 AM and 2:00 PM on all working days.",
      category: "Admission",
      isPinned: true,
      publishedAt: new Date().toISOString(),
      isActive: true,
    },
    {
      id: 2,
      title: "Annual Sports Meet & Athletic Championship",
      content: "The annual inter-house athletics tournament will be held on the school sports grounds. Parents are cordially invited to cheer the young athletes during the opening ceremony.",
      category: "Event",
      isPinned: false,
      publishedAt: new Date().toISOString(),
      isActive: true,
    },
    {
      id: 3,
      title: "CBSE Regional Science Exhibition Winners",
      content: "We proudly congratulate our Grade X and XII students for securing 1st prize in the National Science & Innovation Fair with their Automated Water Purification model.",
      category: "Academic",
      isPinned: false,
      publishedAt: new Date().toISOString(),
      isActive: true,
    },
  ];

  return (
    <section id="notices" className={styles.noticesSection}>
      <div className={styles.container}>
        <div className={styles.sectionHeader}>
          <span className={styles.preTitle}>Campus Circulars & Updates</span>
          <h2 className={styles.mainTitle}>Latest Notices & Announcements</h2>
          <p className={styles.leadText}>
            Stay informed with our latest administrative circulars, examination updates, holiday notifications, and student achievements.
          </p>
        </div>

        <div className={styles.noticesGrid}>
          {displayNotices.map((notice) => (
            <div
              key={notice.id}
              className={styles.noticeCard}
              onClick={() => setActiveNotice(notice)}
            >
              <div className={styles.cardHeader}>
                <span className={styles.categoryBadge}>{notice.category || "General"}</span>
                {notice.isPinned && <span className={styles.pinnedBadge}>Pinned</span>}
              </div>

              <div className={styles.noticeDate}>
                <Icon name="calendar" size={14} />
                <span>
                  {new Date(notice.publishedAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>

              <h3 className={styles.noticeTitle}>{notice.title}</h3>
              <p className={styles.noticeSnippet}>{notice.content}</p>

              <div className={styles.readMore}>
                <span>Read Full Circular</span>
                <Icon name="arrowRight" size={16} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal for viewing notice details */}
      {activeNotice && (
        <Modal title={activeNotice.title} onClose={() => setActiveNotice(null)}>
          <div style={{ padding: "0.5rem 0" }}>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "1rem" }}>
              <span style={{ background: "#e2e8f0", padding: "0.25rem 0.65rem", borderRadius: "9999px", fontSize: "0.8rem", fontWeight: 700 }}>
                {activeNotice.category}
              </span>
              <span style={{ color: "#64748b", fontSize: "0.85rem" }}>
                Published on {new Date(activeNotice.publishedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "long",
                  year: "numeric"
                })}
              </span>
            </div>

            <p style={{ lineHeight: 1.7, color: "#334155", fontSize: "1rem", whiteSpace: "pre-line" }}>
              {activeNotice.content}
            </p>

            <div style={{ marginTop: "2rem", display: "flex", justifyContent: "flex-end" }}>
              <Button variant="outline" onClick={() => setActiveNotice(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
};

export default PublicNoticesSection;
