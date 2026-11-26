import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, Input, Modal, Select } from "../../../../components/ui";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import { useGetSessionsQuery } from "../../../../store/api/sessions.api";
import {
  useAddApplicationMutation,
  useChangeApplicationStageMutation,
  useUpdateApplicationMutation,
  type Application,
} from "../../../../store/api/admissions.api";
import { getErrorMessage } from "../Fees/feeUtils";
import styles from "./Admissions.module.css";

const FIELDS = [
  "sessionId",
  "className",
  "studentName",
  "dob",
  "gender",
  "bloodGroup",
  "category",
  "aadharNumber",
  "nationality",
  "previousSchool",
  "previousClass",
  "fatherName",
  "fatherPhone",
  "fatherOccupation",
  "motherName",
  "motherPhone",
  "motherOccupation",
  "email",
  "address",
  "message",
  "contactName",
  "phone",
] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;

const sortClasses = (names: string[]) => {
  const rank = (n: string) => {
    const l = n.toLowerCase();
    if (l.includes("nursery") || l.includes("pre")) return -3;
    if (l.includes("lkg")) return -2;
    if (l.includes("ukg")) return -1;
    const m = n.match(/\d+/);
    return m ? Number(m[0]) : 99;
  };
  return [...new Set(names)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};

const fromApplication = (a: Application | null, defaultSessionId: number | null): Values => {
  const v = Object.fromEntries(FIELDS.map((f) => [f, ""])) as Values;
  if (!a) return { ...v, nationality: "Indian", sessionId: defaultSessionId ? String(defaultSessionId) : "" };
  for (const f of FIELDS) {
    const raw = (a as unknown as Record<string, unknown>)[f];
    v[f] = raw === null || raw === undefined ? "" : f === "dob" ? String(raw).slice(0, 10) : String(raw);
  }
  if (!v.sessionId && defaultSessionId) v.sessionId = String(defaultSessionId);
  return v;
};

// mode: NEW (walk-in application) · EDIT (fix details) · APPLY (enquiry → application)
const ApplicationForm = ({
  mode,
  application,
  defaultSessionId,
  onClose,
  onSaved,
}: {
  mode: "NEW" | "EDIT" | "APPLY";
  application: Application | null;
  defaultSessionId: number | null;
  onClose: () => void;
  onSaved?: (id: number) => void;
}) => {
  const [v, setV] = useState<Values>(() => fromApplication(application, defaultSessionId));
  const set = (k: Field) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const { data: sessions = [] } = useGetSessionsQuery();
  const { data: sections = [] } = useGetClassSectionsQuery(v.sessionId ? { sessionId: Number(v.sessionId) } : undefined, { skip: !v.sessionId });
  const classes = useMemo(() => sortClasses(sections.map((c) => c.className)), [sections]);
  const [add, { isLoading: adding }] = useAddApplicationMutation();
  const [update, { isLoading: updating }] = useUpdateApplicationMutation();
  const [stage, { isLoading: moving }] = useChangeApplicationStageMutation();
  const isEnquiryEdit = mode === "EDIT" && application?.stage === "ENQUIRY";
  const lockSession = mode === "EDIT" && application?.stage !== "ENQUIRY";

  const submit = async () => {
    const body: Record<string, unknown> = { ...v, sessionId: v.sessionId ? Number(v.sessionId) : undefined };
    if (!isEnquiryEdit) {
      delete body.contactName;
      delete body.phone;
    }
    if (lockSession) delete body.sessionId;
    try {
      if (mode === "NEW") {
        const res = await add({ fields: body, files: [] }).unwrap();
        toast.success(`Application ${res.applicationNo} added`);
        onSaved?.(res.id);
      } else if (mode === "APPLY") {
        await stage({ id: application!.id, action: "APPLY", ...body }).unwrap();
        toast.success("Now an application");
      } else {
        await update({ id: application!.id, ...body }).unwrap();
        toast.success("Details saved");
      }
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"));
    }
  };

  const input = (k: Field, label: string, opts: { required?: boolean; type?: string; wide?: boolean; placeholder?: string } = {}) => (
    <div className={opts.wide ? styles.wide : undefined}>
      <Input label={label} required={opts.required} type={opts.type} value={v[k]} placeholder={opts.placeholder} max={opts.type === "date" ? new Date().toISOString().slice(0, 10) : undefined} onChange={set(k)} />
    </div>
  );
  const select = (k: Field, label: string, options: Array<[string, string]>, required = false) => (
    <Select label={label} required={required} value={v[k]} onChange={set(k)} options={[{ label: "Choose…", value: "" }, ...options.map(([value, l]) => ({ value, label: l }))]} />
  );
  const full = !isEnquiryEdit;

  return (
    <Modal title={mode === "NEW" ? "New application (walk-in)" : mode === "APPLY" ? "Turn enquiry into an application" : `Edit ${application?.applicationNo}`} size="lg" onClose={onClose}>
      {mode === "APPLY" && <p className={styles.muted}>Fill in the full details. The registration fee for the class is added once it becomes an application.</p>}
      <div className={styles.formGrid}>
        <h4 className={styles.sectionTitle}>Admission</h4>
        <Select
          label="Session"
          required
          disabled={lockSession}
          value={v.sessionId}
          onChange={(e) => setV((x) => ({ ...x, sessionId: e.target.value, className: "" }))}
          options={[{ label: "Choose…", value: "" }, ...sessions.map((s) => ({ label: `${s.name}${s.isCurrent ? " (current)" : ""}`, value: String(s.id) }))]}
        />
        {isEnquiryEdit ? (
          input("className", "Class asked about", { required: true })
        ) : (
          <Select
            label="Class"
            required
            value={v.className}
            onChange={set("className")}
            options={[
              { label: classes.length || !v.sessionId ? "Choose…" : "No classes in this session yet", value: "" },
              ...(v.className && !classes.includes(v.className) ? [{ label: `${v.className} (not a class in this session)`, value: v.className }] : []),
              ...classes.map((c) => ({ label: c, value: c })),
            ]}
          />
        )}

        <h4 className={styles.sectionTitle}>Child</h4>
        {input("studentName", "Full name", { required: true })}
        {input("dob", "Date of birth", { required: full, type: "date" })}
        {select("gender", "Gender", [["MALE", "Boy"], ["FEMALE", "Girl"], ["OTHER", "Other"]], full)}
        {select("bloodGroup", "Blood group", ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => [b, b]))}
        {select("category", "Category", [["GENERAL", "General"], ["OBC", "OBC"], ["SC", "SC"], ["ST", "ST"], ["EWS", "EWS"]])}
        {input("aadharNumber", "Aadhaar number")}
        {input("nationality", "Nationality")}
        {input("previousSchool", "Previous school")}
        {input("previousClass", "Class in previous school")}

        {isEnquiryEdit && (
          <>
            <h4 className={styles.sectionTitle}>Enquiry contact</h4>
            {input("contactName", "Parent's name", { required: true })}
            {input("phone", "Mobile", { required: true, type: "tel" })}
          </>
        )}
        <h4 className={styles.sectionTitle}>Parents</h4>
        {input("fatherName", "Father's name")}
        {input("fatherPhone", "Father's mobile", { type: "tel" })}
        {input("fatherOccupation", "Father's occupation")}
        {input("motherName", "Mother's name")}
        {input("motherPhone", "Mother's mobile", { type: "tel" })}
        {input("motherOccupation", "Mother's occupation")}
        {input("email", "Email", { type: "email", wide: true })}
        <label className={styles.wide}>
          <span className={styles.fieldLabel}>Address{full ? " *" : ""}</span>
          <textarea className={styles.textarea} value={v.address} maxLength={300} onChange={set("address")} />
        </label>
        <label className={styles.wide}>
          <span className={styles.fieldLabel}>Message from the family</span>
          <textarea className={styles.textarea} value={v.message} maxLength={1000} onChange={set("message")} />
        </label>
      </div>
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button isLoading={adding || updating || moving} onClick={submit}>
          {mode === "NEW" ? "Add application" : mode === "APPLY" ? "Make it an application" : "Save"}
        </Button>
      </div>
    </Modal>
  );
};

export default ApplicationForm;
