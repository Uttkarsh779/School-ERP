import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Input, Modal, Spinner, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import { useGetAdmissionInquiriesQuery, useUpdateInquiryStatusMutation, type IAdmissionInquiry, type InquiryStatus } from "../../../../store/api/cms.api";
import { errorOf } from "./fields";
import styles from "./AdminCmsPage.module.css";

export const STATUS_META: Record<InquiryStatus, { label: string; tone: "warning" | "info" | "success" | "danger" }> = {
  NEW: { label: "New", tone: "warning" },
  CONTACTED: { label: "Contacted", tone: "info" },
  ADMITTED: { label: "Admitted", tone: "success" },
  REJECTED: { label: "Closed", tone: "danger" },
};
const STATUSES = Object.keys(STATUS_META) as InquiryStatus[];

const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const digits = (p: string) => p.replace(/\D/g, "");
const waLink = (p: string) => {
  const d = digits(p);
  return `https://wa.me/${d.length === 10 ? `91${d}` : d}`;
};

// Excel-friendly CSV (quotes doubled; formula-looking cells prefixed so they open as text).
const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

const exportCsv = (rows: IAdmissionInquiry[]) => {
  const head = ["Date", "Student", "Class", "Parent", "Phone", "Email", "Current school", "Message", "Status", "Notes"];
  const body = rows.map((r) =>
    [fmt(r.createdAt), r.studentName, r.gradeApplyingFor, r.parentName, r.phone, r.email, r.currentSchool, r.message, STATUS_META[r.status]?.label ?? r.status, r.notes].map(csvCell).join(",")
  );
  const blob = new Blob(["﻿" + [head.map(csvCell).join(","), ...body].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `admission-enquiries-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

const InquiriesPanel = () => {
  const { data, isLoading, isError, refetch } = useGetAdmissionInquiriesQuery();
  const [updateStatus, { isLoading: saving }] = useUpdateInquiryStatusMutation();
  const [filter, setFilter] = useState<InquiryStatus | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<IAdmissionInquiry | null>(null);
  const [draft, setDraft] = useState<{ status: InquiryStatus; notes: string }>({ status: "NEW", notes: "" });

  const all = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: all.length };
    for (const r of all) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [all]);
  const term = q.trim().toLowerCase();
  const rows = all.filter(
    (r) =>
      (filter === "ALL" || r.status === filter) &&
      (!term || [r.studentName, r.parentName, r.phone, r.email, r.gradeApplyingFor].some((v) => (v ?? "").toLowerCase().includes(term)))
  );

  const openRow = (r: IAdmissionInquiry) => {
    setOpen(r);
    setDraft({ status: r.status, notes: r.notes ?? "" });
  };

  const save = async (status = draft.status) => {
    if (!open) return;
    try {
      await updateStatus({ id: open.id, status, notes: draft.notes }).unwrap();
      toast.success("Enquiry updated");
      setOpen(null);
    } catch (e) {
      toast.error(errorOf(e, "Couldn't update the enquiry"));
    }
  };

  const columns: TableColumn<IAdmissionInquiry>[] = [
    { key: "date", label: "Received", render: (r) => <span style={{ whiteSpace: "nowrap" }}>{fmt(r.createdAt)}</span> },
    {
      key: "student",
      label: "Student",
      render: (r) => (
        <div className={styles.titleCell}>
          <strong>{r.studentName}</strong>
          <span className={styles.sub}>{r.gradeApplyingFor}</span>
        </div>
      ),
    },
    {
      key: "parent",
      label: "Parent",
      render: (r) => (
        <div className={styles.titleCell}>
          <strong>{r.parentName}</strong>
          <a className={styles.linkBtn} href={`tel:${digits(r.phone)}`}>
            {r.phone}
          </a>
        </div>
      ),
    },
    { key: "status", label: "Status", render: (r) => <Badge tone={STATUS_META[r.status]?.tone ?? "neutral"}>{STATUS_META[r.status]?.label ?? r.status}</Badge> },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <Button size="sm" variant="outline" onClick={() => openRow(r)}>
          Open
        </Button>
      ),
    },
  ];

  return (
    <Card title="Admission enquiries" subtitle="Submitted from the website's Admissions page. Call back, then update the status so the team knows who has been handled.">
      <div className={styles.toolbar}>
        <div className={styles.pills}>
          {(["ALL", ...STATUSES] as const).map((s) => (
            <button key={s} type="button" className={`${styles.pill} ${filter === s ? styles.pillActive : ""}`} onClick={() => setFilter(s)}>
              {s === "ALL" ? "All" : STATUS_META[s].label} · {counts[s] ?? 0}
            </button>
          ))}
        </div>
        <div className={`${styles.actions} ${styles.toolbarRight}`}>
          <div className={styles.search}>
            <Input placeholder="Search name, phone, class…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button variant="outline" disabled={rows.length === 0} onClick={() => exportCsv(rows)}>
            Export CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <EmptyState title="Couldn't load enquiries" action={<Button onClick={() => refetch()}>Retry</Button>} />
      ) : all.length === 0 ? (
        <EmptyState title="No enquiries yet" description="Enquiries sent from the website's admission form will appear here." />
      ) : (
        <Table columns={columns} data={rows} keyField="id" mobilePrimary="student" emptyMessage="No enquiries match this filter." />
      )}

      {open && (
        <Modal title={`Enquiry · ${open.studentName}`} onClose={() => setOpen(null)} size="lg">
          <dl className={styles.detail}>
            <dt>Received</dt>
            <dd>{fmt(open.createdAt)}</dd>
            <dt>Class</dt>
            <dd>{open.gradeApplyingFor}</dd>
            <dt>Parent</dt>
            <dd>{open.parentName}</dd>
            <dt>Phone</dt>
            <dd>
              <a className={styles.linkBtn} href={`tel:${digits(open.phone)}`}>
                {open.phone}
              </a>
              {" · "}
              <a className={styles.linkBtn} href={waLink(open.phone)} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            </dd>
            {open.email && (
              <>
                <dt>Email</dt>
                <dd>
                  <a className={styles.linkBtn} href={`mailto:${open.email}`}>
                    {open.email}
                  </a>
                </dd>
              </>
            )}
            {open.currentSchool && (
              <>
                <dt>Current school</dt>
                <dd>{open.currentSchool}</dd>
              </>
            )}
            {open.message && (
              <>
                <dt>Message</dt>
                <dd style={{ whiteSpace: "pre-line" }}>{open.message}</dd>
              </>
            )}
          </dl>

          <div className={styles.field} style={{ marginBottom: "1rem" }}>
            <span className={styles.label}>Status</span>
            <div className={styles.pills}>
              {STATUSES.map((s) => (
                <button key={s} type="button" className={`${styles.pill} ${draft.status === s ? styles.pillActive : ""}`} onClick={() => setDraft((d) => ({ ...d, status: s }))}>
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Follow-up notes</span>
            <textarea
              className={styles.textarea}
              rows={4}
              maxLength={2000}
              value={draft.notes}
              placeholder="e.g. Called on 12 Nov, visit planned for Saturday 10 AM"
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </div>
          <div className={styles.modalActions}>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button onClick={() => save()} isLoading={saving}>
              Save
            </Button>
          </div>
        </Modal>
      )}
    </Card>
  );
};

export default InquiriesPanel;
