import { useRef, useState } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { useLazyCheckStudentIdsQuery } from "../../../../store/api/students.api";
import { FormGrid, FormSection, Input, Select } from "../../../../components/ui";
import type { SelectOption } from "../../../../components/ui";
import type { StudentFormValues } from "./studentForm";

const genderOptions: SelectOption[] = [
  { label: "Male", value: "MALE" },
  { label: "Female", value: "FEMALE" },
  { label: "Other", value: "OTHER" },
];

const categoryOptions: SelectOption[] = [
  { label: "General", value: "GENERAL" },
  { label: "OBC", value: "OBC" },
  { label: "SC", value: "SC" },
  { label: "ST", value: "ST" },
  { label: "EWS", value: "EWS" },
];

interface StudentFormFieldsProps {
  register: UseFormRegister<StudentFormValues>;
  errors: FieldErrors<StudentFormValues>;
  classSectionOptions: SelectOption[];
  admissionNoHint?: string; // New Student form: says the number was filled in for them
  studentId?: number; // Edit form: the student being edited (their own number isn't a clash)
}

type IdKey = "aadharNumber" | "apaarId";
const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, "");
// Check as soon as the number looks complete: Aadhaar has 12 digits, APAAR ID 12 too,
// but APAAR formats vary, so any 6+ characters is checked.
// Same rule as the server: 12 digits, never starting with 0 or 1.
const aadhaarFormatError = (v: string) =>
  !v ? null : !/^\d{12}$/.test(v) ? "Aadhaar number must be exactly 12 digits" : /^[01]/.test(v) ? "Aadhaar number can't start with 0 or 1. Check the number." : null;

const looksComplete = (key: IdKey, v: string) => (key === "aadharNumber" ? /^\d{12}$/.test(v) : v.length >= 6);

// Two children can't share an Aadhaar number or APAAR ID. The form warns while typing
// (and on leaving the field), and won't save while the clash remains. The server checks too.
const StudentFormFields = ({ register, errors, classSectionOptions, admissionNoHint, studentId }: StudentFormFieldsProps) => {
  const [checkIds] = useLazyCheckStudentIdsQuery();
  const [warning, setWarning] = useState<Partial<Record<IdKey, string>>>({});
  const timers = useRef<Partial<Record<IdKey, number>>>({});
  const latest = useRef<Partial<Record<IdKey, string>>>({});

  const lookup = async (key: IdKey, raw: unknown): Promise<string | null> => {
    const v = clean(raw);
    if (!v) return null;
    try {
      const res = await checkIds({ [key]: v, exceptId: studentId }).unwrap();
      return res[key]?.message ?? null;
    } catch {
      return null; // a failed check never blocks the form; the server still refuses a clash
    }
  };
  const show = async (key: IdKey, raw: unknown) => {
    const v = clean(raw);
    const msg = (key === "aadharNumber" && aadhaarFormatError(v)) || (await lookup(key, v));
    if (latest.current[key] === v) setWarning((w) => ({ ...w, [key]: msg ?? undefined }));
  };

  const idField = (key: IdKey) =>
    register(key, {
      onChange: (e) => {
        const v = clean(e.target.value);
        latest.current[key] = v;
        window.clearTimeout(timers.current[key]);
        setWarning((w) => ({ ...w, [key]: undefined }));
        if (key === "aadharNumber" && (/\D/.test(v) || v.length > 12)) setWarning((w) => ({ ...w, [key]: aadhaarFormatError(v) ?? undefined }));
        else if (looksComplete(key, v)) timers.current[key] = window.setTimeout(() => show(key, v), 350);
      },
      onBlur: (e) => {
        latest.current[key] = clean(e.target.value);
        show(key, e.target.value);
      },
      validate: async (v) => (key === "aadharNumber" && aadhaarFormatError(clean(v))) || (await lookup(key, v)) || true,
    });

  const idMessage = (key: IdKey) => errors[key]?.message || warning[key];

  return (
  <>
    <FormSection title="General Information">
      <FormGrid>
        <Input
          label="Full Name"
          required
          placeholder="e.g. Aarav Sharma"
          error={errors.name?.message}
          {...register("name", { required: "Name is required" })}
        />
        <Input
          label="Roll No"
          required
          error={errors.rollNo?.message}
          {...register("rollNo", { required: "Roll No is required" })}
        />
        <Input
          label="Admission No"
          required
          hint={admissionNoHint}
          error={errors.admissionNo?.message}
          {...register("admissionNo", { required: "Admission No is required" })}
        />
        <Select
          label="Class Section"
          required
          options={classSectionOptions}
          placeholder="Select class section"
          error={errors.classSectionId?.message}
          {...register("classSectionId", { required: "Class section is required" })}
        />
        <Input label="Admission Date" type="date" {...register("admissionDate")} />
      </FormGrid>
    </FormSection>

    <FormSection title="Personal Details">
      <FormGrid>
        <Input label="Date of Birth" type="date" {...register("dob")} />
        <Select label="Gender" options={genderOptions} placeholder="Select gender" {...register("gender")} />
        <Input label="Blood Group" placeholder="e.g. O+" {...register("bloodGroup")} />
        <Select label="Category" options={categoryOptions} placeholder="Select category" {...register("category")} />
        <Input label="Nationality" placeholder="e.g. Indian" {...register("nationality")} />
      </FormGrid>
    </FormSection>

    <FormSection title="Family Information">
      <FormGrid>
        <Input label="Father's Name" {...register("fatherName")} />
        <Input label="Father's Contact" {...register("fatherContact")} />
        <Input label="Mother's Name" {...register("motherName")} />
        <Input label="Mother's Contact" {...register("motherContact")} />
      </FormGrid>
    </FormSection>

    <FormSection title="Government ID & Contact">
      <FormGrid>
        <Input label="Aadhaar Number" inputMode="numeric" hint="12 digits" error={idMessage("aadharNumber")} {...idField("aadharNumber")} />
        <Input label="APAAR ID" error={idMessage("apaarId")} {...idField("apaarId")} />
        <Input label="Contact Number" {...register("contactNumber")} />
        <Input label="Address" {...register("address")} />
        <Input label="Previous School" {...register("previousSchool")} />
      </FormGrid>
    </FormSection>
  </>
  );
};

export default StudentFormFields;
