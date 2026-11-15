import { useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, Select, Spinner, Table } from "../../../../components/ui";

import { useGetStudentsQuery } from "../../../../store/api/students.api";
import {
  useAssignStudentVillageMutation,
  useCreateVillageMutation,
  useDeleteTransportAssignmentMutation,
  useDeleteVillageMutation,
  useGetTransportAssignmentsQuery,
  useGetVillagesQuery,
  useSetVillageStatusMutation,
  useUpdateVillageFeeMutation,
  type TransportAssignment,
  type TransportVillage,
} from "../../../../store/api/transport.api";
import { useCan } from "../../../../store/permissions";
import EndTransportModal from "../Students/EndTransportModal";

const getErrorMessage = (err: unknown, fallback: string): string =>
  (err && typeof err === "object" && "data" in err ? (err as { data?: { message?: string } }).data?.message : undefined) || fallback;
// Today in India, whatever the browser's clock zone.
const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const POLICY_LABEL = { FULL_MONTH: "Full month", PRORATED: "Days used", NEXT_PERIOD: "From next month" };

export const AdminTransportVillagesSection = () => {
  const can = useCan();
  // Locations and their fees are money rules: Super Admin only (same rule as the server).
  const canManageLocations = can("fees.configure");
  const { data: studentsList } = useGetStudentsQuery();
  const { data: villagesData, isLoading: loadingVillages, isError: villagesError, refetch: refetchVillages } = useGetVillagesQuery({ includeInactive: true });
  const { data: assignmentsData, isLoading: loadingAssignments, isError: assignmentsError, refetch: refetchAssignments } = useGetTransportAssignmentsQuery();
  const villages = villagesData ?? [];
  const assignments = assignmentsData ?? [];
  const [createVillage, { isLoading: isCreating }] = useCreateVillageMutation();
  const [updateFee, { isLoading: isUpdatingFee }] = useUpdateVillageFeeMutation();
  const [setVillageStatus] = useSetVillageStatusMutation();
  const [deleteVillage, { isLoading: isDeletingVillage }] = useDeleteVillageMutation();
  const [assignVillage, { isLoading: isAssigning }] = useAssignStudentVillageMutation();
  const [deleteAssignment, { isLoading: isDeletingAssignment }] = useDeleteTransportAssignmentMutation();

  // Search & Filter States
  const [villageSearch, setVillageSearch] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [showEnded, setShowEnded] = useState(false);
  const [modalStudentSearch, setModalStudentSearch] = useState("");
  const [modalClassFilter, setModalClassFilter] = useState("");

  // Modals / Form states
  const [showAddVillage, setShowAddVillage] = useState(false);
  const [newVillageName, setNewVillageName] = useState("");
  const [newVillageFee, setNewVillageFee] = useState("");

  const [editVillageId, setEditVillageId] = useState<number | null>(null);
  const [editFee, setEditFee] = useState("");
  const [editEffectiveDate, setEditEffectiveDate] = useState("");

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignStudentId, setAssignStudentId] = useState("");
  const [assignVillageId, setAssignVillageId] = useState("");
  const [assignStartDate, setAssignStartDate] = useState(todayIst());
  const [assignPolicy, setAssignPolicy] = useState<"FULL_MONTH" | "PRORATED" | "NEXT_PERIOD">("FULL_MONTH");

  const [endingFor, setEndingFor] = useState<TransportAssignment | null>(null);
  const [pendingDeleteVillage, setPendingDeleteVillage] = useState<TransportVillage | null>(null);
  const [pendingDeleteAssignment, setPendingDeleteAssignment] = useState<TransportAssignment | null>(null);

  const handleCreateVillage = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createVillage({ name: newVillageName, monthlyFee: Number(newVillageFee) }).unwrap();
      toast.success("Location added");
      setShowAddVillage(false);
      setNewVillageName("");
      setNewVillageFee("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to add the location"));
    }
  };

  const handleToggleStatus = async (village: TransportVillage) => {
    try {
      await setVillageStatus({ id: village.id, isActive: !village.isActive }).unwrap();
      toast.success(village.isActive ? "Location made inactive" : "Location made active");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update the status"));
    }
  };

  const handleDeleteVillage = async (id: number) => {
    try {
      await deleteVillage(id).unwrap();
      toast.success("Location deleted");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete the location"));
    }
    setPendingDeleteVillage(null);
  };

  const handleDeleteAssignment = async (id: number) => {
    try {
      await deleteAssignment(id).unwrap();
      toast.success("Transport assignment deleted");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to delete the transport assignment"));
    }
    setPendingDeleteAssignment(null);
  };

  const handleUpdateFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editVillageId) return;
    try {
      await updateFee({ id: editVillageId, monthlyFee: Number(editFee), effectiveDate: editEffectiveDate || undefined }).unwrap();
      toast.success("Location fee updated");
      setEditVillageId(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update the fee"));
    }
  };

  const handleAssignTransport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignStudentId || !assignVillageId) return;
    try {
      await assignVillage({ studentId: Number(assignStudentId), villageId: Number(assignVillageId), startDate: assignStartDate, policy: assignPolicy }).unwrap();
      toast.success("Student transport assigned");
      setShowAssignModal(false);
      setAssignStudentId("");
      setAssignVillageId("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to assign transport"));
    }
  };

  // Filtered Villages List
  const filteredVillages = villages.filter((v) =>
    v.name.toLowerCase().includes(villageSearch.toLowerCase().trim())
  );

  // Filtered Assignments List
  const filteredAssignments = assignments.filter((a) => {
    if (!showEnded && a.status !== "ACTIVE") return false;
    const q = assignmentSearch.toLowerCase().trim();
    if (!q) return true;
    const nameMatch = a.student?.name?.toLowerCase().includes(q);
    const admMatch = a.student?.admissionNo?.toLowerCase().includes(q);
    const villageMatch = a.village?.name?.toLowerCase().includes(q);
    const classMatch = `${a.student?.classSection?.className || ""} - ${a.student?.classSection?.section || ""}`
      .toLowerCase()
      .includes(q);
    return nameMatch || admMatch || villageMatch || classMatch;
  });

  // Unique Classes for Modal Filter
  const availableClasses = Array.from(
    new Set(
      (studentsList || [])
        .map((s) => (s.classSection ? `${s.classSection.className} - ${s.classSection.section}` : null))
        .filter(Boolean) as string[]
    )
  ).sort();

  // Filtered Students for Modal
  const filteredModalStudents = (studentsList || []).filter((s) => {
    if (s.isActive === false) return false;
    const q = modalStudentSearch.toLowerCase().trim();
    const nameMatch = !q || s.name.toLowerCase().includes(q);
    const admMatch = !q || s.admissionNo.toLowerCase().includes(q);
    const rollMatch = !q || (s.rollNo && String(s.rollNo).toLowerCase().includes(q));

    const sClass = s.classSection ? `${s.classSection.className} - ${s.classSection.section}` : "";
    const classMatch = !modalClassFilter || sClass === modalClassFilter;

    return (nameMatch || admMatch || rollMatch) && classMatch;
  });

  if (loadingVillages || loadingAssignments) return <Spinner />;
  if (villagesError || assignmentsError) {
    return (
      <EmptyState
        title="Couldn't load transport"
        description="Check your connection and try again."
        action={
          <Button
            variant="outline"
            onClick={() => {
              refetchVillages();
              refetchAssignments();
            }}
          >
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--erp-text)", margin: 0 }}>
            Transport Locations & Student Assignments
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--erp-text-muted)", margin: "4px 0 0 0" }}>
            Configure transport location rate masters and per-student assignments
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
          {canManageLocations && (
            <Button variant="outline" onClick={() => setShowAddVillage(true)}>
              + Add Location
            </Button>
          )}
          <Button variant="primary" onClick={() => setShowAssignModal(true)}>
            + Assign Student Transport
          </Button>
        </div>
      </div>

      {/* Locations Table */}
      <Card title="Transport Locations Master List">
        <div style={{ marginBottom: "1rem", maxWidth: "320px" }}>
          <Input
            placeholder="Search location by name..."
            value={villageSearch}
            onChange={(e) => setVillageSearch(e.target.value)}
          />
        </div>
        <Table
          keyField="id"
          columns={[
            {
              key: "name",
              label: "Location Name",
              render: (row: TransportVillage) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                  {row.name}
                  {!row.isActive && <Badge tone="neutral">Inactive</Badge>}
                </span>
              ),
            },
            {
              key: "monthlyFee",
              label: "Monthly Fee",
              render: (row: TransportVillage) => `₹${Number(row.monthlyFee).toLocaleString("en-IN")}`,
            },
            {
              key: "feeHistory",
              label: "Fee Effective Date",
              render: (row: TransportVillage) =>
                row.feeHistory?.[0]?.effectiveDate
                  ? new Date(row.feeHistory[0].effectiveDate).toLocaleDateString("en-IN")
                  : "Original",
            },
            ...(canManageLocations
              ? [
                  {
                    key: "actions",
                    label: "Actions",
                    render: (row: TransportVillage) => (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditVillageId(row.id);
                            setEditFee(row.monthlyFee.toString());
                            setEditEffectiveDate("");
                          }}
                        >
                          Edit Fee
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleToggleStatus(row)}>
                          {row.isActive ? "Make inactive" : "Make active"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setPendingDeleteVillage(row)}>
                          Delete
                        </Button>
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
          data={filteredVillages}
        />
      </Card>

      {/* Student Transport Assignments List */}
      <Card title="Assigned Transport Students Roster">
        <div style={{ marginBottom: "1rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem 1rem" }}>
          <div style={{ flex: "1 1 18rem", maxWidth: "420px" }}>
            <Input
              placeholder="Search assigned student by name, admission no, class, or location..."
              value={assignmentSearch}
              onChange={(e) => setAssignmentSearch(e.target.value)}
            />
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.86rem", color: "var(--erp-text-muted)" }}>
            <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />
            Show ended transport
          </label>
        </div>
        <Table
          keyField="id"
          columns={[
            {
              key: "student",
              label: "Student",
              render: (row: TransportAssignment) => `${row.student.name} (${row.student.admissionNo})`,
            },
            {
              key: "classSection",
              label: "Class",
              render: (row: TransportAssignment) =>
                `${row.student.classSection.className} - ${row.student.classSection.section}`,
            },
            { key: "village", label: "Location", render: (row: TransportAssignment) => row.village.name },
            {
              key: "monthlyFee",
              label: "Monthly Rate",
              render: (row: TransportAssignment) => `₹${Number(row.village.monthlyFee).toLocaleString("en-IN")}`,
            },
            {
              key: "status",
              label: "Status",
              render: (row: TransportAssignment) =>
                row.status === "ACTIVE" ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">{row.endDate ? `Ended ${new Date(row.endDate).toLocaleDateString("en-IN")}` : "Ended"}</Badge>,
            },
            { key: "startDate", label: "Start Date", render: (row: TransportAssignment) => new Date(row.startDate).toLocaleDateString("en-IN") },
            { key: "policy", label: "First month", render: (row: TransportAssignment) => POLICY_LABEL[row.policy] },
            {
              key: "actions",
              label: "Actions",
              render: (row: TransportAssignment) => (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {row.status === "ACTIVE" && (
                    <Button size="sm" variant="outline" onClick={() => setEndingFor(row)}>
                      End transport
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setPendingDeleteAssignment(row)}>
                    Delete
                  </Button>
                </div>
              ),
            },
          ]}
          data={filteredAssignments}
        />
      </Card>

      {/* Add Location Modal */}
      {showAddVillage && (
        <Modal title="Add Transport Location" onClose={() => setShowAddVillage(false)}>
          <form onSubmit={handleCreateVillage} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Input
              label="Location Name *"
              type="text"
              required
              value={newVillageName}
              onChange={(e) => setNewVillageName(e.target.value)}
              placeholder="e.g. Sector 14 / Rampur"
            />
            <Input
              label="Monthly Fee (₹) *"
              type="number"
              required
              value={newVillageFee}
              onChange={(e) => setNewVillageFee(e.target.value)}
              placeholder="e.g. 1200"
            />
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <Button variant="outline" type="button" onClick={() => setShowAddVillage(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" isLoading={isCreating}>
                Save Location
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Fee Modal */}
      {editVillageId !== null && (
        <Modal title="Update Location Fee" onClose={() => setEditVillageId(null)}>
          <form onSubmit={handleUpdateFee} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Input
              label="New Monthly Fee (₹) *"
              type="number"
              required
              value={editFee}
              onChange={(e) => setEditFee(e.target.value)}
            />
            <Input
              label="Effective Date"
              type="date"
              value={editEffectiveDate}
              onChange={(e) => setEditEffectiveDate(e.target.value)}
              hint="Bills already made don't change. Leave empty to start today; a later date starts the new fee from then."
            />
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <Button variant="outline" type="button" onClick={() => setEditVillageId(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" isLoading={isUpdatingFee}>
                Update Fee Rate
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Assign Student Modal */}
      {showAssignModal && (
        <Modal title="Assign Student Transport" onClose={() => setShowAssignModal(false)}>
          <form onSubmit={handleAssignTransport} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* RICH STUDENT SEARCH & CLASS FILTER CONTROL BAR */}
            <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "8px", padding: "0.85rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#1e293b" }}>Search & Filter Students:</div>
              <div className="erp-stack-sm" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <Input
                  label="Search Name / Admission / Roll No"
                  placeholder="e.g. Rahul, ADM2026001, 801"
                  value={modalStudentSearch}
                  onChange={(e) => setModalStudentSearch(e.target.value)}
                />
                <Select
                  label="Filter by Class"
                  value={modalClassFilter}
                  onChange={(e) => setModalClassFilter(e.target.value)}
                  options={[
                    { label: "All Classes", value: "" },
                    ...availableClasses.map((cls) => ({ label: cls, value: cls })),
                  ]}
                  placeholder="All Classes"
                />
              </div>
            </div>

            <Select
              label={`Select Student (${filteredModalStudents.length} matching) *`}
              required
              value={assignStudentId}
              onChange={(e) => setAssignStudentId(e.target.value)}
              options={filteredModalStudents.map((s) => ({
                label: `${s.name} (Adm: ${s.admissionNo} · Roll: ${s.rollNo || "N/A"} · ${s.classSection ? `${s.classSection.className}-${s.classSection.section}` : "No Class"})`,
                value: String(s.id),
              }))}
              placeholder="Select a student..."
            />
            <Select
              label="Select Transport Location *"
              required
              value={assignVillageId}
              onChange={(e) => setAssignVillageId(e.target.value)}
              options={villages.filter((v) => v.isActive).map((v) => ({ label: `${v.name} (₹${v.monthlyFee}/mo)`, value: String(v.id) }))}
              placeholder="Select a location..."
            />
            <Input
              label="Start Date *"
              type="date"
              required
              value={assignStartDate}
              onChange={(e) => setAssignStartDate(e.target.value)}
            />
            <Select
              label="How should we charge the current month?"
              value={assignPolicy}
              onChange={(e) => setAssignPolicy(e.target.value as TransportAssignment["policy"])}
              options={[
                { label: "Full month — Charge the full month", value: "FULL_MONTH" },
                { label: "Only the days used — Charge based on the number of days used", value: "PRORATED" },
                { label: "From next month — No charge for the rest of this month", value: "NEXT_PERIOD" },
              ]}
            />
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <Button variant="outline" type="button" onClick={() => setShowAssignModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" isLoading={isAssigning} disabled={!assignStudentId || !assignVillageId}>
                Confirm Transport Assignment
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {endingFor && (
        <EndTransportModal studentId={endingFor.studentId} studentName={endingFor.student.name} currentLabel={endingFor.village.name} onClose={() => setEndingFor(null)} />
      )}

      {/* Delete Location Confirmation Dialog */}
      {pendingDeleteVillage && (
        <ConfirmDialog
          title="Delete Location"
          message={`Delete "${pendingDeleteVillage.name}"? This can't be undone. A location that students have used can't be deleted; make it inactive instead.`}
          confirmLabel="Delete Location"
          isLoading={isDeletingVillage}
          onCancel={() => setPendingDeleteVillage(null)}
          onConfirm={() => handleDeleteVillage(pendingDeleteVillage.id)}
        />
      )}

      {/* Delete Assignment Confirmation Dialog */}
      {pendingDeleteAssignment && (
        <ConfirmDialog
          title="Delete Transport Assignment"
          message={`Delete this assignment for ${pendingDeleteAssignment.student.name}? Use this only for a mistake. If the student has stopped using the bus, use End transport so their bills are corrected.`}
          confirmLabel="Delete Assignment"
          isLoading={isDeletingAssignment}
          onCancel={() => setPendingDeleteAssignment(null)}
          onConfirm={() => handleDeleteAssignment(pendingDeleteAssignment.id)}
        />
      )}
    </div>
  );
};
