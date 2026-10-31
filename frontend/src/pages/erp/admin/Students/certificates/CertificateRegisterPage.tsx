import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, Spinner, StatCard, Table } from "../../../../../components/ui";
import type { TableColumn } from "../../../../../components/ui";
import { CERTIFICATES, printCertificate } from "../../../../../components/shared/Print/certificates";
import { esc, letterheadHtml, LETTERHEAD_CSS, printHtml } from "../../../../../components/shared/Print/printDocument";
import { usePrintSchool } from "../../../../../components/shared/Print/usePrintSchool";
import { useGetCertificateRegisterQuery, type CertificateType, type StudentCertificate } from "../../../../../store/api/certificates.api";
import styles from "./Certificates.module.css";

// Certificate register: every TC and certificate the school has issued, with serial
// numbers, in one place (the office's issue register). Issuing and cancelling happen on the
// student's profile → Certificates tab.

const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
// Academic year April–March, matching the serial numbers (TC/2026-27/001).
const yearOf = (d: string) => {
  const [y, m] = d.slice(0, 7).split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};
const classOf = (c: StudentCertificate) => c.data.className || c.data.classLastStudied || "";

const CertificateRegisterPage = () => {
  const { data, isLoading, isError, refetch } = useGetCertificateRegisterQuery();
  const schoolFor = usePrintSchool();
  const [type, setType] = useState<"" | CertificateType>("");
  const [year, setYear] = useState("");
  const [status, setStatus] = useState<"" | "issued" | "cancelled">("");
  const [search, setSearch] = useState("");

  const years = useMemo(() => [...new Set((data ?? []).map((c) => yearOf(c.issueDate)))].sort().reverse(), [data]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(
      (c) =>
        (!type || c.type === type) &&
        (!year || yearOf(c.issueDate) === year) &&
        (!status || (status === "cancelled" ? !!c.cancelledAt : !c.cancelledAt)) &&
        (!q || [c.serialNo, c.student?.name, c.student?.admissionNo, c.data.studentName].some((v) => v?.toLowerCase().includes(q)))
    );
  }, [data, type, year, status, search]);

  const counts = useMemo(() => {
    const issued = rows.filter((c) => !c.cancelledAt);
    return { total: issued.length, tc: issued.filter((c) => c.type === "TRANSFER").length, cancelled: rows.length - issued.length };
  }, [rows]);

  const reprint = (c: StudentCertificate) =>
    printCertificate(
      { type: c.type, serialNo: c.serialNo, issueDate: c.issueDate.slice(0, 10), data: c.data, cancelled: !!c.cancelledAt },
      schoolFor(c.type === "TRANSFER" ? "tc" : "certificate")
    );

  // The register itself, as an A4 landscape list.
  const printRegister = () => {
    const filters = [type && CERTIFICATES[type].label, year && `Year ${year}`, status === "cancelled" ? "Cancelled only" : status === "issued" ? "Issued only" : ""].filter(Boolean).join(" · ");
    const body = [...rows]
      .reverse()
      .map(
        (c, i) => `<tr class="${c.cancelledAt ? "x" : ""}">
          <td class="r">${i + 1}</td><td><b>${esc(c.serialNo)}</b></td><td>${esc(CERTIFICATES[c.type].label)}</td><td>${esc(fmt(c.issueDate))}</td>
          <td>${esc(c.student?.name ?? c.data.studentName ?? "")}</td><td>${esc(c.student?.admissionNo ?? "")}</td><td>${esc(classOf(c))}</td>
          <td>${esc(c.issuedByUser?.name ?? "")}</td>
          <td>${c.cancelledAt ? `Cancelled ${esc(fmt(c.cancelledAt))}${c.cancelReason ? `: ${esc(c.cancelReason)}` : ""}` : "Issued"}</td>
        </tr>`
      )
      .join("");
    printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>Certificate register</title><style>
      @page { size: A4 landscape; margin: 9mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt sans-serif; color: #666; } }
      * { box-sizing: border-box; }
      :root { --ink: #23395b; --line: #c4cad3; }
      body { margin: 0; font: 8.6pt/1.35 "Segoe UI", Arial, sans-serif; color: #1b2430; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      ${LETTERHEAD_CSS}
      h2 { margin: 8px 0 2px; text-align: center; font-size: 12.5pt; letter-spacing: .08em; text-transform: uppercase; color: var(--ink); }
      .sub { text-align: center; color: #4a5361; margin-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid var(--line); padding: 3px 5px; text-align: left; vertical-align: top; }
      thead th { background: var(--ink); color: #fff; font-weight: 600; }
      tr { break-inside: avoid; }
      .r { text-align: right; }
      tr.x td { color: #8a93a1; }
      tr.x td:nth-child(2) { text-decoration: line-through; }
    </style></head><body>
      ${letterheadHtml(schoolFor("certificate") ?? {})}
      <h2>Certificate Register</h2>
      <div class="sub">${esc(filters || "All certificates")} · ${counts.total} issued${counts.cancelled ? `, ${counts.cancelled} cancelled` : ""}</div>
      <table><thead><tr><th class="r">#</th><th>Serial No.</th><th>Certificate</th><th>Date</th><th>Student</th><th>Adm. No.</th><th>Class</th><th>Issued by</th><th>Status</th></tr></thead>
      <tbody>${body || '<tr><td colspan="9">No certificates</td></tr>'}</tbody></table>
    </body></html>`);
  };

  const columns: TableColumn<StudentCertificate>[] = [
    { key: "serialNo", label: "Serial No.", render: (c) => <strong className={c.cancelledAt ? styles.struck : undefined}>{c.serialNo}</strong> },
    { key: "type", label: "Certificate", render: (c) => CERTIFICATES[c.type].label },
    { key: "issueDate", label: "Date", render: (c) => fmt(c.issueDate) },
    {
      key: "student",
      label: "Student",
      render: (c) =>
        c.student ? (
          <div>
            <Link to={`/admin/students/${c.student.id}`}>{c.student.name}</Link>
            <div className={styles.muted}>
              {c.student.admissionNo}
              {classOf(c) ? ` · ${classOf(c)}` : ""}
            </div>
          </div>
        ) : (
          c.data.studentName ?? "—"
        ),
    },
    { key: "issuedBy", label: "Issued by", render: (c) => c.issuedByUser?.name ?? "—" },
    {
      key: "status",
      label: "Status",
      render: (c) =>
        c.cancelledAt ? (
          <div>
            <Badge tone="danger">Cancelled</Badge>
            {c.cancelReason && <div className={styles.muted}>{c.cancelReason}</div>}
          </div>
        ) : (
          <Badge tone="success">Issued</Badge>
        ),
    },
    {
      key: "actions",
      label: "",
      render: (c) => (
        <Button size="sm" variant="outline" onClick={() => reprint(c)}>
          Reprint
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Certificate Register"
        subtitle="Every TC and certificate issued, with serial numbers. To issue a new one, open the student's profile → Certificates."
        actions={
          <Button variant="outline" onClick={printRegister} disabled={!rows.length}>
            Print register
          </Button>
        }
      />

      <div className={styles.registerStats}>
        <StatCard label="Issued" value={counts.total} />
        <StatCard label="Transfer Certificates" value={counts.tc} />
        <StatCard label="Cancelled" value={counts.cancelled} />
      </div>

      <Card padded={false}>
        <div className={styles.registerFilters}>
          <Select
            label="Certificate"
            value={type}
            onChange={(e) => setType(e.target.value as "" | CertificateType)}
            options={[{ label: "All certificates", value: "" }, ...(Object.keys(CERTIFICATES) as CertificateType[]).map((k) => ({ label: CERTIFICATES[k].label, value: k }))]}
          />
          <Select label="Year" value={year} onChange={(e) => setYear(e.target.value)} options={[{ label: "All years", value: "" }, ...years.map((y) => ({ label: y, value: y }))]} />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            options={[
              { label: "All", value: "" },
              { label: "Issued", value: "issued" },
              { label: "Cancelled", value: "cancelled" },
            ]}
          />
          <Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Serial no., student or admission no." />
        </div>
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <EmptyState title="Couldn't load the register" action={<Button onClick={() => refetch()}>Retry</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={data?.length ? "No certificates match" : "No certificates issued yet"}
            description={data?.length ? "Try other filters." : "Certificates are issued from a student's profile → Certificates tab."}
          />
        ) : (
          <Table columns={columns} data={rows} keyField="id" />
        )}
      </Card>
    </div>
  );
};

export default CertificateRegisterPage;
