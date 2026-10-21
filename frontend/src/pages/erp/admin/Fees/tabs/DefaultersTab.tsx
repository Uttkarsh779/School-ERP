import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Select, Spinner, StatCard, Table } from "../../../../../components/ui";
import type { TableColumn } from "../../../../../components/ui";
import { useGetClassSectionsQuery } from "../../../../../store/api/classSections.api";
import { useGetFeeDefaultersQuery } from "../../../../../store/api/fees.api";
import { useGetPublicWebsiteDataQuery } from "../../../../../store/api/cms.api";
import { useAppSelector } from "../../../../../store/store";
import { classLabel, fmtDate, inr } from "../feeUtils";
import { printDefaultersReport } from "./defaultersPrint";
import styles from "../Fees.module.css";

type Defaulter = {
  studentId: number;
  studentName: string;
  admissionNo: string;
  rollNo: string;
  classSectionId: number;
  classSection: string;
  contactNumber: string | null;
  fatherName?: string | null;
  overdueMonths?: string[];
  overdueChargesCount: number;
  totalDue: number;
  oldestDueDate: string | null;
  daysOverdue: number;
};

// Students with at least one charge past its due date (late fees included, from the
// configured rule). "Collect" jumps to the payment desk with the student selected.
const DefaultersTab = ({ onCollect }: { onCollect: (studentId: number) => void }) => {
  const { data: classSections } = useGetClassSectionsQuery();
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState("");
  const [minDays, setMinDays] = useState("");
  const { data, isLoading, isError, refetch } = useGetFeeDefaultersQuery(classId ? { classSectionId: Number(classId) } : undefined);
  const { data: site } = useGetPublicWebsiteDataQuery();
  const me = useAppSelector((s) => s.auth.user);

  const rows: Defaulter[] = useMemo(() => {
    const q = search.toLowerCase().trim();
    return ((data ?? []) as Defaulter[])
      .filter((d) => d.totalDue > 0)
      .filter((d) => !q || d.studentName.toLowerCase().includes(q) || d.admissionNo.toLowerCase().includes(q))
      .filter((d) => !minDays || d.daysOverdue >= Number(minDays))
      .sort((a, b) => b.totalDue - a.totalDue);
  }, [data, search, minDays]);

  const total = rows.reduce((s, r) => s + r.totalDue, 0);

  // Printed list: letterhead (Website settings), the filters in use, class-wise table.
  const printList = () => {
    const cls = classSections?.find((c) => c.id === Number(classId));
    const filters = [
      cls ? `Class ${classLabel(cls)}` : "All classes",
      minDays ? `Overdue ${minDays}+ days` : "Any overdue period",
      ...(search.trim() ? [`Search "${search.trim()}"`] : []),
    ];
    printDefaultersReport(rows, { school: site?.settings, filters, preparedBy: me?.name ?? null });
  };

  const columns: TableColumn<Defaulter>[] = [
    {
      key: "student",
      label: "Student",
      render: (d) => (
        <div>
          <div className={styles.itemTitle}>{d.studentName}</div>
          <div className={styles.muted}>
            Adm {d.admissionNo} · Roll {d.rollNo}
          </div>
        </div>
      ),
    },
    { key: "classSection", label: "Class" },
    { key: "contactNumber", label: "Contact", render: (d) => d.contactNumber ?? "—" },
    { key: "overdueChargesCount", label: "Overdue items" },
    {
      key: "daysOverdue",
      label: "Overdue since",
      render: (d) => (
        <div>
          <Badge tone={d.daysOverdue > 60 ? "danger" : d.daysOverdue > 30 ? "warning" : "info"}>{d.daysOverdue} days</Badge>
          <div className={styles.muted}>{fmtDate(d.oldestDueDate)}</div>
        </div>
      ),
    },
    { key: "totalDue", label: "Amount due", render: (d) => <span className={`${styles.danger} ${styles.strong}`}>{inr(d.totalDue)}</span> },
    {
      key: "actions",
      label: "",
      render: (d) => (
        <Button size="sm" onClick={() => onCollect(d.studentId)}>
          Collect
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.statsGrid}>
        <StatCard label="Students overdue" value={rows.length} />
        <StatCard label="Total overdue amount" value={inr(total)} />
        <StatCard label="Overdue 60+ days" value={rows.filter((r) => r.daysOverdue > 60).length} />
      </div>

      <Card
        title="Fee defaulters"
        subtitle="Students with fees past the due date, including late fees"
        action={
          <Button size="sm" variant="outline" onClick={printList} disabled={rows.length === 0}>
            Print list
          </Button>
        }
      >
        <div className={styles.filters}>
          <Select
            label="Class"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            options={[{ label: "All classes", value: "" }, ...(classSections ?? []).map((cs) => ({ label: classLabel(cs), value: String(cs.id) }))]}
          />
          <Select
            label="Overdue for at least"
            value={minDays}
            onChange={(e) => setMinDays(e.target.value)}
            options={[
              { label: "Any time", value: "" },
              { label: "15 days", value: "15" },
              { label: "30 days", value: "30" },
              { label: "60 days", value: "60" },
              { label: "90 days", value: "90" },
            ]}
          />
          <div className={styles.wide}>
            <Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Student name or admission no…" />
          </div>
        </div>
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <EmptyState title="Couldn't load defaulters" action={<Button variant="outline" onClick={() => refetch()}>Retry</Button>} />
        ) : (
          <Table columns={columns} data={rows} keyField="studentId" mobilePrimary="student" stackBelow={900} emptyMessage="No overdue fees — nothing to chase." />
        )}
      </Card>
    </div>
  );
};

export default DefaultersTab;
