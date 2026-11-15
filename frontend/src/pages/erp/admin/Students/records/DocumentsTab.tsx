import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Icon, Input, Modal, Select, Spinner } from "../../../../../components/ui";
import { MAX_DOCUMENT_MB } from "../../../../../store/api/upload.api";
import { useCan } from "../../../../../store/permissions";
import {
  useGetStudentDocumentsQuery,
  useOpenStudentDocumentMutation,
  useRemoveStudentDocumentMutation,
  useUploadStudentDocumentMutation,
  useVerifyStudentDocumentMutation,
  type DocChecklistItem,
  type StudentDocument,
} from "../../../../../store/api/studentRecords.api";
import styles from "./Records.module.css";

const fmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const errorText = (e: unknown, fallback: string) => (e as { data?: { message?: string } } | undefined)?.data?.message ?? fallback;

const STATUS_TEXT = { VERIFIED: "Verified", ON_FILE: "On file, not verified", MISSING: "Missing" } as const;

export const DocumentChecklist = ({ items }: { items: DocChecklistItem[] }) => (
  <div className={styles.checklist}>
    {items.map((c) => (
      <span key={c.docType} className={`${styles.chip} ${styles[`chip${c.status}`]}`} title={STATUS_TEXT[c.status]}>
        <Icon name={c.status === "MISSING" ? "x" : "check"} size={13} />
        {c.label}
      </span>
    ))}
  </div>
);

// Scanned documents kept on file for this student. Files are private: they open here through
// the ERP (each view is logged), there's no shareable link.
const DocumentsTab = ({ studentId }: { studentId: number }) => {
  const can = useCan();
  const canEdit = can("documents.edit");
  const { data, isLoading, isError, refetch } = useGetStudentDocumentsQuery(studentId);
  const [verify] = useVerifyStudentDocumentMutation();
  const [uploading, setUploading] = useState<string | null>(null); // docType to start with
  const [viewing, setViewing] = useState<StudentDocument | null>(null);
  const [removing, setRemoving] = useState<StudentDocument | null>(null);

  const toggleVerified = async (d: StudentDocument) => {
    try {
      await verify({ id: d.id, studentId, verified: !d.verifiedAt }).unwrap();
      toast.success(d.verifiedAt ? "Marked as not verified" : `${d.label} verified`);
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };

  if (isLoading) return <Spinner />;
  if (isError || !data)
    return <EmptyState title="Couldn't load documents" description="Check your connection and try again." action={<Button variant="outline" onClick={() => refetch()}>Retry</Button>} />;

  const missing = data.checklist.filter((c) => c.status === "MISSING");

  return (
    <div className={styles.stack}>
      <Card
        title="Documents"
        subtitle="Scans kept on file. Families can see what's on file and what's missing, but can't open the files."
        action={
          canEdit && (
            <Button size="sm" icon={<Icon name="upload" size={15} />} onClick={() => setUploading(missing[0]?.docType ?? "")}>
              Upload document
            </Button>
          )
        }
      >
        {data.checklist.length > 0 && (
          <>
            <p className={styles.note}>
              {missing.length ? `${missing.length} expected document${missing.length > 1 ? "s" : ""} missing.` : "Every expected document is on file."} The list follows this
              student's record (previous school, category, disability).
            </p>
            <DocumentChecklist items={data.checklist} />
          </>
        )}

        {!data.documents.length ? (
          <EmptyState title="No documents on file" description={canEdit ? "Upload a photo or PDF scan — birth certificate, Aadhaar, previous TC …" : "The office hasn't uploaded any yet."} />
        ) : (
          <div>
            {data.documents.map((d) => (
              <div key={d.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.rowTitle}>
                    {d.label}
                    {d.title ? ` · ${d.title}` : ""}
                  </div>
                  <div className={styles.muted}>
                    {d.isPdf ? "PDF" : "Photo"} · {size(d.bytes)} · added {fmt(d.createdAt)}
                    {d.uploadedBy ? ` by ${d.uploadedBy}` : ""}
                  </div>
                </div>
                {d.verifiedAt ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}
                <div className={styles.rowActions}>
                  <Button size="sm" variant="outline" icon={<Icon name="eye" size={15} />} onClick={() => setViewing(d)}>
                    View
                  </Button>
                  {canEdit && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => toggleVerified(d)}>
                        {d.verifiedAt ? "Unverify" : "Mark verified"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(d)}>
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {uploading !== null && <UploadModal studentId={studentId} types={data.types} initialType={uploading} onClose={() => setUploading(null)} />}
      {viewing && <ViewModal doc={viewing} onClose={() => setViewing(null)} />}
      {removing && <RemoveModal studentId={studentId} doc={removing} onClose={() => setRemoving(null)} />}
    </div>
  );
};

const UploadModal = ({ studentId, types, initialType, onClose }: { studentId: number; types: Array<{ value: string; label: string }>; initialType: string; onClose: () => void }) => {
  const [docType, setDocType] = useState(initialType);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [upload, { isLoading }] = useUploadStudentDocumentMutation();

  const isPdf = file?.type === "application/pdf";
  const tooBig = !!file && isPdf && file.size > MAX_DOCUMENT_MB * 1048576;

  const save = async () => {
    if (!file) return;
    try {
      await upload({ studentId, file, docType, title: title.trim() || undefined }).unwrap();
      toast.success("Document saved");
      onClose();
    } catch (e) {
      toast.error(errorText(e, "Couldn't upload the document"));
    }
  };

  return (
    <Modal title="Upload document" size="sm" onClose={onClose}>
      <div className={styles.fields}>
        <div className={styles.wide}>
          <Select label="Document" required value={docType} onChange={(e) => setDocType(e.target.value)} options={[{ label: "Choose…", value: "" }, ...types]} />
        </div>
        <div className={styles.wide}>
          <Input
            label={docType === "OTHER" ? "What is it?" : "Note (optional)"}
            required={docType === "OTHER"}
            value={title}
            maxLength={120}
            placeholder={docType === "OTHER" ? "e.g. Sports certificate" : "e.g. Front and back"}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <label className={`${styles.field} ${styles.wide}`}>
          <span className={styles.label}>File</span>
          <input className={styles.fileInput} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className={styles.muted}>A photo (shrunk automatically) or a PDF up to {MAX_DOCUMENT_MB} MB.</span>
          {tooBig && <span className={styles.muted} style={{ color: "var(--erp-danger)" }}>This PDF is {(file!.size / 1048576).toFixed(1)} MB — scan at a lower quality.</span>}
        </label>
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button isLoading={isLoading} disabled={!file || !docType || tooBig || (docType === "OTHER" && !title.trim())} onClick={save}>
          Upload
        </Button>
      </div>
    </Modal>
  );
};

const ViewModal = ({ doc, onClose }: { doc: StudentDocument; onClose: () => void }) => {
  const [open, { data, isLoading, isError, error }] = useOpenStudentDocumentMutation();
  useEffect(() => {
    open(doc.id);
  }, [doc.id, open]);
  // The object URL lives only while the preview is open.
  useEffect(() => () => void (data?.url && URL.revokeObjectURL(data.url)), [data?.url]);

  const title = `${doc.label}${doc.title ? ` · ${doc.title}` : ""}`;
  return (
    <Modal title={title} size="lg" onClose={onClose}>
      {isLoading || (!data && !isError) ? (
        <Spinner />
      ) : isError || !data ? (
        <EmptyState title="Couldn't open the file" description={errorText(error, "Try again in a minute.")} />
      ) : (
        <>
          <div className={styles.preview}>{data.type.startsWith("image/") ? <img src={data.url} alt={title} /> : <iframe src={data.url} title={title} />}</div>
          <div className={styles.actions}>
            <Button
              variant="outline"
              icon={<Icon name="download" size={15} />}
              onClick={() => {
                const ext = data.type.split("/")[1]?.replace("jpeg", "jpg") ?? "file";
                const a = Object.assign(document.createElement("a"), { href: data.url, download: `${doc.label}.${ext}` });
                document.body.appendChild(a);
                a.click();
                a.remove();
              }}
            >
              Download
            </Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        </>
      )}
    </Modal>
  );
};

const RemoveModal = ({ studentId, doc, onClose }: { studentId: number; doc: StudentDocument; onClose: () => void }) => {
  const [reason, setReason] = useState("");
  const [remove, { isLoading }] = useRemoveStudentDocumentMutation();
  const confirm = async () => {
    try {
      await remove({ id: doc.id, studentId, reason: reason.trim() }).unwrap();
      toast.success("Document removed");
      onClose();
    } catch (e) {
      toast.error(errorText(e, "Couldn't remove the document"));
    }
  };
  return (
    <Modal title={`Remove ${doc.label}?`} size="sm" onClose={onClose}>
      <p className={styles.note}>The file is deleted from storage and can't be recovered. A note that it was removed, and why, is kept.</p>
      <Input label="Reason" required value={reason} placeholder="e.g. Wrong student's document" onChange={(e) => setReason(e.target.value)} />
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Keep it
        </Button>
        <Button variant="danger" isLoading={isLoading} disabled={reason.trim().length < 3} onClick={confirm}>
          Remove
        </Button>
      </div>
    </Modal>
  );
};

export default DocumentsTab;
