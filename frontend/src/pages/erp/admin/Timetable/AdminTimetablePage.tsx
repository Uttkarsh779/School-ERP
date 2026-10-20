import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import {
  Button,
  Card,
  EmptyState,
  FormGrid,
  FormSection,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
} from "../../../../components/ui";
import TimetableGrid from "../../../../components/shared/TimetableGrid/TimetableGrid";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetStaffListQuery } from "../../../../store/api/staff.api";
import {
  useAssignSubjectTeacherMutation,
  useCreateSubjectMutation,
  useGetSubjectsQuery,
} from "../../../../store/api/subjects.api";
import { useGetClassTimetableQuery, useUpsertTimetableSlotMutation } from "../../../../store/api/timetable.api";
import styles from "./AdminTimetablePage.module.css";

interface SlotFormValues {
  subjectId: string;
  staffId: string;
  room: string;
}

const getErrorMessage = (err: unknown, fallback: string): string => {
  if (err && typeof err === "object") {
    if ("data" in err && err.data && typeof err.data === "object" && "message" in err.data) {
      return String((err.data as { message: string }).message);
    }
    if ("message" in err) return String((err as { message: string }).message);
  }
  return fallback;
};

const AdminTimetablePage = () => {
  const [classSectionId, setClassSectionId] = useState<string>("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [editingCell, setEditingCell] = useState<{ day: number; period: number; slot?: ITimetableSlot } | null>(null);

  const { register, handleSubmit, reset } = useForm<SlotFormValues>();

  const { data: classSections, isLoading: isLoadingSections } = useGetClassSectionsQuery();
  const { data: staffList } = useGetStaffListQuery();

  const csId = classSectionId ? Number(classSectionId) : 0;

  const { data: slots, isLoading: isLoadingSlots } = useGetClassTimetableQuery(
    { classSectionId: csId },
    { skip: !csId }
  );

  const { data: subjects, isLoading: isLoadingSubjects } = useGetSubjectsQuery(
    { classSectionId: csId },
    { skip: !csId }
  );

  const [upsertSlot, { isLoading: isSavingSlot }] = useUpsertTimetableSlotMutation();
  const [createSubject, { isLoading: isCreatingSubject }] = useCreateSubjectMutation();
  const [assignTeacher] = useAssignSubjectTeacherMutation();

  const classSectionOptions =
    classSections?.map((cs) => ({
      value: String(cs.id),
      label: `${cs.className} - ${cs.section}`,
    })) ?? [];

  const staffOptions = [
    { value: "", label: "No teacher" },
    ...(staffList?.map((s) => ({
      value: String(s.id),
      label: s.user.name,
    })) ?? []),
  ];

  const subjectOptions = [
    { value: "", label: "No subject" },
    ...(subjects?.map((sub) => ({
      value: String(sub.id),
      label: sub.name,
    })) ?? []),
  ];

  const handleAddSubject = async () => {
    if (!csId || !newSubjectName.trim()) return;
    try {
      await createSubject({ classSectionId: csId, name: newSubjectName.trim() }).unwrap();
      toast.success("Subject added!");
      setNewSubjectName("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to add subject"));
    }
  };

  const handleAssignTeacher = async (subjectId: number, staffIdVal: string) => {
    try {
      await assignTeacher({
        subjectId,
        staffId: Number(staffIdVal),
      }).unwrap();
      toast.success("Teacher assigned to subject!");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to assign teacher"));
    }
  };

  const openCellEditor = (day: number, period: number, slot?: ITimetableSlot) => {
    setEditingCell({ day, period, slot });
    reset({
      subjectId: slot?.subjectId ? String(slot.subjectId) : "",
      staffId: slot?.staffId ? String(slot.staffId) : "",
      room: slot?.room || "",
    });
  };

  const onSubmitSlot = async (data: SlotFormValues) => {
    if (!editingCell || !csId) return;

    try {
      const saved = await upsertSlot({
        classSectionId: csId,
        dayOfWeek: editingCell.day,
        periodNumber: editingCell.period,
        subjectId: data.subjectId ? Number(data.subjectId) : null,
        staffId: data.staffId ? Number(data.staffId) : null,
        room: data.room || null,
      }).unwrap();

      toast.success("Timetable updated");
      if (saved.warning) toast.warn(saved.warning, { autoClose: 9000 });
      setEditingCell(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update timetable"));
    }
  };

  return (
    <div>
      <PageHeader title="Class Weekly Timetable" subtitle="Manage and assign weekly periods for each class section" />

      <Card title="Class Schedule Management">
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap", marginBottom: "1.5rem" }}>
          <div style={{ flex: 1, minWidth: "260px", maxWidth: "380px" }}>
            <Select
              label="Select Class Section"
              options={classSectionOptions}
              placeholder={isLoadingSections ? "Loading classes..." : "Select Class Section..."}
              value={classSectionId}
              onChange={(e) => setClassSectionId(e.target.value)}
            />
          </div>
          {classSections && classSections.length > 0 && (
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--erp-text-muted)", marginRight: "0.25rem" }}>Quick Select:</span>
              {classSections.slice(0, 6).map((cs) => (
                <Button
                  key={cs.id}
                  size="sm"
                  variant={classSectionId === String(cs.id) ? "primary" : "outline"}
                  onClick={() => setClassSectionId(String(cs.id))}
                >
                  {cs.className}-{cs.section}
                </Button>
              ))}
            </div>
          )}
        </div>

        {!csId ? (
          <EmptyState
            title="No Class Section Selected"
            description="Choose a class section from the dropdown or quick select buttons above to load its weekly timetable."
          />
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "1.75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
              <div style={{ width: "280px", flexShrink: 0, marginRight: "0.5rem" }}>
                <Input
                  label="Add a subject to this class"
                  placeholder="e.g. Mathematics"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                />
              </div>
              <Button
                variant="primary"
                onClick={handleAddSubject}
                isLoading={isCreatingSubject}
                disabled={!newSubjectName.trim()}
                style={{ flexShrink: 0, height: "42px" }}
              >
                + Add Subject
              </Button>
            </div>

            {!isLoadingSubjects && subjects && subjects.length > 0 && (
              <div className={styles.subjectChips}>
                {subjects.map((s) => {
                  const assigned = s.teacherSubjects?.[0]?.staff;
                  return (
                    <div key={s.id} className={styles.subjectAssignRow}>
                      <span className={styles.chip}>{s.name}</span>
                      <Select
                        key={`${s.id}-${assigned?.id ?? "none"}`}
                        options={staffOptions}
                        placeholder="Unassigned"
                        defaultValue={assigned?.id ?? ""}
                        onChange={(e) => handleAssignTeacher(s.id, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {isLoadingSlots ? (
              <Spinner />
            ) : (
              <TimetableGrid slots={slots ?? []} editable onCellClick={openCellEditor} />
            )}
          </>
        )}
      </Card>

      {editingCell && (
        <Modal
          title={`Period ${editingCell.period} — ${
            ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][editingCell.day]
          }`}
          onClose={() => setEditingCell(null)}
        >
          <form onSubmit={handleSubmit(onSubmitSlot)}>
            <FormSection title="Slot Details">
              <FormGrid>
                <Select
                  label="Subject"
                  placeholder="No subject"
                  options={subjectOptions}
                  {...register("subjectId")}
                />
                <Select
                  label="Teacher"
                  placeholder="No teacher"
                  options={staffOptions}
                  {...register("staffId")}
                />
                <Input label="Room" placeholder="Optional" style={{ gridColumn: "1 / -1" }} {...register("room")} />
              </FormGrid>
            </FormSection>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "0.6rem" }}>
              <Button type="button" variant="ghost" onClick={() => setEditingCell(null)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSavingSlot}>
                Save
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default AdminTimetablePage;
