import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, Card, EmptyState, Input, Spinner } from "../../../../components/ui";
import { useGetCmsSettingsQuery, useUpdateCmsSettingsMutation, type IWebsiteSetting, type IWebsiteStat } from "../../../../store/api/cms.api";
import { FieldInput, errorOf, type FieldDef } from "./fields";
import styles from "./AdminCmsPage.module.css";

export type SettingsSection = "profile" | "home" | "about";

const GROUPS: Record<SettingsSection, { title: string; subtitle?: string; fields: FieldDef[] }[]> = {
  profile: [
    {
      title: "School identity",
      subtitle: "Shown in the website header, footer and browser tab",
      fields: [
        { key: "schoolName", label: "School name", type: "text", required: true, maxLength: 120 },
        { key: "tagline", label: "Tagline / motto", type: "text", required: true, maxLength: 160 },
        { key: "boardName", label: "Board", type: "text", required: true, maxLength: 60, suggestions: ["CBSE", "ICSE", "State Board", "IB", "Cambridge"] },
        { key: "affiliationNo", label: "Affiliation number", type: "text", required: true, maxLength: 60 },
        { key: "schoolCode", label: "School code", type: "text", maxLength: 60 },
        { key: "establishedYear", label: "Established year", type: "number" },
        { key: "academicSession", label: "Admission session", type: "text", maxLength: 20, placeholder: "e.g. 2027-28", hint: "Leave empty to calculate automatically (from October the next session is shown)." },
        { key: "logoUrl", label: "School logo", type: "image", hint: "Square PNG with transparent background works best. Without a logo, the initials crest is shown." },
      ],
    },
    {
      title: "Contact details",
      fields: [
        { key: "phone", label: "Phone", type: "tel", required: true, maxLength: 40 },
        { key: "whatsapp", label: "WhatsApp number", type: "tel", maxLength: 20, hint: "Shows a floating WhatsApp chat button. 10-digit numbers get +91." },
        { key: "email", label: "Email", type: "email", required: true, maxLength: 120 },
        { key: "officeHours", label: "Office hours", type: "text", maxLength: 120, placeholder: "Mon – Sat, 8:00 AM – 2:00 PM" },
        { key: "address", label: "Address", type: "textarea", required: true, rows: 2, maxLength: 300 },
        {
          key: "mapEmbedUrl",
          label: "Google Map",
          type: "textarea",
          rows: 3,
          hint: "Google Maps → search the school → Share → Embed a map → Copy HTML, and paste it here.",
          placeholder: '<iframe src="https://www.google.com/maps/embed?pb=..."></iframe>',
        },
      ],
    },
    {
      title: "Social media",
      subtitle: "Links appear as icons in the footer — leave empty to hide",
      fields: [
        { key: "facebookUrl", label: "Facebook page", type: "url", placeholder: "https://facebook.com/..." },
        { key: "instagramUrl", label: "Instagram", type: "url", placeholder: "https://instagram.com/..." },
        { key: "youtubeUrl", label: "YouTube channel", type: "url", placeholder: "https://youtube.com/@..." },
        { key: "twitterUrl", label: "X (Twitter)", type: "url", placeholder: "https://x.com/..." },
      ],
    },
  ],
  home: [
    {
      title: "Hero banner",
      subtitle: "The first thing visitors see on the home page",
      fields: [
        { key: "heroTitle", label: "Headline", type: "text", required: true, maxLength: 160, full: true, hint: "The last word is highlighted in gold." },
        { key: "heroSubtitle", label: "Sub-heading", type: "textarea", required: true, rows: 2, maxLength: 400 },
        { key: "heroCtaText", label: "Button text", type: "text", required: true, maxLength: 40 },
        { key: "heroCtaLink", label: "Button link", type: "text", required: true, maxLength: 300, hint: "A page like /admissions or a full https:// link.", suggestions: ["/admissions", "/admissions#enquiry", "/about", "/contact"] },
        { key: "heroImageUrl", label: "Background photo", type: "image", full: true, hint: "Wide landscape photo (at least 1600px wide). A default campus photo is used if empty." },
      ],
    },
    {
      title: "Admissions",
      fields: [
        { key: "admissionsOpen", label: "Admissions are open", type: "bool", full: true, hint: "Shows the 'Admissions open' badge in the header and on the home page." },
        { key: "admissionNotice", label: "Admission notice", type: "textarea", rows: 2, maxLength: 400, hint: "Short message shown on the home page and the Admissions page." },
      ],
    },
  ],
  about: [
    {
      title: "About the school",
      fields: [
        { key: "aboutText", label: "About text", type: "textarea", required: true, rows: 6, maxLength: 4000, hint: "Used on the home page and the About page. Use blank lines for paragraphs." },
        { key: "aboutImageUrl", label: "About photo", type: "image", full: true },
        { key: "vision", label: "Vision", type: "textarea", rows: 3, maxLength: 1000 },
        { key: "mission", label: "Mission", type: "textarea", rows: 4, maxLength: 1500 },
      ],
    },
    {
      title: "Principal's message",
      fields: [
        { key: "principalName", label: "Name", type: "text", required: true, maxLength: 80 },
        { key: "principalTitle", label: "Designation", type: "text", required: true, maxLength: 80, suggestions: ["Principal", "Director", "Chairman", "Headmistress"] },
        { key: "principalMessage", label: "Message", type: "textarea", required: true, rows: 6, maxLength: 3000 },
        { key: "principalPhotoUrl", label: "Photo", type: "image", full: true, hint: "Portrait photo (4:5) looks best." },
      ],
    },
  ],
};

const EDITABLE_KEYS = Array.from(new Set(Object.values(GROUPS).flatMap((g) => g.flatMap((x) => x.fields.map((f) => f.key))))).concat("stats");

const pick = (s: Partial<IWebsiteSetting>) => Object.fromEntries(EDITABLE_KEYS.map((k) => [k, (s as Record<string, unknown>)[k] ?? (k === "stats" ? [] : "")]));

const StatsEditor = ({ value, onChange }: { value: IWebsiteStat[]; onChange: (v: IWebsiteStat[]) => void }) => (
  <Card title="Highlights strip" subtitle="Up to 6 numbers shown on the dark band of the home page. Leave empty to use sensible defaults.">
    <div className={styles.stack} style={{ gap: "0.75rem" }}>
      {value.map((st, i) => (
        <div key={i} className={styles.statRow}>
          <Input label={i === 0 ? "Value" : undefined} value={st.value} maxLength={12} placeholder="25+" onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
          <Input label={i === 0 ? "Label" : undefined} value={st.label} maxLength={50} placeholder="Years of excellence" onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          <Button variant="ghost" size="sm" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            Remove
          </Button>
        </div>
      ))}
      {value.length < 6 && (
        <div>
          <Button variant="outline" size="sm" onClick={() => onChange([...value, { value: "", label: "" }])}>
            + Add highlight
          </Button>
        </div>
      )}
    </div>
  </Card>
);

const SettingsEditor = ({ section }: { section: SettingsSection }) => {
  const { data, isLoading, isError, refetch } = useGetCmsSettingsQuery();
  const [save, { isLoading: saving }] = useUpdateCmsSettingsMutation();
  const [form, setForm] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (data) setForm(pick(data));
  }, [data]);

  const original = useMemo(() => (data ? JSON.stringify(pick(data)) : ""), [data]);
  const dirty = data ? JSON.stringify(form) !== original : false;

  // Warn before leaving the page with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (isLoading) return <Spinner />;
  if (isError || !data) return <EmptyState title="Couldn't load website settings" action={<Button onClick={() => refetch()}>Retry</Button>} />;

  const set = (key: string, value: unknown) => setForm((f) => ({ ...f, [key]: value }));

  const onSave = async () => {
    const payload: Record<string, unknown> = { ...form };
    payload.stats = ((form.stats as IWebsiteStat[]) ?? []).filter((s) => s.value.trim() || s.label.trim());
    if (payload.establishedYear === "") delete payload.establishedYear;
    try {
      await save(payload as Partial<IWebsiteSetting>).unwrap();
      toast.success("Website updated");
    } catch (e) {
      toast.error(errorOf(e, "Couldn't save the settings"));
    }
  };

  return (
    <div className={styles.stack}>
      {GROUPS[section].map((g) => (
        <Card key={g.title} title={g.title} subtitle={g.subtitle}>
          <div className={styles.grid}>
            {g.fields.map((f) => (
              <FieldInput key={f.key} def={f} values={form} onChange={set} />
            ))}
          </div>
        </Card>
      ))}
      {section === "home" && <StatsEditor value={(form.stats as IWebsiteStat[]) ?? []} onChange={(v) => set("stats", v)} />}

      <div className={styles.saveBar}>
        <span className={dirty ? styles.dirty : styles.clean}>{dirty ? "You have unsaved changes" : "All changes saved"}</span>
        <div className={styles.actions}>
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setForm(pick(data))}>
            Discard
          </Button>
          <Button onClick={onSave} isLoading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SettingsEditor;
