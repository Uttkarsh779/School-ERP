import { useMemo, useState, type ReactNode } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, Spinner, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import {
  useCreateCmsItemMutation,
  useDeleteCmsItemMutation,
  useGetCmsCollectionQuery,
  useUpdateCmsItemMutation,
  type CmsAnyItem,
  type CmsCollectionName,
} from "../../../../store/api/cms.api";
import { FieldInput, errorOf, type FieldDef } from "./fields";
import styles from "./AdminCmsPage.module.css";

type Row = CmsAnyItem & Record<string, unknown>;

const ICONS = [
  { label: "Building / classrooms", value: "building" },
  { label: "Lab / science", value: "layers" },
  { label: "Library / books", value: "graduationCap" },
  { label: "Transport / bus", value: "bus" },
  { label: "Arts / music", value: "users" },
  { label: "Sports / trophy", value: "star" },
  { label: "Events / calendar", value: "calendar" },
  { label: "Computers / globe", value: "globe" },
  { label: "Health / safety", value: "clipboardCheck" },
];

const today = () => new Date().toISOString().slice(0, 10);

interface CollectionConfig {
  title: string;
  subtitle: string;
  noun: string;
  fields: FieldDef[];
  defaults: () => Record<string, unknown>;
  searchKeys: string[];
  columns?: (helpers: { toggle: (row: Row, key: string) => void }) => TableColumn<Row>[];
  /** Column used as the card heading on phones */
  mobilePrimary?: string;
  layout?: "table" | "grid";
}

const text = (row: Row, key: string) => String(row[key] ?? "");

export const COLLECTION_CONFIG: Record<CmsCollectionName, CollectionConfig> = {
  facilities: {
    title: "Facilities",
    subtitle: "Shown on the home page and the Campus Life page, in display order.",
    noun: "facility",
    searchKeys: ["title", "description"],
    defaults: () => ({ title: "", description: "", iconName: "building", imageUrl: "", order: 0, isActive: true }),
    fields: [
      { key: "title", label: "Title", type: "text", required: true, maxLength: 120 },
      { key: "iconName", label: "Icon", type: "select", options: ICONS },
      { key: "description", label: "Description", type: "textarea", required: true, rows: 3, maxLength: 1000 },
      { key: "imageUrl", label: "Photo", type: "image", full: true, hint: "Optional — a landscape photo makes the card look much better." },
      { key: "order", label: "Display order", type: "number", hint: "Lower numbers appear first." },
      { key: "isActive", label: "Show on website", type: "bool" },
    ],
  },
  gallery: {
    title: "Photo gallery",
    subtitle: "Photos appear on the Gallery page (with category filters), the home page and Campus Life. Until you add photos, built-in sample photos are shown.",
    noun: "photo",
    layout: "grid",
    searchKeys: ["title", "category", "description"],
    defaults: () => ({ title: "", category: "Campus", imageUrl: "", description: "", order: 0, isActive: true }),
    fields: [
      { key: "imageUrl", label: "Photo", type: "image", required: true, full: true },
      { key: "title", label: "Caption", type: "text", required: true, maxLength: 120 },
      { key: "category", label: "Category", type: "text", required: true, maxLength: 40, suggestions: ["Campus", "Academics", "Sports", "Events", "Celebrations", "Trips", "Arts"] },
      { key: "description", label: "Description", type: "textarea", rows: 2, maxLength: 500 },
      { key: "order", label: "Display order", type: "number", hint: "Lower numbers appear first." },
      { key: "isActive", label: "Show on website", type: "bool" },
    ],
  },
  notices: {
    title: "Public notices",
    subtitle: "Circulars and announcements on the website's Notices page and home page. (Internal notices for students/staff are managed under Notices.)",
    noun: "notice",
    mobilePrimary: "title",
    searchKeys: ["title", "content", "category"],
    defaults: () => ({ title: "", content: "", category: "General", fileUrl: "", isPinned: false, publishedAt: today(), isActive: true }),
    fields: [
      { key: "title", label: "Title", type: "text", required: true, maxLength: 160, full: true },
      { key: "category", label: "Category", type: "text", required: true, maxLength: 40, suggestions: ["General", "Admission", "Event", "Holiday", "Exam", "Academic", "Sports"] },
      { key: "publishedAt", label: "Date", type: "date" },
      { key: "content", label: "Details", type: "textarea", required: true, rows: 5, maxLength: 4000 },
      { key: "fileUrl", label: "Attachment (PDF or image)", type: "file", full: true },
      { key: "isPinned", label: "Mark as important (pinned to top)", type: "bool" },
      { key: "isActive", label: "Show on website", type: "bool" },
    ],
    columns: ({ toggle }) => [
      {
        key: "date",
        label: "Date",
        render: (r) => new Date(text(r, "publishedAt")).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      },
      {
        key: "title",
        label: "Notice",
        render: (r) => (
          <div className={styles.titleCell}>
            <strong>{text(r, "title")}</strong>
            <span className={styles.sub}>{text(r, "content")}</span>
          </div>
        ),
      },
      { key: "category", label: "Category", render: (r) => <Badge tone="info">{text(r, "category")}</Badge> },
      {
        key: "pinned",
        label: "Important",
        render: (r) => (
          <button type="button" className={`${styles.pill} ${r.isPinned ? styles.pillActive : ""}`} onClick={() => toggle(r, "isPinned")}>
            {r.isPinned ? "Pinned" : "Pin"}
          </button>
        ),
      },
    ],
  },
  testimonials: {
    title: "Testimonials",
    subtitle: "Quotes from parents and alumni. The first three (by display order) appear on the home page.",
    noun: "testimonial",
    mobilePrimary: "name",
    searchKeys: ["name", "relation", "quote"],
    defaults: () => ({ name: "", relation: "", quote: "", photoUrl: "", order: 0, isActive: true }),
    fields: [
      { key: "name", label: "Name", type: "text", required: true, maxLength: 80 },
      { key: "relation", label: "Who they are", type: "text", maxLength: 120, placeholder: "Parent of a Class V student" },
      { key: "quote", label: "Quote", type: "textarea", required: true, rows: 4, maxLength: 800 },
      { key: "photoUrl", label: "Photo", type: "image", full: true, hint: "Optional. The first letter of the name is shown otherwise." },
      { key: "order", label: "Display order", type: "number" },
      { key: "isActive", label: "Show on website", type: "bool" },
    ],
    columns: () => [
      { key: "order", label: "#", render: (r) => text(r, "order") },
      {
        key: "name",
        label: "Person",
        render: (r) => (
          <div className={styles.titleCell}>
            <strong>{text(r, "name")}</strong>
            <span className={styles.sub}>{text(r, "relation")}</span>
          </div>
        ),
      },
      { key: "quote", label: "Quote", render: (r) => <span className={styles.sub}>“{text(r, "quote")}”</span> },
    ],
  },
  faqs: {
    title: "Admission FAQs",
    subtitle: "Questions and answers shown at the bottom of the Admissions page.",
    noun: "FAQ",
    mobilePrimary: "question",
    searchKeys: ["question", "answer"],
    defaults: () => ({ question: "", answer: "", order: 0, isActive: true }),
    fields: [
      { key: "question", label: "Question", type: "text", required: true, maxLength: 200, full: true },
      { key: "answer", label: "Answer", type: "textarea", required: true, rows: 4, maxLength: 2000 },
      { key: "order", label: "Display order", type: "number" },
      { key: "isActive", label: "Show on website", type: "bool" },
    ],
    columns: () => [
      { key: "order", label: "#", render: (r) => text(r, "order") },
      {
        key: "question",
        label: "Question",
        render: (r) => (
          <div className={styles.titleCell}>
            <strong>{text(r, "question")}</strong>
            <span className={styles.sub}>{text(r, "answer")}</span>
          </div>
        ),
      },
    ],
  },
};

const defaultColumns = (): TableColumn<Row>[] => [
  { key: "order", label: "#", render: (r) => text(r, "order") },
  {
    key: "title",
    label: "Facility",
    render: (r) => (
      <div className={styles.thumbCell}>
        {r.imageUrl ? <img src={text(r, "imageUrl")} alt="" className={styles.thumb} /> : <span className={styles.thumb} />}
        <div className={styles.titleCell}>
          <strong>{text(r, "title")}</strong>
          <span className={styles.sub}>{text(r, "description")}</span>
        </div>
      </div>
    ),
  },
];

// Prepare a row for the edit form (dates as yyyy-mm-dd, nulls as "").
const toForm = (row: Row, fields: FieldDef[]) =>
  Object.fromEntries(
    fields.map((f) => {
      const v = row[f.key];
      if (f.type === "date" && typeof v === "string") return [f.key, v.slice(0, 10)];
      return [f.key, v ?? (f.type === "bool" ? false : "")];
    })
  );

const CollectionManager = ({ collection }: { collection: CmsCollectionName }) => {
  const cfg = COLLECTION_CONFIG[collection];
  const { data, isLoading, isError, refetch } = useGetCmsCollectionQuery(collection);
  const [create, { isLoading: creating }] = useCreateCmsItemMutation();
  const [update, { isLoading: updating }] = useUpdateCmsItemMutation();
  const [remove, { isLoading: removing }] = useDeleteCmsItemMutation();
  const [editing, setEditing] = useState<{ id: number | null; values: Record<string, unknown> } | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [q, setQ] = useState("");

  const rows = useMemo(() => (data ?? []) as Row[], [data]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => cfg.searchKeys.some((k) => text(r, k).toLowerCase().includes(term)));
  }, [rows, q, cfg.searchKeys]);

  const toggle = async (row: Row, key: string) => {
    try {
      await update({ collection, id: row.id, data: { [key]: !row[key] } }).unwrap();
    } catch (e) {
      toast.error(errorOf(e, "Couldn't update"));
    }
  };

  const save = async () => {
    if (!editing) return;
    const missing = cfg.fields.find((f) => "required" in f && f.required && !String(editing.values[f.key] ?? "").trim());
    if (missing) return toast.error(`${missing.label} is required`);
    const payload = { ...editing.values };
    for (const f of cfg.fields) if (f.type === "number" && payload[f.key] === "") payload[f.key] = 0;
    try {
      if (editing.id === null) await create({ collection, data: payload }).unwrap();
      else await update({ collection, id: editing.id, data: payload }).unwrap();
      toast.success(editing.id === null ? `${cfg.noun[0].toUpperCase()}${cfg.noun.slice(1)} added` : "Saved");
      setEditing(null);
    } catch (e) {
      toast.error(errorOf(e, "Couldn't save"));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove({ collection, id: deleting.id }).unwrap();
      toast.success("Removed");
      setDeleting(null);
    } catch (e) {
      toast.error(errorOf(e, "Couldn't remove"));
    }
  };

  const openNew = () => {
    const values = cfg.defaults();
    if ("order" in values) values.order = rows.reduce((m, r) => Math.max(m, Number(r.order ?? 0)), 0) + 1;
    setEditing({ id: null, values });
  };

  const rowActions = (r: Row): ReactNode => (
    <div className={styles.actions}>
      <Button size="sm" variant="outline" onClick={() => setEditing({ id: r.id, values: toForm(r, cfg.fields) })}>
        Edit
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setDeleting(r)}>
        Delete
      </Button>
    </div>
  );

  const statusCell = (r: Row) => (
    <button type="button" className={`${styles.pill} ${r.isActive ? styles.pillActive : ""}`} onClick={() => toggle(r, "isActive")} title="Show / hide on the website">
      {r.isActive ? "Visible" : "Hidden"}
    </button>
  );

  const columns: TableColumn<Row>[] = [
    ...(cfg.columns ? cfg.columns({ toggle }) : defaultColumns()),
    { key: "status", label: "On website", render: statusCell },
    { key: "actions", label: "", render: rowActions },
  ];

  return (
    <Card title={cfg.title} subtitle={cfg.subtitle}>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Input placeholder={`Search ${cfg.title.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button onClick={openNew}>+ Add {cfg.noun}</Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <EmptyState title="Couldn't load" action={<Button onClick={() => refetch()}>Retry</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing added yet" description={`Add your first ${cfg.noun} to show it on the website.`} action={<Button onClick={openNew}>+ Add {cfg.noun}</Button>} />
      ) : cfg.layout === "grid" ? (
        <div className={styles.photoGrid}>
          {filtered.map((r) => (
            <div key={r.id} className={`${styles.photo} ${r.isActive ? "" : styles.photoInactive}`}>
              <img src={text(r, "imageUrl")} alt={text(r, "title")} loading="lazy" />
              <div className={styles.photoBody}>
                <span className={styles.photoTitle}>{text(r, "title")}</span>
                <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
                  <Badge tone="info">{text(r, "category")}</Badge>
                  {statusCell(r)}
                </div>
                <div className={styles.photoActions}>{rowActions(r)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Table columns={columns} data={filtered} keyField="id" mobilePrimary={cfg.mobilePrimary ?? "title"} emptyMessage="Nothing matches your search." />
      )}

      {editing && (
        <Modal title={editing.id === null ? `Add ${cfg.noun}` : `Edit ${cfg.noun}`} onClose={() => setEditing(null)} size="lg">
          <div className={styles.grid}>
            {cfg.fields.map((f) => (
              <FieldInput key={f.key} def={f} values={editing.values} onChange={(k, v) => setEditing((e) => (e ? { ...e, values: { ...e.values, [k]: v } } : e))} />
            ))}
          </div>
          <div className={styles.modalActions}>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} isLoading={creating || updating}>
              {editing.id === null ? "Add" : "Save"}
            </Button>
          </div>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete this ${cfg.noun}?`}
          message="It will be removed from the website permanently. To hide it temporarily, switch it to Hidden instead."
          confirmLabel="Delete"
          tone="danger"
          isLoading={removing}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </Card>
  );
};

export default CollectionManager;
