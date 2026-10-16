import React, { useState } from "react";
import { toast } from "react-toastify";
import { Modal, Button, Select, Input } from "../../../../components/ui";
import { useGetStudentsQuery } from "../../../../store/api/students.api";
import { useLinkChildToParentMutation } from "../../../../store/api/parents.api";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";

interface LinkChildModalProps {
  parentId: number;
  onClose: () => void;
}

const LinkChildModal = ({ parentId, onClose }: LinkChildModalProps) => {
  const { data: students, isLoading } = useGetStudentsQuery();
  const { data: classSections } = useGetClassSectionsQuery();
  const [linkChild, { isLoading: isLinking }] = useLinkChildToParentMutation();
  const [selectedStudentId, setSelectedStudentId] = useState<number | "">("");
  const [searchQuery, setSearchQuery] = useState("");
  const [classFilter, setClassFilter] = useState<number | "">("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentId) {
      toast.error("Please select a student to link");
      return;
    }

    try {
      await linkChild({ parentId, studentId: Number(selectedStudentId) }).unwrap();
      toast.success("Student successfully linked to family!");
      onClose();
    } catch (err: any) {
      toast.error(err.data?.message || "Failed to link student");
    }
  };

  const filteredStudents = students?.filter(s => {
    const term = searchQuery.toLowerCase();
    const className = s.classSection?.className || "";
    const sectionName = s.classSection?.section || "";
    const matchesSearch = s.name.toLowerCase().includes(term) || 
           s.rollNo?.toLowerCase().includes(term) || 
           className.toLowerCase().includes(term) ||
           sectionName.toLowerCase().includes(term);
    const matchesClass = classFilter ? s.classSectionId === classFilter : true;
    return matchesSearch && matchesClass;
  }) || [];

  const studentOptions = filteredStudents.map((s) => ({
    label: `${s.name} (Roll: ${s.rollNo}) - Class ${s.classSection?.className || "N/A"} ${s.classSection?.section || ""}`,
    value: s.id,
  }));

  return (
    <Modal title="Link Student to Family" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        
        <div style={{ display: "flex", gap: "1rem" }}>
          <div style={{ flex: 1 }}>
            <Input 
              label="Search Student" 
              placeholder="Search by name, roll no, or class..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <Select
              label="Filter by Class"
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value ? Number(e.target.value) : "")}
              options={[
                { label: "All Classes", value: "" },
                ...(classSections?.map(c => ({ label: `${c.className} - ${c.section}`, value: c.id })) || [])
              ]}
            />
          </div>
        </div>

        <Select
          label="Select Student"
          value={selectedStudentId}
          onChange={(e) => setSelectedStudentId(Number(e.target.value))}
          options={[{ label: "Select a student...", value: "" }, ...studentOptions]}
          disabled={isLoading}
          required
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--erp-border)" }}>
          <Button variant="outline" type="button" onClick={onClose} disabled={isLinking}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLinking || !selectedStudentId}>
            {isLinking ? "Linking..." : "Link Student"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default LinkChildModal;
