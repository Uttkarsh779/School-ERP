import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { Badge, Button, Card, Select } from "../../ui";
import { esc, printHtml } from "../Print/printDocument";
import {
  REQUEST_LABEL,
  useCreateDataRequestMutation,
  useGetMyConsentStatusQuery,
  useGetMyDataRequestsQuery,
  useLazyGetMyDataQuery,
  type DataRequestType,
  type MyData,
} from "../../../store/api/privacy.api";

// "Your data" on the student's My Profile (parents use this login): see and print what the
// school holds, and ask for a correction, erasure, or to withdraw consent (DPDP Act rights).

const date = (v?: string | null) => (v ? new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

const LABELS: Record<string, string> = {
  name: "Name", admissionNo: "Admission no.", admissionDate: "Admission date", class: "Class", session: "Session", rollNo: "Roll no.",
  dob: "Date of birth", gender: "Gender", bloodGroup: "Blood group", category: "Category", nationality: "Nationality",
  aadhaar: "Aadhaar (masked)", apaarId: "APAAR ID", fatherName: "Father's name", fatherContact: "Father's phone",
  motherName: "Mother's name", motherContact: "Mother's phone", contactNumber: "Student's phone", address: "Address",
  previousSchool: "Previous school", loginEmail: "Login email", photoOnFile: "Photo on file", transport: "School transport",
};

const printMyData = (d: MyData) => {
  const val = (k: string, v: unknown) =>
    v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "Yes" : "No") : /date|dob/i.test(k) ? date(String(v)) : String(v);
  const rows = Object.entries(d.profile)
    .map(([k, v]) => `<tr><th>${esc(LABELS[k] ?? k)}</th><td>${esc(val(k, v))}</td></tr>`)
    .join("");
  const consents = d.consents.length
    ? d.consents.map((c) => `<tr><td>${esc(date(c.givenAt))}</td><td>${esc(c.givenBy)} (${esc(c.relationship)})</td><td>${c.method === "PAPER" ? "Paper form" : "Online"}</td><td>${c.withdrawnAt ? `Withdrawn ${esc(date(c.withdrawnAt))}` : "Active"}</td></tr>`).join("")
    : `<tr><td colspan="4">None</td></tr>`;
  printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Personal data held — ${esc(String(d.profile.name ?? ""))}</title><style>
    @page { size: A4 portrait; margin: 12mm; }
    body { margin: 0; font: 10pt/1.45 "Segoe UI", Arial, sans-serif; color: #1b2430; }
    h1 { font-size: 15pt; margin: 0 0 2mm; } h2 { font-size: 11.5pt; margin: 6mm 0 2mm; }
    p.note { color: #5d6675; margin: 0 0 4mm; }
    table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #c9ced6; padding: 1.6mm 2.4mm; text-align: left; vertical-align: top; }
    th { width: 38%; background: #f4f6f9; font-weight: 600; }
  </style></head><body>
    <h1>Personal data held by the school</h1>
    <p class="note">Generated ${esc(date(d.generatedAt))}. Ask the school office for a copy of any record listed here.</p>
    <h2>Student details</h2><table>${rows}</table>
    <h2>School records</h2><table>
      <tr><th>Attendance entries</th><td>${d.records.attendanceDays}</td></tr>
      <tr><th>Exam results</th><td>${d.records.examResults}</td></tr>
      <tr><th>Fee payments</th><td>${d.records.payments}</td></tr>
      <tr><th>Certificates issued</th><td>${d.records.certificates}</td></tr>
    </table>
    <h2>Consent</h2><table><tr><th style="width:auto">Date</th><th style="width:auto">Given by</th><th style="width:auto">How</th><th style="width:auto">Status</th></tr>${consents}</table>
  </body></html>`);
};

const STATUS: Record<string, { label: string; tone: "warning" | "success" | "neutral" }> = {
  OPEN: { label: "Waiting for the school", tone: "warning" },
  RESOLVED: { label: "Done", tone: "success" },
  REJECTED: { label: "Declined", tone: "neutral" },
};

const YourDataCard = () => {
  const { data: status } = useGetMyConsentStatusQuery();
  const { data: requests = [] } = useGetMyDataRequestsQuery();
  const [loadData, { isFetching }] = useLazyGetMyDataQuery();
  const [create, { isLoading: sending }] = useCreateDataRequestMutation();
  const [type, setType] = useState<DataRequestType | "">("");
  const [details, setDetails] = useState("");

  const view = async () => {
    try {
      printMyData(await loadData().unwrap());
    } catch {
      toast.error("Couldn't load your data. Please try again.");
    }
  };
  const send = async () => {
    if (!type) return;
    try {
      const r = await create({ type, details: details.trim() }).unwrap();
      toast.success(r.message ?? "Request sent");
      setType("");
      setDetails("");
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't send the request");
    }
  };
  const c = status?.consent;

  return (
    <Card title="Your data & privacy" subtitle="Your rights under India's data protection law">
      <div style={{ display: "grid", gap: "1rem" }}>
        <p style={{ margin: 0, lineHeight: 1.55 }}>
          {c ? (
            <>
              Consent given by <strong>{c.givenBy}</strong> ({c.relationship}) on {date(c.givenAt)}
              {c.method === "PAPER" ? " on a paper form" : " online"}.{" "}
            </>
          ) : null}
          <Link to="/privacy" target="_blank" rel="noopener noreferrer">Read the privacy notice</Link>
        </p>
        <div>
          <Button variant="outline" onClick={view} isLoading={isFetching}>
            View / print the data the school holds
          </Button>
        </div>

        <div style={{ display: "grid", gap: "0.6rem" }}>
          <strong style={{ fontSize: "0.95rem" }}>Ask the school</strong>
          <Select
            label="What would you like?"
            value={type}
            onChange={(e) => setType(e.target.value as DataRequestType)}
            options={[{ label: "Choose…", value: "" }, ...(Object.keys(REQUEST_LABEL) as DataRequestType[]).map((k) => ({ label: REQUEST_LABEL[k], value: k }))]}
          />
          {type && (
            <>
              <label style={{ display: "grid", gap: 4, fontSize: "0.88rem", fontWeight: 600 }}>
                Details
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder={type === "CORRECTION" ? "e.g. Date of birth should be 12 May 2014, not 21 May 2014" : "Tell the school what you'd like and why"}
                  style={{ font: "inherit", fontWeight: 400, padding: "0.55rem 0.7rem", borderRadius: 8, border: "1px solid var(--erp-border, #cfd5dd)", resize: "vertical" }}
                />
              </label>
              {type !== "CORRECTION" && (
                <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--erp-text-muted)" }}>
                  The school must keep some records by law (for example admission registers, transfer certificates and fee receipts). It will tell you what it can and can't remove.
                </p>
              )}
              <div>
                <Button onClick={send} isLoading={sending} disabled={details.trim().length < 10}>Send request</Button>
              </div>
            </>
          )}
        </div>

        {requests.length > 0 && (
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <strong style={{ fontSize: "0.95rem" }}>Your requests</strong>
            {requests.map((r) => (
              <div key={r.id} style={{ border: "1px solid var(--erp-border, #dfe3e8)", borderRadius: 8, padding: "0.6rem 0.75rem", fontSize: "0.88rem" }}>
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
                  <strong>{REQUEST_LABEL[r.type]}</strong>
                  <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                </div>
                <div style={{ color: "var(--erp-text-muted)", margin: "0.2rem 0" }}>{date(r.createdAt)} · {r.details}</div>
                {r.response && <div><strong>School's reply:</strong> {r.response}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

export default YourDataCard;
