import type { ReactNode } from "react";
import { ImageUpload, Input, Select } from "../../../../components/ui";
import FileUploadField from "../../../../components/shared/FileUploadField/FileUploadField";
import styles from "./AdminCmsPage.module.css";

// Form field definitions shared by the settings editor and the content-collection manager.
export type FieldDef =
  | { key: string; label: string; type: "text" | "url" | "email" | "tel" | "number" | "date"; hint?: string; full?: boolean; required?: boolean; placeholder?: string; maxLength?: number; suggestions?: string[] }
  | { key: string; label: string; type: "textarea"; hint?: string; full?: boolean; required?: boolean; rows?: number; maxLength?: number; placeholder?: string }
  | { key: string; label: string; type: "image"; hint?: string; full?: boolean; required?: boolean; folder?: string }
  | { key: string; label: string; type: "file"; hint?: string; full?: boolean; folder?: string }
  | { key: string; label: string; type: "bool"; hint?: string; full?: boolean }
  | { key: string; label: string; type: "select"; options: { label: string; value: string }[]; hint?: string; full?: boolean };

type Values = Record<string, unknown>;

const Labeled = ({ label, hint, children, full, required }: { label: string; hint?: string; children: ReactNode; full?: boolean; required?: boolean }) => (
  <div className={`${styles.field} ${full ? styles.full : ""}`}>
    <span className={styles.label}>
      {label}
      {required && <span style={{ color: "var(--erp-danger)" }}> *</span>}
    </span>
    {children}
    {hint && <span className={styles.hint}>{hint}</span>}
  </div>
);

export const FieldInput = ({ def, values, onChange }: { def: FieldDef; values: Values; onChange: (key: string, value: unknown) => void }) => {
  const v = values[def.key];
  switch (def.type) {
    case "textarea":
      return (
        <Labeled label={def.label} hint={def.hint} full={def.full ?? true} required={def.required}>
          <textarea
            className={styles.textarea}
            rows={def.rows ?? 4}
            value={(v as string) ?? ""}
            maxLength={def.maxLength}
            placeholder={def.placeholder}
            onChange={(e) => onChange(def.key, e.target.value)}
          />
        </Labeled>
      );
    case "image":
      return (
        <div className={def.full ? styles.full : undefined}>
          <ImageUpload label={def.label + (def.required ? " *" : "")} value={(v as string) ?? ""} onChange={(url) => onChange(def.key, url)} folder={def.folder ?? "school_erp/website"} helperText={def.hint} />
          {typeof v === "string" && v && (
            <button type="button" className={styles.pill} style={{ marginTop: 6 }} onClick={() => onChange(def.key, null)}>
              Remove image
            </button>
          )}
        </div>
      );
    case "file":
      return (
        <div className={def.full ? styles.full : undefined}>
          <FileUploadField label={def.label} value={(v as string) || null} onChange={(url) => onChange(def.key, url)} folder={def.folder ?? "school_erp/website"} />
          {def.hint && <span className={styles.hint}>{def.hint}</span>}
        </div>
      );
    case "bool":
      return (
        <div className={def.full ? styles.full : undefined}>
          <label className={styles.toggle}>
            <input type="checkbox" checked={Boolean(v)} onChange={(e) => onChange(def.key, e.target.checked)} />
            {def.label}
          </label>
          {def.hint && <span className={styles.hint}>{def.hint}</span>}
        </div>
      );
    case "select":
      return (
        <div className={def.full ? styles.full : undefined}>
          <Select label={def.label} value={(v as string) ?? ""} options={def.options} onChange={(e) => onChange(def.key, e.target.value)} />
          {def.hint && <span className={styles.hint}>{def.hint}</span>}
        </div>
      );
    default: {
      const listId = "suggestions" in def && def.suggestions?.length ? `dl-${def.key}` : undefined;
      return (
        <div className={def.full ? styles.full : undefined}>
          <Input
            label={def.label + (def.required ? " *" : "")}
            type={def.type}
            value={v === null || v === undefined ? "" : String(v)}
            placeholder={def.placeholder}
            maxLength={def.maxLength}
            list={listId}
            onChange={(e) => onChange(def.key, def.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
            hint={def.hint}
          />
          {listId && "suggestions" in def && (
            <datalist id={listId}>
              {def.suggestions!.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </div>
      );
    }
  }
};

export const errorOf = (err: unknown, fallback: string) => (err as { data?: { message?: string } })?.data?.message ?? fallback;
