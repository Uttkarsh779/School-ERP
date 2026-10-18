import { useRef } from "react";
import { toast } from "react-toastify";
import { Button } from "../../ui";
import { useUploadFileMutation } from "../../../store/api/upload.api";

// Single photo/PDF upload to Cloudinary (via POST /upload). Shows the uploaded file as a link
// with Replace / Remove. Used for homework attachments and submissions.
interface FileUploadFieldProps {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
  folder: string;
  disabled?: boolean;
}

const FileUploadField = ({ label, value, onChange, folder, disabled }: FileUploadFieldProps) => {
  const input = useRef<HTMLInputElement>(null);
  const [upload, { isLoading }] = useUploadFileMutation();

  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$|^application\/pdf$/.test(f.type)) return toast.error("Upload a photo (JPG/PNG/WebP) or a PDF");
    if (f.size > 10 * 1024 * 1024) return toast.error("File must be under 10MB");
    try {
      const res = await upload({ file: f, folder }).unwrap();
      onChange(res.data.url);
    } catch (e) {
      toast.error((e as { data?: { message?: string } })?.data?.message ?? "Upload failed");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--erp-text)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
        {value ? (
          <>
            <a href={value} target="_blank" rel="noreferrer" style={{ fontSize: "0.88rem" }}>
              {value.toLowerCase().endsWith(".pdf") ? "View PDF" : "View attachment"}
            </a>
            {!disabled && (
              <>
                <Button size="sm" variant="outline" onClick={() => input.current?.click()} isLoading={isLoading}>
                  Replace
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
                  Remove
                </Button>
              </>
            )}
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => input.current?.click()} isLoading={isLoading} disabled={disabled}>
            Attach photo / PDF
          </Button>
        )}
        <input
          ref={input}
          type="file"
          hidden
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <span style={{ fontSize: "0.76rem", color: "var(--erp-text-muted)" }}>Photo or PDF, up to 10MB</span>
    </div>
  );
};

export default FileUploadField;
