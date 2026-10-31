import { FormGrid, FormSection, Input, Select } from "../../../../components/ui";

// HR details of a staff member (personal, employment, ID and bank), shared by the New Staff
// and Edit Staff forms. Values are kept as strings for the inputs; detailsPayload() turns
// them into what the API expects.

export interface StaffDetailsForm {
  employeeCode: string;
  gender: string;
  dob: string;
  bloodGroup: string;
  fatherOrSpouseName: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  joiningDate: string;
  leavingDate: string;
  experienceYears: string;
  address: string;
  aadhaarNumber: string;
  panNumber: string;
  bankName: string;
  bankAccountNo: string;
  bankIfsc: string;
}

type Key = keyof StaffDetailsForm;
const SENSITIVE: Key[] = ["aadhaarNumber", "panNumber", "bankName", "bankAccountNo", "bankIfsc"];
const DATES: Key[] = ["dob", "joiningDate", "leavingDate"];

export const emptyStaffDetails: StaffDetailsForm = {
  employeeCode: "",
  gender: "",
  dob: "",
  bloodGroup: "",
  fatherOrSpouseName: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  joiningDate: "",
  leavingDate: "",
  experienceYears: "",
  address: "",
  aadhaarNumber: "",
  panNumber: "",
  bankName: "",
  bankAccountNo: "",
  bankIfsc: "",
};

// Dates are stored as India midnight; show them as the India calendar day.
const istDay = (d?: string | null) => (d ? new Date(new Date(d).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10) : "");

export const detailsFromStaff = (s: IStaff): StaffDetailsForm => {
  const out = { ...emptyStaffDetails };
  (Object.keys(out) as Key[]).forEach((k) => {
    const v = s[k];
    out[k] = DATES.includes(k) ? istDay(v as string | null) : v === null || v === undefined ? "" : String(v);
  });
  return out;
};

// Edit: every field is sent ("" clears it). New: only filled fields. Sensitive fields are
// sent only by the Super Admin (others never see them).
export const detailsPayload = (form: StaffDetailsForm, opts: { includeSensitive: boolean; onlyFilled: boolean }) => {
  const out: Record<string, string | null> = {};
  (Object.keys(form) as Key[]).forEach((k) => {
    if (SENSITIVE.includes(k) && !opts.includeSensitive) return;
    const v = form[k].trim();
    if (opts.onlyFilled && !v) return;
    out[k] = v || null;
  });
  return out;
};

const GENDERS = [
  { value: "", label: "—" },
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];
const BLOOD_GROUPS = [{ value: "", label: "—" }, ...["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => ({ value: b, label: b }))];

interface Props {
  value: StaffDetailsForm;
  onChange: (next: StaffDetailsForm) => void;
  showSensitive: boolean;
  isNew?: boolean;
}

const StaffDetailsFields = ({ value, onChange, showSensitive, isNew }: Props) => {
  const field = (k: Key) => ({ value: value[k], onChange: (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value }) });

  return (
    <>
      <FormSection title="Personal details">
        <FormGrid>
          <Select label="Gender" options={GENDERS} {...field("gender")} />
          <Input label="Date of birth" type="date" {...field("dob")} />
          <Select label="Blood group" options={BLOOD_GROUPS} {...field("bloodGroup")} />
          <Input label="Father's / spouse's name" {...field("fatherOrSpouseName")} />
          <Input label="Emergency contact name" placeholder="e.g. Ravi Gupta (husband)" {...field("emergencyContactName")} />
          <Input label="Emergency contact number" inputMode="tel" {...field("emergencyContactPhone")} />
          <div style={{ gridColumn: "1 / -1" }}>
            <Input label="Address" {...field("address")} />
          </div>
        </FormGrid>
      </FormSection>

      <FormSection title="Employment">
        <FormGrid>
          <Input
            label="Employee code"
            placeholder={isNew ? "Leave blank for automatic (EMP-0012)" : undefined}
            {...field("employeeCode")}
          />
          <Input label="Joining date" type="date" {...field("joiningDate")} />
          <Input label="Experience before joining (years)" type="number" min={0} max={60} {...field("experienceYears")} />
          {!isNew && <Input label="Leaving date" type="date" {...field("leavingDate")} />}
        </FormGrid>
      </FormSection>

      {showSensitive && (
        <FormSection title="ID & bank details">
          <FormGrid>
            <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: "0.8rem", color: "var(--erp-text-muted)" }}>
              Only the Super Admin can see these. The bank account will be used for salary payments.
            </p>
            <Input label="Aadhaar number" inputMode="numeric" placeholder="12 digits" {...field("aadhaarNumber")} />
            <Input label="PAN" placeholder="ABCDE1234F" {...field("panNumber")} />
            <Input label="Bank name" {...field("bankName")} />
            <Input label="Account number" inputMode="numeric" {...field("bankAccountNo")} />
            <Input label="IFSC" placeholder="SBIN0001234" {...field("bankIfsc")} />
          </FormGrid>
        </FormSection>
      )}
    </>
  );
};

export default StaffDetailsFields;
