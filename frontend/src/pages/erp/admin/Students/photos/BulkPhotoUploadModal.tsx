import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, Modal } from "../../../../../components/ui";
import { useUploadFileMutation } from "../../../../../store/api/upload.api";
import { useGetStudentsQuery, useSetStudentPhotoMutation } from "../../../../../store/api/students.api";
import styles from "./StudentPhotos.module.css";

const SIZE = 512;

// Centre-crops a photo to a 512×512 JPEG (~50 KB) — the same size as the single-photo cropper.
const squareJpeg = (file: File) =>
  new Promise<Blob>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      // Portraits: keep the top part, where the face usually is.
      const sx = (img.naturalWidth - side) / 2;
      const sy = img.naturalHeight > img.naturalWidth ? Math.min((img.naturalHeight - side) / 2, img.naturalHeight * 0.1) : 0;
      const c = document.createElement("canvas");
      c.width = SIZE;
      c.height = SIZE;
      c.getContext("2d")!.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read the image"))), "image/jpeg", 0.88);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Not a readable image"));
    };
    img.src = url;
  });

const stem = (name: string) => name.replace(/\.[^.]+$/, "").trim().toLowerCase();

type Row = { file: File; studentId: number | null; studentName?: string; hasPhoto?: boolean; status: "waiting" | "done" | "failed"; error?: string };

// Many photos at once, e.g. after a class photo session: each file is named with the
// student's admission number (ADM2021001.jpg) and matched automatically.
const BulkPhotoUploadModal = ({ onClose }: { onClose: () => void }) => {
  const { data: students = [], isLoading } = useGetStudentsQuery(undefined);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [upload] = useUploadFileMutation();
  const [setPhoto] = useSetStudentPhotoMutation();

  const byAdmission = useMemo(() => new Map(students.map((s) => [s.admissionNo.trim().toLowerCase(), s])), [students]);

  const pick = (files: FileList | null) => {
    if (!files) return;
    setRows(
      [...files].map((file) => {
        const s = byAdmission.get(stem(file.name));
        return { file, studentId: s?.id ?? null, studentName: s?.name, hasPhoto: Boolean(s?.photoUrl), status: "waiting" };
      })
    );
  };

  const matched = rows.filter((r) => r.studentId);
  const unmatched = rows.filter((r) => !r.studentId);
  const done = rows.filter((r) => r.status === "done").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  const start = async () => {
    setRunning(true);
    for (const r of matched) {
      if (r.status === "done") continue;
      try {
        const res = await upload({ file: await squareJpeg(r.file), folder: "school_erp/students" }).unwrap();
        await setPhoto({ id: r.studentId!, photoUrl: res.data.url }).unwrap();
        r.status = "done";
      } catch (e: any) {
        r.status = "failed";
        r.error = e?.data?.message ?? e?.message ?? "Failed";
      }
      setRows((prev) => [...prev]);
    }
    setRunning(false);
    toast.success("Photos uploaded");
  };

  return (
    <Modal title="Upload student photos" size="lg" onClose={running ? () => undefined : onClose}>
      <div className={styles.help}>
        <strong>Name each photo with the student's admission number</strong>, e.g. <code>ADM2021001.jpg</code>. Select all the photos at once; they're matched
        automatically, cropped to a square (centred, keeping the top for portraits) and saved small. Existing photos are replaced.
      </div>

      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={running || isLoading}
        onChange={(e) => pick(e.target.files)}
        className={styles.fileInput}
      />

      {rows.length > 0 && (
        <>
          <div className={styles.summary}>
            <span>
              <b>{matched.length}</b> matched
            </span>
            {unmatched.length > 0 && (
              <span className={styles.warn}>
                <b>{unmatched.length}</b> not matched
              </span>
            )}
            {matched.some((r) => r.hasPhoto) && (
              <span>
                <b>{matched.filter((r) => r.hasPhoto).length}</b> will replace an existing photo
              </span>
            )}
            {(done > 0 || failed > 0) && (
              <span>
                <b>{done}</b> saved{failed ? ` · ${failed} failed` : ""}
              </span>
            )}
          </div>
          <ul className={styles.rows}>
            {rows.map((r, i) => (
              <li key={i} className={styles.row}>
                <span className={styles.fileName}>{r.file.name}</span>
                <span className={styles.match}>{r.studentName ?? <span className={styles.warn}>No student with this admission number</span>}</span>
                <span className={r.status === "done" ? styles.ok : r.status === "failed" ? styles.warn : styles.muted}>
                  {r.status === "done" ? "Saved" : r.status === "failed" ? r.error : r.studentId ? "Ready" : "Skipped"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className={styles.actions}>
        <Button variant="outline" disabled={running} onClick={onClose}>
          {done ? "Done" : "Cancel"}
        </Button>
        <Button isLoading={running} disabled={matched.length === 0 || done + failed === matched.length} onClick={start}>
          Upload {matched.length} photo{matched.length === 1 ? "" : "s"}
        </Button>
      </div>
    </Modal>
  );
};

export default BulkPhotoUploadModal;
