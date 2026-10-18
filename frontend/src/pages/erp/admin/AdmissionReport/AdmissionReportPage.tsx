import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Table,
  type TableColumn,
} from "../../../../components/ui";
import BreakdownList from "../../../../components/shared/BreakdownList/BreakdownList";
import { useGetSessionsQuery } from "../../../../store/api/sessions.api";
import {
  useGetAdmissionFilterOptionsQuery,
  useGetAdmissionReportQuery,
  type AdmissionReportFilters,
  type AdmissionReportRow,
} from "../../../../store/api/admissionReport.api";
import styles from "./AdmissionReportPage.module.css";

const GENDER_LABEL: Record<string, string> = { MALE: "Male", FEMALE: "Female", OTHER: "Other", UNSPECIFIED: "Not recorded" };
const CATEGORY_LABEL: Record<string, string> = {
  GENERAL: "General",
  OBC: "OBC",
  SC: "SC",
  ST: "ST",
  EWS: "EWS",
  UNSPECIFIED: "Not recorded",
};

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const formatMonth = (yyyyMm: string) =>
  new Date(`${yyyyMm}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

const classLabel = (r: AdmissionReportRow) => (r.className ? `${r.className}${r.section ? ` - ${r.section}` : ""}` : "—");

const EMPTY_FILTERS: AdmissionReportFilters = { status: "all", sortBy: "admissionDate", sortOrder: "desc" };

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const exportCsv = (rows: AdmissionReportRow[]) => {
  const header = [
    "Admission No",
    "Student Name",
    "Admission Date",
    "Class",
    "Section",
    "Roll No",
    "Gender",
    "Category",
    "Date of Birth",
    "Father's Name",
    "Mother's Name",
    "Contact",
    "Previous School",
    "Status",
  ];
  const lines = rows.map((r) =>
    [
      r.admissionNo,
      r.name,
      r.admissionDate.slice(0, 10),
      r.className,
      r.section,
      r.rollNo,
      r.gender ? GENDER_LABEL[r.gender] : "",
      r.category ?? "",
      r.dob ? r.dob.slice(0, 10) : "",
      r.fatherName,
      r.motherName,
      r.contact,
      r.previousSchool,
      r.isActive ? "Active" : "Inactive",
    ]
      .map(csvCell)
      .join(",")
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `admission-report-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

const AdmissionReportPage = () => {
  const navigate = useNavigate();
  const { data: sessions } = useGetSessionsQuery();
  const { data: filterOptions } = useGetAdmissionFilterOptionsQuery();

  const [filters, setFilters] = useState<AdmissionReportFilters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [sessionDefaulted, setSessionDefaulted] = useState(false);
  const [viewing, setViewing] = useState<AdmissionReportRow | null>(null);

  // Open on the current academic session by default — the most common question is
  // "how many admissions this session".
  useEffect(() => {
    if (sessionDefaulted || !sessions) return;
    const current = sessions.find((s) => s.isCurrent);
    if (current) setFilters((f) => ({ ...f, sessionId: String(current.id) }));
    setSessionDefaulted(true);
  }, [sessions, sessionDefaulted]);

  // Debounce search so each keystroke doesn't hit the server.
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput.trim() || undefined })), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isFetching, isError, refetch } = useGetAdmissionReportQuery(filters, {
    skip: !sessionDefaulted,
  });

  const setFilter = (key: keyof AdmissionReportFilters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value || undefined }));

  const resetFilters = () => {
    setSearchInput("");
    setFilters(EMPTY_FILTERS);
  };

  const handleExport = () => {
    if (!data?.rows.length) {
      toast.info("There are no records to export for the selected filters.");
      return;
    }
    exportCsv(data.rows);
  };

  const summary = data?.summary;

  const classItems = useMemo(
    () =>
      (summary?.byClass ?? []).map((c) => ({
        label: c.className,
        value: c.total,
        hint: `M ${c.male} · F ${c.female}`,
      })),
    [summary]
  );
  const categoryItems = useMemo(
    () =>
      Object.entries(summary?.byCategory ?? {})
        .filter(([, count]) => count > 0)
        .map(([key, count]) => ({ label: CATEGORY_LABEL[key] ?? key, value: count })),
    [summary]
  );
  const monthItems = useMemo(
    () => (summary?.monthlyTrend ?? []).map((m) => ({ label: formatMonth(m.month), value: m.count })),
    [summary]
  );

  const columns: TableColumn<AdmissionReportRow>[] = [
    { key: "admissionNo", label: "Adm. No", render: (r) => <strong>{r.admissionNo}</strong> },
    {
      key: "name",
      label: "Student",
      render: (r) => (
        <div>
          <div className={styles.primaryText}>{r.name}</div>
          {r.fatherName && <div className={styles.secondaryText}>S/D of {r.fatherName}</div>}
        </div>
      ),
    },
    {
      key: "admissionDate",
      label: "Admission Date",
      render: (r) => (
        <span title={r.admissionDateRecorded ? undefined : "Admission date not recorded — showing record creation date"}>
          {formatDate(r.admissionDate)}
          {!r.admissionDateRecorded && <span className={styles.secondaryText}> *</span>}
        </span>
      ),
    },
    { key: "className", label: "Class", render: classLabel },
    { key: "gender", label: "Gender", render: (r) => (r.gender ? GENDER_LABEL[r.gender] : "—") },
    { key: "category", label: "Category", render: (r) => r.category ?? "—" },
    { key: "contact", label: "Contact", render: (r) => r.contact ?? "—" },
    {
      key: "isActive",
      label: "Status",
      render: (r) => <Badge tone={r.isActive ? "success" : "danger"}>{r.isActive ? "Active" : "Inactive"}</Badge>,
    },
    {
      key: "actions",
      label: "Actions",
      render: (r) => (
        <div className={styles.rowActions}>
          <Button type="button" size="sm" variant="outline" onClick={() => setViewing(r)}>
            View
          </Button>
          <Button type="button" size="sm" variant="primary" onClick={() => navigate(`/admin/students/${r.id}`)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  const sessionOptions = [
    { label: "All Sessions", value: "" },
    ...(sessions ?? []).map((s) => ({ label: `${s.name}${s.isCurrent ? " (Current)" : ""}`, value: String(s.id) })),
  ];

  return (
    <div className={styles.container}>
      <PageHeader
        title="Admission Report"
        subtitle="Admissions registered at RRS Intl School — filter by session, class, date and student details"
        actions={
          <div className={styles.headerActions}>
            <Button type="button" variant="outline" onClick={handleExport} disabled={!data?.rows.length}>
              Export CSV
            </Button>
            <Button type="button" icon={<Icon name="plus" />} onClick={() => navigate("/admin/students")}>
              Register Student
            </Button>
          </div>
        }
      />

      <Card title="Filters" action={<Button type="button" size="sm" variant="ghost" onClick={resetFilters}>Reset</Button>}>
        <div className={styles.filtersGrid}>
          <div className={styles.searchField}>
            <Input
              label="Search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Name, admission no, parent name or phone…"
            />
          </div>
          <Select
            label="Academic Session"
            options={sessionOptions}
            value={filters.sessionId ?? ""}
            onChange={(e) => setFilter("sessionId", e.target.value)}
          />
          <Input label="Admitted From" type="date" value={filters.from ?? ""} max={filters.to} onChange={(e) => setFilter("from", e.target.value)} />
          <Input label="Admitted To" type="date" value={filters.to ?? ""} min={filters.from} onChange={(e) => setFilter("to", e.target.value)} />
          <Select
            label="Class"
            options={[{ label: "All Classes", value: "" }, ...(filterOptions?.classNames ?? []).map((c) => ({ label: c, value: c }))]}
            value={filters.className ?? ""}
            onChange={(e) => setFilter("className", e.target.value)}
          />
          <Select
            label="Section"
            options={[{ label: "All Sections", value: "" }, ...(filterOptions?.sections ?? []).map((s) => ({ label: s, value: s }))]}
            value={filters.section ?? ""}
            onChange={(e) => setFilter("section", e.target.value)}
          />
          <Select
            label="Gender"
            options={[{ label: "All Genders", value: "" }, ...Object.entries(GENDER_LABEL).map(([value, label]) => ({ label, value }))]}
            value={filters.gender ?? ""}
            onChange={(e) => setFilter("gender", e.target.value)}
          />
          <Select
            label="Category"
            options={[{ label: "All Categories", value: "" }, ...Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ label, value }))]}
            value={filters.category ?? ""}
            onChange={(e) => setFilter("category", e.target.value)}
          />
          <Select
            label="Status"
            options={[
              { label: "All Statuses", value: "all" },
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
            ]}
            value={filters.status ?? "all"}
            onChange={(e) => setFilter("status", e.target.value)}
          />
          <Select
            label="Sort By"
            options={[
              { label: "Admission Date (Newest)", value: "admissionDate:desc" },
              { label: "Admission Date (Oldest)", value: "admissionDate:asc" },
              { label: "Student Name (A–Z)", value: "name:asc" },
              { label: "Admission No", value: "admissionNo:asc" },
              { label: "Class", value: "className:asc" },
            ]}
            value={`${filters.sortBy}:${filters.sortOrder}`}
            onChange={(e) => {
              const [sortBy, sortOrder] = e.target.value.split(":") as [
                AdmissionReportFilters["sortBy"],
                AdmissionReportFilters["sortOrder"],
              ];
              setFilters((f) => ({ ...f, sortBy, sortOrder }));
            }}
          />
        </div>
      </Card>

      {isError ? (
        <Card>
          <EmptyState
            title="Couldn't load the admission report"
            description="Check your connection and try again."
            action={<Button type="button" variant="outline" onClick={() => refetch()}>Retry</Button>}
          />
        </Card>
      ) : isLoading || !summary ? (
        <Spinner />
      ) : (
        <>
          <div className={styles.statsGrid}>
            <StatCard
              label={data?.session ? `Admissions in ${data.session.name}` : "Total Admissions"}
              value={summary.total}
              icon={<Icon name="graduationCap" />}
            />
            <StatCard label="Boys" value={summary.byGender.MALE ?? 0} icon={<Icon name="users" />} />
            <StatCard label="Girls" value={summary.byGender.FEMALE ?? 0} icon={<Icon name="users" />} />
            <StatCard label="Currently Active" value={`${summary.active} / ${summary.total}`} icon={<Icon name="check" />} />
          </div>

          <div className={styles.breakdownGrid}>
            <Card title="Class-wise Admissions" subtitle="Current class of each admitted student">
              <BreakdownList items={classItems} emptyMessage="No admissions match these filters" />
            </Card>
            <Card title="Category-wise" subtitle="RTE / government reporting category">
              <BreakdownList items={categoryItems} emptyMessage="No admissions match these filters" />
            </Card>
            <Card title="Monthly Trend" subtitle="Admissions per month">
              <BreakdownList items={monthItems} emptyMessage="No admissions match these filters" />
            </Card>
          </div>

          <Card
            title="Admission Records"
            subtitle={`${summary.total} record${summary.total === 1 ? "" : "s"} · * admission date not recorded, record creation date shown`}
          >
            {isFetching ? (
              <Spinner />
            ) : (
              <Table
                columns={columns}
                data={data!.rows}
                keyField="id"
                emptyMessage="No admissions found for the selected filters."
              />
            )}
          </Card>
        </>
      )}

      {viewing && (
        <Modal title="Admission Details" size="lg" onClose={() => setViewing(null)}>
          <div className={styles.detailHeader}>
            <div>
              <div className={styles.detailName}>{viewing.name}</div>
              <div className={styles.secondaryText}>Admission No {viewing.admissionNo}</div>
            </div>
            <Badge tone={viewing.isActive ? "success" : "danger"}>{viewing.isActive ? "Active" : "Inactive"}</Badge>
          </div>
          <dl className={styles.detailGrid}>
            {[
              ["Admission Date", `${formatDate(viewing.admissionDate)}${viewing.admissionDateRecorded ? "" : " (not recorded)"}`],
              ["Current Class", classLabel(viewing)],
              ["Roll No", viewing.rollNo],
              ["Class Session", viewing.sessionName ?? "—"],
              ["Gender", viewing.gender ? GENDER_LABEL[viewing.gender] : "—"],
              ["Category", viewing.category ?? "—"],
              ["Date of Birth", formatDate(viewing.dob)],
              ["Contact", viewing.contact ?? "—"],
              ["Father's Name", viewing.fatherName ?? "—"],
              ["Mother's Name", viewing.motherName ?? "—"],
              ["Previous School", viewing.previousSchool ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className={styles.detailItem}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className={styles.formActions}>
            <Button type="button" variant="outline" onClick={() => setViewing(null)}>
              Close
            </Button>
            <Button type="button" onClick={() => navigate(`/admin/students/${viewing.id}`)}>
              Open Student Profile →
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdmissionReportPage;
