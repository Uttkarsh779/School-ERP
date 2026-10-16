import type { FieldErrors, UseFormRegister } from "react-hook-form";
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
}

const StudentFormFields = ({ register, errors, classSectionOptions }: StudentFormFieldsProps) => (
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
      </FormGrid>
    </FormSection>

    <FormSection title="Personal Details">
      <FormGrid>
        <Input label="Date of Birth" type="date" {...register("dob")} />
        <Select label="Gender" options={genderOptions} placeholder="Select gender" {...register("gender")} />
        <Input label="Blood Group" placeholder="e.g. O+" {...register("bloodGroup")} />
        <Select label="Category" options={categoryOptions} placeholder="Select category" {...register("category")} />
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
        <Input label="Aadhar Number" {...register("aadharNumber")} />
        <Input label="APAAR ID" {...register("apaarId")} />
        <Input label="Contact Number" {...register("contactNumber")} />
        <Input label="Address" {...register("address")} />
      </FormGrid>
    </FormSection>
  </>
);

export default StudentFormFields;
