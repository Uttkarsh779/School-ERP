import { useRef, useState, type ChangeEvent } from "react";
import { toast } from "react-toastify";
import { Card, Badge } from "../../../../components/ui";
import { useBulkImportStudentsMutation } from "../../../../store/api/students.api";
import styles from "./StudentsPage.module.css";

const BulkImportPanel = () => {
  const [bulkImportStudents, { isLoading }] = useBulkImportStudentsMutation();
  const [results, setResults] = useState<IBulkImportRowResult[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const rows = await bulkImportStudents(file).unwrap();
      setResults(rows);
      const failedCount = rows.filter((row) => !row.success).length;
      if (failedCount === 0) {
        toast.success(`Imported ${rows.length} student${rows.length === 1 ? "" : "s"} successfully.`);
      } else {
        toast.error(`${failedCount} of ${rows.length} row${rows.length === 1 ? "" : "s"} failed — see details below.`);
      }
    } catch {
      toast.error("Bulk import failed. Please check the file and try again.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Card title="Bulk Import (CSV)" subtitle="Upload a CSV to create many students at once.">
      <p className={styles.bulkImportHint}>
        Required columns: <strong>name, rollNo, className, section, admissionNo</strong>. Optional columns: dob,
        gender, bloodGroup, fatherName, fatherContact, motherName, motherContact, aadharNumber, apaarId, category,
        address, contactNumber, nationality, previousSchool, admissionDate.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        disabled={isLoading}
        className={styles.fileInput}
        aria-label="Upload CSV file"
      />

      {isLoading && <p className={styles.bulkImportHint}>Importing, please wait…</p>}

      {results && (
        <div className={styles.resultsList}>
          {results.map((row) => (
            <div key={row.row} className={styles.resultRow}>
              <Badge tone={row.success ? "success" : "danger"}>Row {row.row}</Badge>
              <span>{row.message}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export default BulkImportPanel;
