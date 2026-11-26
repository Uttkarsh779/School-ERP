import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { Badge, Button, Card, Icon, Input, PageHeader, Select, Spinner, Table } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import {
  STAGE_LABEL,
  useGetAdmissionSettingsQuery,
  useGetApplicationsQuery,
  useSaveAdmissionSettingsMutation,
  type ApplicationRow,
} from "../../../../store/api/admissions.api";
import { useDownloadExportMutation } from "../../../../store/api/exports.api";
import { useGetSessionsQuery } from "../../../../store/api/sessions.api";
import { useCan } from "../../../../store/permissions";
import { fmtDate, getErrorMessage, inr } from "../Fees/feeUtils";
import ApplicationForm from "./ApplicationForm";
import ApplicationModal, { STAGE_TONE } from "./ApplicationModal";
import styles from "./Admissions.module.css";

const FILTERS: Array<[string, string]> = [
  ["OPEN", "In progress"],
  ["ENQUIRY", "Enquiries"],
  ["APPLIED", "Applied"],
  ["TEST", "Test / interview"],
  ["SELECTED", "Selected"],
  ["ADMITTED", "Admitted"],
  ["REJECTED", "Rejected"],
  ["WITHDRAWN", "Withdrawn"],
  ["", "All"],
];
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// Admissions: enquiries and applications from the website and the office, through to admission.
const AdmissionsPage = () => {
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<"applications" | "settings">("applications");
  const [adding, setAdding] = useState(false);
  const openId = Number(params.get("open")) || null;
  const setOpen = (id: number | null) => setParams(id ? { open: String(id) } : {}, { replace: true });
  const { data: settings } = useGetAdmissionSettingsQuery();

  return (
    <div>
      <PageHeader
        title="Admissions"
        subtitle="Enquiries and online applications, through test / interview to admission"
        actions={
          can("admissions.manage") && (
            <Button icon={<Icon name="plus" size={16} />} onClick={() => setAdding(true)}>
              New application
            </Button>
          )
        }
      />
      {settings && (
        <p className={styles.muted} style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
          Online form:{" "}
          {/* Same rule as the website (backend isAcceptingApplications): switched on, a session chosen, last date not passed. */}
          {settings.isOpen && !settings.sessionId ? (
            <Badge tone="warning">Switched on, but no session chosen — the website takes enquiries only</Badge>
          ) : settings.isOpen && settings.closesOn && String(settings.closesOn).slice(0, 10) < new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) ? (
            <Badge tone="warning">Closed — last date {new Date(settings.closesOn).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} has passed (change it in Settings)</Badge>
          ) : settings.isOpen ? (
            <Badge tone="success">Open{settings.sessionName ? ` for ${settings.sessionName}` : ""}</Badge>
          ) : (
            <Badge tone="neutral">Closed — the website takes enquiries only</Badge>
          )}{" "}
          <a href="/admissions/apply" target="_blank" rel="noreferrer">
            See the form
          </a>
        </p>
      )}
      <div className={styles.tabs} role="tablist">
        {(
          [
            ["applications", "Applications"],
            ["settings", "Settings"],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "applications" ? <ApplicationsTab onOpen={setOpen} /> : <SettingsTab />}
      {openId && <ApplicationModal id={openId} onClose={() => setOpen(null)} />}
      {adding && <ApplicationForm mode="NEW" application={null} defaultSessionId={settings?.sessionId ?? null} onClose={() => setAdding(false)} onSaved={(id) => setOpen(id)} />}
    </div>
  );
};

// ---------------------------------------------------------------------------

const ApplicationsTab = ({ onOpen }: { onOpen: (id: number) => void }) => {
  const [stage, setStage] = useState("OPEN");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [sessionId, setSessionId] = useState("");
  const { data: sessions = [] } = useGetSessionsQuery();
  const { data, isLoading, isFetching } = useGetApplicationsQuery({ stage, q: search, sessionId });
  const [download, { isLoading: downloading }] = useDownloadExportMutation();

  // Search as you type, without a request per key.
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const counts = data?.counts ?? {};
  const countOf = (key: string) =>
    key === "OPEN" ? ["ENQUIRY", "APPLIED", "TEST", "SELECTED"].reduce((n, k) => n + (counts[k] ?? 0), 0) : key === "" ? Object.values(counts).reduce((n, v) => n + v, 0) : counts[key] ?? 0;

  const columns: TableColumn<ApplicationRow>[] = [
    {
      key: "studentName",
      label: "Child",
      render: (a) => (
        <button type="button" className={styles.rowButton} onClick={() => onOpen(a.id)}>
          <div className={styles.strong}>{a.studentName}</div>
          <div className={styles.muted}>
            {a.applicationNo} · {a.className}
            {a.sessionName ? ` · ${a.sessionName}` : ""}
          </div>
        </button>
      ),
    },
    {
      key: "contactName",
      label: "Contact",
      render: (a) => (
        <div>
          <div>{a.contactName}</div>
          <a className={styles.muted} href={`tel:${a.phone}`}>
            {a.phone}
          </a>
        </div>
      ),
    },
    {
      key: "stage",
      label: "Stage",
      render: (a) => (
        <div>
          <Badge tone={STAGE_TONE[a.stage]}>{STAGE_LABEL[a.stage]}</Badge>
          <div className={styles.muted}>
            {a.stage === "ENQUIRY" ? (a.contactedAt ? "contacted" : "not called yet") : a.stage === "TEST" && a.testAt ? (a.testResult ? `result: ${a.testResult.toLowerCase()}` : when(a.testAt)) : ""}
          </div>
        </div>
      ),
    },
    {
      key: "feeStatus",
      label: "Reg. fee",
      render: (a) =>
        a.feeStatus === "NONE" ? (
          <span className={styles.muted}>—</span>
        ) : (
          <div>
            <div>{inr(a.feeAmount)}</div>
            <Badge tone={a.feeStatus === "PAID" ? "success" : a.feeStatus === "WAIVED" ? "neutral" : "warning"}>{a.feeStatus === "PAID" ? "Paid" : a.feeStatus === "WAIVED" ? "Waived" : "Unpaid"}</Badge>
          </div>
        ),
    },
    { key: "createdAt", label: "Received", render: (a) => <span className={styles.muted}>{fmtDate(a.createdAt)}</span> },
  ];

  return (
    <Card
      title="Applications"
      action={
        <Button
          size="sm"
          variant="outline"
          icon={<Icon name="download" size={15} />}
          isLoading={downloading}
          onClick={async () => {
            try {
              await download({ path: "admissions", params: { stage, sessionId } }).unwrap();
            } catch (e) {
              toast.error(getErrorMessage(e, "Couldn't download"));
            }
          }}
        >
          Excel
        </Button>
      }
    >
      <div className={styles.stageChips} role="tablist" aria-label="Filter by stage">
        {FILTERS.map(([key, label]) => (
          <button key={key || "ALL"} type="button" role="tab" aria-selected={stage === key} className={`${styles.stageChip} ${stage === key ? styles.stageChipActive : ""}`} onClick={() => setStage(key)}>
            {label} <span className={styles.chipCount}>{countOf(key)}</span>
          </button>
        ))}
      </div>
      <div className={styles.filters}>
        <Input label="Search" placeholder="Name, application no. or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select
          label="Session"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          options={[{ label: "All sessions", value: "" }, ...sessions.map((s) => ({ label: s.name, value: String(s.id) }))]}
        />
      </div>
      {isLoading ? (
        <Spinner />
      ) : (
        <div style={{ opacity: isFetching ? 0.6 : 1 }}>
          <Table columns={columns} data={data?.applications ?? []} keyField="id" emptyMessage="No applications here" stackBelow={900} />
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------

const SettingsTab = () => {
  const can = useCan();
  const canManage = can("admissions.manage");
  const canFee = can("fees.configure");
  const { data: s, isLoading } = useGetAdmissionSettingsQuery();
  const { data: sessions = [] } = useGetSessionsQuery();
  const [save, { isLoading: saving }] = useSaveAdmissionSettingsMutation();
  const [form, setForm] = useState<{
    isOpen: boolean;
    sessionId: string;
    classNames: string[];
    closesOn: string;
    instructions: string;
    allowUploads: boolean;
    defaultFee: string;
    classFees: Record<string, string>;
  } | null>(null);

  useEffect(() => {
    if (!s) return;
    setForm({
      isOpen: s.isOpen,
      sessionId: s.sessionId ? String(s.sessionId) : "",
      classNames: s.classNames,
      closesOn: s.closesOn ? s.closesOn.slice(0, 10) : "",
      instructions: s.instructions ?? "",
      allowUploads: s.allowUploads,
      defaultFee: String(s.defaultFee || ""),
      classFees: Object.fromEntries(Object.entries(s.classFees).map(([k, v]) => [k, String(v)])),
    });
  }, [s]);

  if (isLoading || !s || !form) return <Spinner />;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const toggleClass = (c: string) => set("classNames", form.classNames.includes(c) ? form.classNames.filter((x) => x !== c) : [...form.classNames, c]);

  const submit = async () => {
    try {
      await save({
        isOpen: form.isOpen,
        sessionId: form.sessionId ? Number(form.sessionId) : null,
        classNames: form.classNames,
        closesOn: form.closesOn || null,
        instructions: form.instructions,
        allowUploads: form.allowUploads,
        ...(canFee ? { defaultFee: Number(form.defaultFee || 0), classFees: Object.fromEntries(Object.entries(form.classFees).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])) } : {}),
      } as never).unwrap();
      toast.success("Admission settings saved");
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save the settings"));
    }
  };

  return (
    <div className={styles.section}>
      <Card title="Online form" subtitle="While open, the website takes full applications for the chosen session and classes. Enquiries are taken all year.">
        <div className={styles.formGrid}>
          <label className={`${styles.check} ${styles.wide}`}>
            <input type="checkbox" disabled={!canManage} checked={form.isOpen} onChange={(e) => set("isOpen", e.target.checked)} />
            Take applications on the website now
          </label>
          <Select
            label="Admissions for session"
            disabled={!canManage}
            value={form.sessionId}
            onChange={(e) => set("sessionId", e.target.value)}
            options={[{ label: "Choose…", value: "" }, ...sessions.map((x) => ({ label: `${x.name}${x.isCurrent ? " (current)" : ""}`, value: String(x.id) }))]}
          />
          <Input label="Last date to apply (optional)" type="date" disabled={!canManage} value={form.closesOn} onChange={(e) => set("closesOn", e.target.value)} />
          <div className={styles.wide}>
            <span className={styles.fieldLabel}>Classes taking applications</span>
            <p className={styles.muted} style={{ margin: "0 0 0.4rem" }}>
              None ticked = every class. {s.allClasses.length ? "" : "No classes found for this session."}
            </p>
            <div className={styles.stageChips}>
              {s.allClasses.map((c) => (
                <button key={c} type="button" disabled={!canManage} className={`${styles.stageChip} ${form.classNames.includes(c) ? styles.stageChipActive : ""}`} aria-pressed={form.classNames.includes(c)} onClick={() => toggleClass(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <label className={`${styles.check} ${styles.wide}`}>
            <input type="checkbox" disabled={!canManage} checked={form.allowUploads} onChange={(e) => set("allowUploads", e.target.checked)} />
            Families may attach up to 3 documents (stored privately; moved to the student on admission)
          </label>
          <label className={styles.wide}>
            <span className={styles.fieldLabel}>Instructions shown above the form</span>
            <textarea className={styles.textarea} disabled={!canManage} value={form.instructions} maxLength={3000} placeholder="e.g. Interaction for Nursery–UKG; written test for Class 1 and above." onChange={(e) => set("instructions", e.target.value)} />
          </label>
        </div>
      </Card>

      <Card title="Registration fee" subtitle={canFee ? "One amount for every class; set a different amount for a class to override it (0 = free)." : "Set by the Super Admin."}>
        <div className={styles.formGrid}>
          <Input label="Fee for every class (₹)" type="number" min={0} disabled={!canFee} value={form.defaultFee} placeholder="0" onChange={(e) => set("defaultFee", e.target.value)} />
          <div />
        </div>
        <div className={styles.feeTable}>
          {s.allClasses.map((c) => (
            <Input
              key={c}
              label={c}
              type="number"
              min={0}
              disabled={!canFee}
              value={form.classFees[c] ?? ""}
              placeholder={form.defaultFee ? `${form.defaultFee} (default)` : "default"}
              onChange={(e) => set("classFees", { ...form.classFees, [c]: e.target.value })}
            />
          ))}
        </div>
        <p className={styles.muted}>
          {s.onlinePayment ? "Families can pay online (Razorpay) or at the office." : "Online payment isn't set up, so families pay at the office."} Paid fees appear in Expenses &amp; Accounts as income.
        </p>
      </Card>

      {(canManage || canFee) && (
        <div className={styles.actions}>
          <Button isLoading={saving} onClick={submit}>
            Save settings
          </Button>
        </div>
      )}
    </div>
  );
};

export default AdmissionsPage;
