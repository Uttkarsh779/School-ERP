import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, Card, Icon, ImageUpload, PageHeader, Spinner } from "../../../../components/ui";
import { useAppSelector } from "../../../../store/store";
import { useGetDocumentSettingsQuery, useUpdateDocumentSettingsMutation, type DocumentSettings } from "../../../../store/api/settings.api";
import SettingsEditor from "../Cms/SettingsEditor";
import BackupPanel from "./BackupPanel";
import styles from "./SettingsPage.module.css";

// School-wide settings. Module rules stay in their own pages (fee fines in Fees, weekly offs
// in the calendar...); the Shortcuts tab links to them.

type Tab = "school" | "documents" | "backup" | "shortcuts";
const TABS: { key: Tab; label: string }[] = [
  { key: "school", label: "School profile" },
  { key: "documents", label: "Signature & seal" },
  { key: "backup", label: "Backup" }, // Super Admin only
  { key: "shortcuts", label: "Other settings" },
];

const PLACES: { key: keyof DocumentSettings; label: string; hint: string }[] = [
  {
    key: "signIdCards",
    label: "ID cards",
    hint: "Usual practice: printed signature.",
  },
  {
    key: "signReportCards",
    label: "Report cards & admit cards",
    hint: "Usual practice: printed signature. Class teacher and parent still sign by hand.",
  },
  {
    key: "signCertificates",
    label: "Bonafide, Character & Fee certificates",
    hint: "Usually signed by hand and stamped. Turn on to print the signature and seal.",
  },
  {
    key: "signTc",
    label: "Transfer Certificate (TC)",
    hint: "Keep off: the next school and the board expect a hand signature and stamp on a TC.",
  },
];

const SHORTCUTS = [
  {
    to: "/admin/fees?tab=settings",
    icon: "building",
    title: "Fee settings",
    text: "Late fine, monthly bill date, transport due day",
  },
  {
    to: "/admin/calendar",
    icon: "calendar",
    title: "Weekly offs & holidays",
    text: "Sundays, off Saturdays and the holiday list",
  },
  {
    to: "/admin/sessions",
    icon: "layers",
    title: "Academic sessions",
    text: "Current session and moving to the next one",
  },
  {
    to: "/admin/cms",
    icon: "globe",
    title: "Website",
    text: "Home page, about, gallery, notices, social links",
  },
] as const;

const DocumentSettingsPanel = ({ canEdit }: { canEdit: boolean }) => {
  const { data, isLoading } = useGetDocumentSettingsQuery();
  const [save, { isLoading: saving }] = useUpdateDocumentSettingsMutation();
  const [form, setForm] = useState<DocumentSettings | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form) return <Spinner />;
  const dirty = JSON.stringify(form) !== JSON.stringify(data);

  const onSave = async () => {
    try {
      await save(form).unwrap();
      toast.success("Signature settings saved");
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't save the settings");
    }
  };

  const image = (key: "principalSignatureUrl" | "schoolSealUrl", label: string, help: string) => (
    <div className={styles.imageBox}>
      {canEdit ? (
        <>
          <ImageUpload
            label={label}
            value={form[key] ?? ""}
            onChange={(url) => setForm({ ...form, [key]: url || null })}
            folder="school_erp/documents"
            helperText={help}
          />
          {form[key] && (
            <button type="button" className={styles.linkButton} onClick={() => setForm({ ...form, [key]: null })}>
              Remove
            </button>
          )}
        </>
      ) : (
        <>
          <span className={styles.label}>{label}</span>
          {form[key] ? <img src={form[key] ?? ""} alt="" className={styles.preview} /> : <span className={styles.muted}>Not uploaded</span>}
        </>
      )}
    </div>
  );

  return (
    <div className={styles.stack}>
      <Card
        title="Principal's signature & school seal"
        subtitle={
          canEdit
            ? "Sign on plain white paper with a dark pen, then take a straight, well-lit photo. The white background is removed when printing."
            : "Only the Super Admin can change these."
        }
      >
        <div className={styles.images}>
          {image("principalSignatureUrl", "Principal's signature", "Crop close to the signature. A wide, short image works best.")}
          {image("schoolSealUrl", "School seal / stamp", "Stamp on white paper and photograph it. Used on certificates only.")}
        </div>
      </Card>

      <Card title="Where to print them" subtitle="Where it's off, the line stays blank for a hand signature.">
        <ul className={styles.places}>
          {PLACES.map((p) => (
            <li key={p.key}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={Boolean(form[p.key])}
                  disabled={!canEdit}
                  onChange={(e) => setForm({ ...form, [p.key]: e.target.checked })}
                />
                <span>
                  <strong>{p.label}</strong>
                  <small>{p.hint}</small>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className={styles.muted} style={{ margin: "0.75rem 0 0" }}>
          Fee receipts don't need a signature: they already say they are computer-generated.
        </p>
      </Card>

      {canEdit && (
        <div className={styles.saveBar}>
          <span className={styles.muted}>{dirty ? "You have unsaved changes" : "All changes saved"}</span>
          <div className={styles.actions}>
            <Button variant="ghost" disabled={!dirty || saving} onClick={() => data && setForm(data)}>
              Discard
            </Button>
            <Button onClick={onSave} isLoading={saving} disabled={!dirty}>
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const SettingsPage = () => {
  const isSuperAdmin = useAppSelector((s) => s.auth.user?.role) === "SUPER_ADMIN";
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter((t) => t.key !== "backup" || isSuperAdmin);
  const tab = (tabs.find((t) => t.key === params.get("tab"))?.key ?? "school") as Tab;

  return (
    <div>
      <PageHeader title="Settings" subtitle="School details used across the ERP, printed documents and the website" />

      <div className={styles.tabs} role="tablist" aria-label="Settings sections">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`${styles.tab} ${tab === t.key ? styles.tabActive : ""}`}
            onClick={() =>
              setParams(t.key === "school" ? {} : { tab: t.key }, {
                replace: true,
              })
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "school" ? (
        <SettingsEditor section="school" />
      ) : tab === "documents" ? (
        <DocumentSettingsPanel canEdit={isSuperAdmin} />
      ) : tab === "backup" ? (
        <BackupPanel />
      ) : (
        <div className={styles.shortcuts}>
          {SHORTCUTS.map((s) => (
            <Link key={s.to} to={s.to} className={styles.shortcut}>
              <span className={styles.shortcutIcon}>
                <Icon name={s.icon} size={20} />
              </span>
              <span>
                <strong>{s.title}</strong>
                <small>{s.text}</small>
              </span>
              <Icon name="chevronRight" size={16} className={styles.chevron} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
