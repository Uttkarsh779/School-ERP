import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { PageHeader, Button, Table, Badge, Spinner, EmptyState, Icon, Input } from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import { useGetParentsQuery } from "../../../../store/api/parents.api";
import NewParentModal from "./NewParentModal";
import styles from "./ParentsPage.module.css";

const ParentsPage = () => {
  const navigate = useNavigate();
  const { data: parents, isLoading, isError } = useGetParentsQuery();
  const [showNewParent, setShowNewParent] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isError) toast.error("Failed to load parents.");
  }, [isError]);

  const filteredParents = parents?.filter(p => {
    const query = searchQuery.toLowerCase();
    const fallbackName = p.children?.[0]?.student?.fatherName || "unknown";
    
    return p.name?.toLowerCase().includes(query) || 
      fallbackName.toLowerCase().includes(query) ||
      p.contact?.includes(searchQuery) || 
      p.children.some(c => {
        const student = c.student;
        const className = student.classSection?.className?.toLowerCase() || "";
        const section = student.classSection?.section?.toLowerCase() || "";
        const classStr = `${className} ${section}`;
        return student.name.toLowerCase().includes(query) || 
               student.rollNo.toLowerCase().includes(query) ||
               classStr.includes(query) ||
               className.includes(query) ||
               section.includes(query);
      });
  }) || [];

  const columns: TableColumn<IParentGuardian>[] = [
    { key: "name", label: "Family / Guardian", render: (row) => {
      const displayName = row.name && row.name !== "Unknown" ? row.name : (row.children?.[0]?.student?.fatherName || "Unknown");
      return <div style={{ fontWeight: 500 }}>{displayName}</div>;
    } },
    { key: "contact", label: "Contact", render: (row) => (
      <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>
        {row.contact ?? "—"}<br/>
        {row.email ?? ""}
      </div>
    )},
    {
      key: "children",
      label: "Children",
      render: (row) =>
        row.children.length === 0 ? (
          <span className={styles.noChildren}>No children linked</span>
        ) : (
          <div className={styles.childChips} style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.4rem" }}>
            {row.children.map((link) => (
              <Badge key={link.id} tone="primary">
                {link.student.name}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: "classRoll",
      label: "Class / Roll",
      render: (row) =>
        row.children.length === 0 ? (
          <span className={styles.noChildren}>—</span>
        ) : (
          <div className={styles.childChips} style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.4rem" }}>
            {row.children.map((link) => (
              <div key={link.id} style={{ fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>
                {link.student.classSection ? `${link.student.classSection.className} - ${link.student.classSection.section}` : "N/A"} (Roll {link.student.rollNo})
              </div>
            ))}
          </div>
        ),
    },
    {
      key: "due",
      label: "Family Due",
      render: (row) => (
        <Badge tone={row.familyTotalDue && row.familyTotalDue > 0 ? "danger" : "success"}>
          ₹{(row.familyTotalDue || 0).toLocaleString()}
        </Badge>
      ),
    },
    {
      key: "actions",
      label: "",
      render: (row) => (
        <Button size="sm" variant="outline" onClick={() => navigate(`/admin/parents/${row.id}`)}>
          View Profile
        </Button>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Parents"
        subtitle="Manage parent/guardian accounts and the children linked to each"
        actions={
          <Button icon={<Icon name="plus" size={16} />} onClick={() => setShowNewParent(true)}>
            New parent
          </Button>
        }
      />

      <div className={styles.controls}>
        <Input 
          placeholder="Search by name, phone, class, or roll..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ maxWidth: 300 }}
        />
      </div>

      {isLoading ? (
        <Spinner />
      ) : !parents || parents.length === 0 ? (
        <EmptyState
          title="No families yet"
          description="Create a parent account and link children to start managing families."
          action={
            <Button icon={<Icon name="plus" size={16} />} onClick={() => setShowNewParent(true)}>
              New parent
            </Button>
          }
        />
      ) : (
        <Table columns={columns} data={filteredParents} keyField="id" emptyMessage="No families match your search" />
      )}

      {showNewParent && <NewParentModal onClose={() => setShowNewParent(false)} />}
    </div>
  );
};

export default ParentsPage;
