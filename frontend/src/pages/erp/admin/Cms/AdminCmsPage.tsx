import { useSearchParams } from "react-router-dom";
import { Button, PageHeader } from "../../../../components/ui";
import { useGetAdmissionInquiriesQuery, type CmsCollectionName } from "../../../../store/api/cms.api";
import CollectionManager from "./CollectionManager";
import InquiriesPanel from "./InquiriesPanel";
import SettingsEditor, { type SettingsSection } from "./SettingsEditor";
import styles from "./AdminCmsPage.module.css";

// Website CMS: everything on the public website is edited from here.
type Tab = SettingsSection | CmsCollectionName | "inquiries";

const TABS: { key: Tab; label: string }[] = [
  { key: "profile", label: "School profile" },
  { key: "home", label: "Home page" },
  { key: "about", label: "About & principal" },
  { key: "notices", label: "Notices" },
  { key: "gallery", label: "Gallery" },
  { key: "facilities", label: "Facilities" },
  { key: "testimonials", label: "Testimonials" },
  { key: "faqs", label: "FAQs" },
  { key: "inquiries", label: "Enquiries" },
];

const SETTINGS_TABS: Tab[] = ["profile", "home", "about"];

const AdminCmsPage = () => {
  // The tab lives in the URL (?tab=gallery) so refresh/back keep your place.
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get("tab"))?.key ?? "profile") as Tab;
  const { data: inquiries } = useGetAdmissionInquiriesQuery();
  const newCount = (inquiries ?? []).filter((i) => i.status === "NEW").length;
  const go = (key: Tab) => setParams(key === "profile" ? {} : { tab: key }, { replace: true });

  return (
    <div className={styles.page}>
      <PageHeader
        title="Website CMS"
        subtitle="Edit the public school website — text, photos, notices and admission enquiries."
        actions={
          <Button variant="outline" onClick={() => window.open("/", "_blank", "noopener")}>
            View website ↗
          </Button>
        }
      />

      {/* Phones: one compact picker instead of nine tabs scrolling off-screen */}
      <label className={styles.tabSelectWrap}>
        <span className={styles.tabSelectLabel}>Section</span>
        <select className={styles.tabSelect} value={tab} onChange={(e) => go(e.target.value as Tab)}>
          {TABS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
              {t.key === "inquiries" && newCount > 0 ? ` (${newCount} new)` : ""}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.tabs} role="tablist" aria-label="Website sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
            onClick={() => go(t.key)}
          >
            {t.label}
            {t.key === "inquiries" && newCount > 0 && <span className={styles.count}>{newCount}</span>}
          </button>
        ))}
      </div>

      {SETTINGS_TABS.includes(tab) ? (
        <SettingsEditor section={tab as SettingsSection} />
      ) : tab === "inquiries" ? (
        <InquiriesPanel />
      ) : (
        <CollectionManager key={tab} collection={tab as CmsCollectionName} />
      )}
    </div>
  );
};

export default AdminCmsPage;
