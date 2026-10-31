import { useState } from "react";
import { toast } from "react-toastify";
import { Button, Input, Modal, Select } from "../../../../components/ui";
import { useCreateClassTestMutation } from "../../../../store/api/examPlan.api";

// Subject teacher: a quick class test for one of their subjects (weekly quiz, chapter test).
// It only tracks progress: it never counts in the term result, and students see the marks
// as soon as they're saved.
const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

const NewClassTestSheet = ({
  classSection,
  subjects,
  onClose,
  onCreated,
}: {
  classSection: { id: number; label: string };
  subjects: { id: number; name: string }[];
  onClose: () => void;
  onCreated: (exam: IExam, subjectId: number) => void;
}) => {
  const [subjectId, setSubjectId] = useState(String(subjects[0]?.id ?? ""));
  const [name, setName] = useState("");
  const [maxMarks, setMaxMarks] = useState("20");
  const [testDate, setTestDate] = useState(today);
  const [create, { isLoading }] = useCreateClassTestMutation();

  const submit = async () => {
    try {
      const exam = await create({ classSectionId: classSection.id, subjectId: Number(subjectId), name: name.trim(), maxMarks: Number(maxMarks), testDate }).unwrap();
      toast.success("Class test created. Enter the marks now or later.");
      onCreated(exam, Number(subjectId));
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't create the test");
    }
  };

  return (
    <Modal title={`New class test · ${classSection.label}`} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        <p style={{ margin: 0, fontSize: "0.86rem", color: "var(--erp-text-muted)" }}>
          For tracking progress only: it doesn&apos;t count in the term result, and students see their marks as soon as you save them.
        </p>
        {subjects.length > 1 && <Select label="Subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} options={subjects.map((s) => ({ label: s.name, value: String(s.id) }))} />}
        <Input label="Test name" value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${subjects.find((s) => String(s.id) === subjectId)?.name ?? "Chapter"} quiz 3`} />
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Input label="Max marks" type="number" min={1} value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} />
          <Input label="Date" type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} isLoading={isLoading} disabled={name.trim().length < 2 || !subjectId}>
            Create test
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default NewClassTestSheet;
