import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Input,
  Modal,
  Select,
  Spinner,
  Table,
} from "../../../../components/ui";

import { useGetStudentsQuery } from "../../../../store/api/students.api";

interface Village {
  id: number;
  name: string;
  monthlyFee: number;
  isActive: boolean;
  feeHistory: Array<{ id: number; monthlyFee: number; effectiveDate: string }>;
}

interface Assignment {
  id: number;
  studentId: number;
  student: { id: number; name: string; admissionNo: string; classSection: { className: string; section: string } };
  village: { name: string; monthlyFee: number };
  startDate: string;
  endDate?: string;
  status: "ACTIVE" | "DISCONTINUED";
  policy: "FULL_MONTH" | "PRORATED" | "NEXT_PERIOD";
}

export const AdminTransportVillagesSection = () => {
  const { data: studentsList } = useGetStudentsQuery();
  const [villages, setVillages] = useState<Village[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter States
  const [villageSearch, setVillageSearch] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
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
  const [assignStartDate, setAssignStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [assignPolicy, setAssignPolicy] = useState<"FULL_MONTH" | "PRORATED" | "NEXT_PERIOD">("FULL_MONTH");

  const [discontinueId, setDiscontinueId] = useState<number | null>(null);
  const [discontinueDate, setDiscontinueDate] = useState(new Date().toISOString().split("T")[0]);
  const [discontinueReason, setDiscontinueReason] = useState("");
  const [discontinuePolicy, setDiscontinuePolicy] = useState<"FULL_MONTH" | "PRORATED" | "NEXT_PERIOD">("NEXT_PERIOD");

  const [pendingDeleteVillage, setPendingDeleteVillage] = useState<Village | null>(null);
  const [isDeletingVillage, setIsDeletingVillage] = useState(false);

  const [pendingDeleteAssignment, setPendingDeleteAssignment] = useState<Assignment | null>(null);
  const [isDeletingAssignment, setIsDeletingAssignment] = useState(false);

  const token = localStorage.getItem("accessToken") || localStorage.getItem("token");

  const fetchVillages = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/transport/villages?includeInactive=true", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setVillages(json.data);
    } catch (err) {
      console.error("Failed to load villages", err);
    }
  };

  const fetchAssignments = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/transport/assignments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setAssignments(json.data);
    } catch (err) {
      console.error("Failed to load assignments", err);
    }
  };

  useEffect(() => {
    Promise.all([fetchVillages(), fetchAssignments()]).finally(() => setLoading(false));
  }, []);

  const handleCreateVillage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVillageName || !newVillageFee) return;
    try {
      const res = await fetch("http://localhost:5000/api/transport/villages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newVillageName, monthlyFee: parseFloat(newVillageFee) }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Village added");
        setShowAddVillage(false);
        setNewVillageName("");
        setNewVillageFee("");
        fetchVillages();
      } else {
        toast.error(json.message);
      }
    } catch (err) {
      toast.error("Failed to add village");
    }
  };

  const handleToggleStatus = async (id: number, currentActive: boolean) => {
    try {
      const res = await fetch(`http://localhost:5000/api/transport/villages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Village status updated`);
        fetchVillages();
      }
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  const handleDeleteVillage = async (id: number) => {
    setIsDeletingVillage(true);
    try {
      const res = await fetch(`http://localhost:5000/api/transport/villages/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success("Location deleted successfully");
        setPendingDeleteVillage(null);
        setVillages((prev) => prev.filter((v) => v.id !== id));
        fetchVillages();
      } else {
        toast.error(json.message || "Cannot delete location");
      }
    } catch (err) {
      toast.error("Failed to delete location");
    } finally {
      setIsDeletingVillage(false);
    }
  };

  const handleDeleteAssignment = async (id: number) => {
    setIsDeletingAssignment(true);
    try {
      const res = await fetch(`http://localhost:5000/api/transport/assignments/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success("Transport assignment deleted successfully");
        setPendingDeleteAssignment(null);
        setAssignments((prev) => prev.filter((a) => a.id !== id));
        fetchAssignments();
      } else {
        toast.error(json.message || "Cannot delete transport assignment");
      }
    } catch (err) {
      toast.error("Failed to delete transport assignment");
    } finally {
      setIsDeletingAssignment(false);
    }
  };

  const handleUpdateFee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editVillageId || !editFee) return;
    try {
      const res = await fetch(`http://localhost:5000/api/transport/villages/${editVillageId}/fee`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          monthlyFee: parseFloat(editFee),
          effectiveDate: editEffectiveDate || new Date().toISOString(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Village fee updated");
        setEditVillageId(null);
        fetchVillages();
      } else {
        toast.error(json.message);
      }
    } catch (err) {
      toast.error("Failed to update fee");
    }
  };

  const handleAssignTransport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignStudentId || !assignVillageId) return;
    try {
      const res = await fetch("http://localhost:5000/api/transport/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          studentId: parseInt(assignStudentId),
          villageId: parseInt(assignVillageId),
          startDate: assignStartDate,
          policy: assignPolicy,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Student transport assigned");
        setShowAssignModal(false);
        setAssignStudentId("");
        setAssignVillageId("");
        fetchAssignments();
      } else {
        toast.error(json.message);
      }
    } catch (err) {
      toast.error("Failed to assign transport");
    }
  };

  const handleDiscontinueTransport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!discontinueId) return;
    try {
      const res = await fetch("http://localhost:5000/api/transport/assignments/discontinue", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          assignmentId: discontinueId,
          discontinuedAt: discontinueDate,
          reason: discontinueReason,
          policy: discontinuePolicy,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Student transport discontinued");
        setDiscontinueId(null);
        fetchAssignments();
      } else {
        toast.error(json.message);
      }
    } catch (err) {
      toast.error("Failed to discontinue transport");
    }
  };

  // Filtered Villages List
  const filteredVillages = villages.filter((v) =>
    v.name.toLowerCase().includes(villageSearch.toLowerCase().trim())
  );

  // Filtered Assignments List
  const filteredAssignments = assignments.filter((a) => {
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
    const q = modalStudentSearch.toLowerCase().trim();
    const nameMatch = !q || s.name.toLowerCase().includes(q);
    const admMatch = !q || s.admissionNo.toLowerCase().includes(q);
    const rollMatch = !q || (s.rollNo && String(s.rollNo).toLowerCase().includes(q));

    const sClass = s.classSection ? `${s.classSection.className} - ${s.classSection.section}` : "";
    const classMatch = !modalClassFilter || sClass === modalClassFilter;

    return (nameMatch || admMatch || rollMatch) && classMatch;
  });

  if (loading) return <Spinner />;

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
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button variant="outline" onClick={() => setShowAddVillage(true)}>
            + Add Location
          </Button>
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
            { key: "name", label: "Location Name" },
            {
              key: "monthlyFee",
              label: "Monthly Fee",
              render: (row: Village) => `₹${Number(row.monthlyFee).toLocaleString("en-IN")}`,
            },
            {
              key: "feeHistory",
              label: "Fee Effective Date",
              render: (row: Village) =>
                row.feeHistory?.[0]?.effectiveDate
                  ? new Date(row.feeHistory[0].effectiveDate).toLocaleDateString("en-IN")
                  : "Original",
            },
            {
              key: "actions",
              label: "Actions",
              render: (row: Village) => (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditVillageId(row.id);
                      setEditFee(row.monthlyFee.toString());
                    }}
                  >
                    Edit Fee
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPendingDeleteVillage(row)}
                  >
                    Delete
                  </Button>
                </div>
              ),
            },
          ]}
          data={filteredVillages}
        />
      </Card>

      {/* Student Transport Assignments List */}
      <Card title="Assigned Transport Students Roster">
        <div style={{ marginBottom: "1rem", maxWidth: "420px" }}>
          <Input
            placeholder="Search assigned student by name, admission no, class, or location..."
            value={assignmentSearch}
            onChange={(e) => setAssignmentSearch(e.target.value)}
          />
        </div>
        <Table
          keyField="id"
          columns={[
            {
              key: "student",
              label: "Student",
              render: (row: Assignment) => `${row.student.name} (${row.student.admissionNo})`,
            },
            {
              key: "classSection",
              label: "Class",
              render: (row: Assignment) =>
                `${row.student.classSection.className} - ${row.student.classSection.section}`,
            },
            { key: "village", label: "Location", render: (row: Assignment) => row.village.name },
            {
              key: "monthlyFee",
              label: "Monthly Rate",
              render: (row: Assignment) => `₹${Number(row.village.monthlyFee).toLocaleString("en-IN")}`,
            },
            { key: "startDate", label: "Start Date", render: (row: Assignment) => new Date(row.startDate).toLocaleDateString("en-IN") },
            { key: "policy", label: "Policy" },
            {
              key: "actions",
              label: "Actions",
              render: (row: Assignment) => (
                <Button size="sm" variant="outline" onClick={() => setPendingDeleteAssignment(row)}>
                  Delete
                </Button>
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
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <Button variant="outline" type="button" onClick={() => setShowAddVillage(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
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
              hint="Historical charges remain unchanged; future charges on or after this date use the new fee."
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <Button variant="outline" type="button" onClick={() => setEditVillageId(null)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit">
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
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
              onChange={(e) => setAssignPolicy(e.target.value as any)}
              options={[
                { label: "Full month — Charge the full month", value: "FULL_MONTH" },
                { label: "Only the days used — Charge based on the number of days used", value: "PRORATED" },
                { label: "Stop from next month — Start charging from next month", value: "NEXT_PERIOD" },
              ]}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <Button variant="outline" type="button" onClick={() => setShowAssignModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={!assignStudentId || !assignVillageId}>
                Confirm Transport Assignment
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Discontinue Modal */}
      {discontinueId !== null && (
        <Modal title="Discontinue Student Transport" onClose={() => setDiscontinueId(null)}>
          <form onSubmit={handleDiscontinueTransport} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Input
              label="Discontinuation Date *"
              type="date"
              required
              value={discontinueDate}
              onChange={(e) => setDiscontinueDate(e.target.value)}
            />
            <Input
              label="Reason for Discontinuation"
              type="text"
              placeholder="e.g. Moved closer to school"
              value={discontinueReason}
              onChange={(e) => setDiscontinueReason(e.target.value)}
            />
            <Select
              label="Current Month Fee Policy"
              value={discontinuePolicy}
              onChange={(e) => setDiscontinuePolicy(e.target.value as any)}
              options={[
                { label: "Charge full current month", value: "FULL_MONTH" },
                { label: "Prorate current month up to end date", value: "PRORATED" },
                { label: "No charge starting next month", value: "NEXT_PERIOD" },
              ]}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
              <Button variant="outline" type="button" onClick={() => setDiscontinueId(null)}>
                Cancel
              </Button>
              <Button variant="outline" type="submit">
                Confirm Discontinuation
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Location Confirmation Dialog */}
      {pendingDeleteVillage && (
        <ConfirmDialog
          title="Delete Location"
          message={`Are you sure you want to delete "${pendingDeleteVillage.name}"?`}
          confirmLabel="Delete Location"
          tone="primary"
          isLoading={isDeletingVillage}
          onCancel={() => setPendingDeleteVillage(null)}
          onConfirm={() => handleDeleteVillage(pendingDeleteVillage.id)}
        />
      )}

      {/* Delete Assignment Confirmation Dialog */}
      {pendingDeleteAssignment && (
        <ConfirmDialog
          title="Delete Transport Assignment"
          message={`Are you sure you want to delete the transport assignment for ${pendingDeleteAssignment.student.name}?`}
          confirmLabel="Delete Assignment"
          tone="primary"
          isLoading={isDeletingAssignment}
          onCancel={() => setPendingDeleteAssignment(null)}
          onConfirm={() => handleDeleteAssignment(pendingDeleteAssignment.id)}
        />
      )}
    </div>
  );
};
