// All-string shape so it plays nicely with native <select>/<input> DOM values;
// converted to the typed CreateStudentInput at submit time.
export interface StudentFormValues {
  name: string;
  rollNo: string;
  classSectionId: string;
  admissionNo: string;
  admissionDate: string;
  dob: string;
  gender: string;
  bloodGroup: string;
  fatherName: string;
  fatherContact: string;
  motherName: string;
  motherContact: string;
  aadharNumber: string;
  apaarId: string;
  category: string;
  address: string;
  contactNumber: string;
  nationality: string;
  previousSchool: string;
}

export const emptyStudentFormValues: StudentFormValues = {
  name: "",
  rollNo: "",
  classSectionId: "",
  admissionNo: "",
  admissionDate: "",
  dob: "",
  gender: "",
  bloodGroup: "",
  fatherName: "",
  fatherContact: "",
  motherName: "",
  motherContact: "",
  aadharNumber: "",
  apaarId: "",
  category: "",
  address: "",
  contactNumber: "",
  nationality: "Indian",
  previousSchool: "",
};
