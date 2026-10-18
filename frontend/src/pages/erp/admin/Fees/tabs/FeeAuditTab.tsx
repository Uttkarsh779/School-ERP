import { useMemo, useState } from "react";
import { Badge, Card, Input, Modal, Spinner, Table, Button } from "../../../../../components/ui";
import type { TableColumn } from "../../../../../components/ui";
import { useGetAuditLogsQuery } from "../../../../../store/api/fees.api";
import { humanize } from "../feeUtils";
import styles from "../Fees.module.css";

type AuditRow = {
  id: number;
  action: string;
  entityType: string;
  entityId: number;
  oldValues: string | null;
  newValues: string | null;
  timestamp: string;
  user?: { id: number; name: string; role?: string };
};

const pretty = (json: string | null) => {
  if (!json) return "—";
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
};

// Super Admin: last 100 fee actions (payments, waivers, refunds, structure changes).
const FeeAuditTab = () => {
  const { data = [], isLoading } = useGetAuditLogsQuery();
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<AuditRow | null>(null);

  const rows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (data as AuditRow[]).filter(
      (r) => !q || r.action.toLowerCase().includes(q) || r.entityType.toLowerCase().includes(q) || (r.user?.name ?? "").toLowerCase().includes(q)
    );
  }, [data, search]);

  const columns: TableColumn<AuditRow>[] = [
    {
      key: "timestamp",
      label: "When",
      render: (r) => new Date(r.timestamp).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
    },
    { key: "action", label: "Action", render: (r) => <Badge tone="neutral">{humanize(r.action)}</Badge> },
    { key: "entity", label: "Record", render: (r) => `${r.entityType} #${r.entityId}` },
    { key: "user", label: "By", render: (r) => r.user?.name ?? "—" },
    {
      key: "details",
      label: "",
      render: (r) => (
        <Button size="sm" variant="outline" onClick={() => setViewing(r)}>
          Details
        </Button>
      ),
    },
  ];

  return (
    <Card title="Fee audit log" subtitle="Last 100 fee actions — who did what, and when">
      <div className={styles.filters}>
        <div className={styles.wide}>
          <Input label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Action, record type or person…" />
        </div>
      </div>
      {isLoading ? <Spinner /> : <Table columns={columns} data={rows} keyField="id" emptyMessage="No fee actions recorded yet." />}

      {viewing && (
        <Modal title={`${humanize(viewing.action)} · ${viewing.entityType} #${viewing.entityId}`} size="lg" onClose={() => setViewing(null)}>
          <div className={styles.twoCol}>
            <div>
              <div className={styles.itemTitle}>Before</div>
              <pre className={styles.muted} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(viewing.oldValues)}</pre>
            </div>
            <div>
              <div className={styles.itemTitle}>After</div>
              <pre className={styles.muted} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pretty(viewing.newValues)}</pre>
            </div>
          </div>
        </Modal>
      )}
    </Card>
  );
};

export default FeeAuditTab;
