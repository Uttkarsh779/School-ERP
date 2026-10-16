import { useState } from "react";
import { Badge, Card, EmptyState, Select, Spinner, Table } from "../../../../components/ui";
import type { SelectOption, TableColumn } from "../../../../components/ui";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetFeeDefaultersQuery, type FeeDefaulter } from "../../../../store/api/fees.api";
import styles from "./AdminFeesPage.module.css";

// Due severity: how much of the total structure amount is still outstanding —
// used purely to color the badge, not a business rule.
const severityTone = (defaulter: FeeDefaulter): "danger" | "warning" => {
  if (defaulter.totalStructureAmount <= 0) return "warning";
  const ratio = defaulter.due / defaulter.totalStructureAmount;
  return ratio >= 0.5 ? "danger" : "warning";
};

const DefaultersSection = () => {
  const [classSectionId, setClassSectionId] = useState<string>("");

  const { data: classSections } = useGetClassSectionsQuery();
  const {
    data: defaulters,
    isLoading,
    isFetching,
  } = useGetFeeDefaultersQuery({ classSectionId: Number(classSectionId) }, { skip: !classSectionId });

  const classSectionOptions: SelectOption[] = (classSections ?? []).map((cs) => ({
    label: `${cs.className} - ${cs.section}`,
    value: cs.id,
  }));

  const columns: TableColumn<FeeDefaulter>[] = [
    { key: "rollNo", label: "Roll No", render: (row) => row.student.rollNo },
    { key: "name", label: "Name", render: (row) => row.student.name },
    { key: "totalStructureAmount", label: "Total Due", render: (row) => `₹${row.totalStructureAmount.toLocaleString("en-IN")}` },
    { key: "totalPaid", label: "Paid", render: (row) => `₹${row.totalPaid.toLocaleString("en-IN")}` },
    {
      key: "due",
      label: "Balance",
      render: (row) => <Badge tone={severityTone(row)}>₹{row.due.toLocaleString("en-IN")}</Badge>,
    },
  ];

  return (
    <Card title="Fee Defaulters" subtitle="Students in a class section with an outstanding fee balance.">
      <div className={styles.filterRow}>
        <Select
          label="Class Section"
          options={classSectionOptions}
          placeholder="Select a class section"
          value={classSectionId}
          onChange={(e) => setClassSectionId(e.target.value)}
        />
      </div>

      {!classSectionId ? (
        <EmptyState title="Pick a class section" description="Select a class section above to view fee defaulters." />
      ) : isLoading || isFetching ? (
        <Spinner />
      ) : (
        <Table
          columns={columns}
          data={defaulters ?? []}
          keyField="studentId"
          emptyMessage="No outstanding balances — everyone in this class is paid up."
        />
      )}
    </Card>
  );
};

export default DefaultersSection;
