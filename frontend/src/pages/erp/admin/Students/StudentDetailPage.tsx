import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  EmptyState,
  FormGrid,
  FormSection,
  Icon,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  type SelectOption,
} from "../../../../components/ui";
import StudentProfileView from "../../../../components/shared/StudentProfileView/StudentProfileView";
import {
  useGetStudentByIdQuery,
  useSetStudentCredentialsMutation,
  useUpdateStudentMutation,
} from "../../../../store/api/students.api";
import { useGetClassSectionsQuery } from "../../../../store/api/classSections.api";
import {
  useAssignStudentTransportMutation,
  useAssignStudentVillageMutation,
  useGetTransportRoutesQuery,
  useGetVillagesQuery,
} from "../../../../store/api/transport.api";
import StudentFormFields from "./StudentFormFields";
import { emptyStudentFormValues, type StudentFormValues } from "./studentForm";

interface CredentialsFormInputs {
  email?: string;
  password: string;
}

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

const StudentDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const studentId = Number(id);

  const { data: student, isLoading, isError } = useGetStudentByIdQuery(studentId, { skip: !studentId });
  const { data: classSections } = useGetClassSectionsQuery();
  const { data: transportRoutes } = useGetTransportRoutesQuery();
  const { data: villages } = useGetVillagesQuery();

  const [setCredentials, { isLoading: isSavingCredentials }] = useSetStudentCredentialsMutation();
  const [updateStudent, { isLoading: isUpdating }] = useUpdateStudentMutation();
  const [assignTransport, { isLoading: isAssigningTransport }] = useAssignStudentTransportMutation();
  const [assignVillage, { isLoading: isAssigningVillage }] = useAssignStudentVillageMutation();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransportModalOpen, setIsTransportModalOpen] = useState(false);

  const [selectedRouteId, setSelectedRouteId] = useState<string>("");
  const [locationSearchQuery, setLocationSearchQuery] = useState<string>("");
  const [selectedVillageId, setSelectedVillageId] = useState<string>("");
  const [transportStartDate, setTransportStartDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [transportPolicy, setTransportPolicy] = useState<"FULL_MONTH" | "PRORATED" | "NEXT_PERIOD">("FULL_MONTH");

  const [loginEmail, setLoginEmail] = useState<string | null>(null);

  const {
    register: credentialsRegister,
    handleSubmit: handleCredentialsSubmit,
    reset: resetCredentials,
    formState: { errors: credentialsErrors },
  } = useForm<CredentialsFormInputs>();

  const {
    register: editRegister,
    handleSubmit: handleEditSubmit,
    reset: resetEditForm,
    formState: { errors: editErrors },
  } = useForm<StudentFormValues>({ defaultValues: emptyStudentFormValues });

  useEffect(() => {
    if (isError) toast.error("Failed to load this student's profile.");
  }, [isError]);

  const classSectionOptions: SelectOption[] = (classSections ?? []).map((cs) => ({
    label: `${cs.className} - ${cs.section}`,
    value: cs.id,
  }));

  const routeOptions: SelectOption[] = [
    { label: "No Route Assigned (Walk / Self)", value: "" },
    ...(transportRoutes ?? []).map((r) => ({
      label: `${r.routeName}${r.stops ? ` — Stops: ${r.stops}` : ""}`,
      value: r.id,
    })),
  ];

  const filteredVillages = (villages ?? [])
    .filter((v) => v.isActive)
    .filter((v) => !locationSearchQuery || v.name.toLowerCase().includes(locationSearchQuery.toLowerCase().trim()));

  const activeVillage = (villages ?? []).find((v) => String(v.id) === selectedVillageId);

  const closeModal = () => {
    setIsModalOpen(false);
    resetCredentials();
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    resetEditForm(emptyStudentFormValues);
  };

  const openEditModal = () => {
    if (student) {
      resetEditForm({
        name: student.name || "",
        rollNo: String(student.rollNo || ""),
        admissionNo: student.admissionNo || "",
        classSectionId: student.classSectionId ? String(student.classSectionId) : "",
        dob: student.dob ? new Date(student.dob).toISOString().split("T")[0] : "",
        gender: student.gender || "",
        bloodGroup: student.bloodGroup || "",
        fatherName: student.fatherName || "",
        fatherContact: student.fatherContact || "",
        motherName: student.motherName || "",
        motherContact: student.motherContact || "",
        aadharNumber: student.aadharNumber || "",
        apaarId: student.apaarId || "",
        category: student.category || "",
        address: student.address || "",
        contactNumber: student.contactNumber || "",
      });
      setIsEditModalOpen(true);
    }
  };

  const openTransportModal = () => {
    setSelectedRouteId(student?.transportRouteId ? String(student.transportRouteId) : "");
    setLocationSearchQuery("");
    setSelectedVillageId("");
    setTransportStartDate(new Date().toISOString().split("T")[0]);
    setIsTransportModalOpen(true);
  };

  const onCredentialsSubmit = async (values: CredentialsFormInputs) => {
    try {
      const result = await setCredentials({
        id: studentId,
        email: values.email || undefined,
        password: values.password,
      }).unwrap();
      toast.success("Student login saved");
      setLoginEmail(result.email);
      closeModal();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to set student login"));
    }
  };

  const onEditSubmit = async (values: StudentFormValues) => {
    if (!values.classSectionId) {
      toast.error("Please select a class section.");
      return;
    }

    try {
      await updateStudent({
        id: studentId,
        name: values.name,
        rollNo: values.rollNo,
        admissionNo: values.admissionNo,
        classSectionId: Number(values.classSectionId),
        dob: values.dob || undefined,
        gender: values.gender ? (values.gender as any) : undefined,
        bloodGroup: values.bloodGroup || undefined,
        fatherName: values.fatherName || undefined,
        fatherContact: values.fatherContact || undefined,
        motherName: values.motherName || undefined,
        motherContact: values.motherContact || undefined,
        aadharNumber: values.aadharNumber || undefined,
        apaarId: values.apaarId || undefined,
        category: values.category ? (values.category as any) : undefined,
        address: values.address || undefined,
        contactNumber: values.contactNumber || undefined,
      }).unwrap();

      toast.success("Student profile updated successfully.");
      closeEditModal();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update student profile."));
    }
  };

  const onTransportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 1. Assign/Unassign Bus Route
      await assignTransport({
        studentId,
        transportRouteId: selectedRouteId ? Number(selectedRouteId) : null,
      }).unwrap();

      // 2. Assign Transport Village/Location Fee Rate if selected
      if (selectedVillageId) {
        await assignVillage({
          studentId,
          villageId: Number(selectedVillageId),
          startDate: transportStartDate,
          policy: transportPolicy,
        }).unwrap();
      }

      toast.success("Student transport route & location fee saved successfully.");
      setIsTransportModalOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to save transport assignment."));
    }
  };

  return (
    <div>
      <PageHeader
        title="Student Profile"
        subtitle={student ? `${student.name}'s full record` : undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(-1)}>
              Back
            </Button>
            {student && (
              <>
                <Button icon={<Icon name="bus" />} variant="outline" onClick={openTransportModal}>
                  Manage Transport
                </Button>
                <Button icon={<Icon name="edit" />} variant="outline" onClick={openEditModal}>
                  Edit Profile
                </Button>
              </>
            )}
            <Button icon={<Icon name="plus" />} onClick={() => setIsModalOpen(true)}>
              Set Login
            </Button>
          </>
        }
      />

      {loginEmail && (
        <FormSection title="Login Credentials Saved">
          <p style={{ margin: 0, fontSize: "0.88rem" }}>
            This student can now sign in with <strong>{loginEmail}</strong> (or their admission number{" "}
            <strong>{student?.admissionNo}</strong>) and the password you just set.
          </p>
        </FormSection>
      )}

      {isLoading ? (
        <Spinner />
      ) : !student ? (
        <EmptyState title="Student not found" description="This student record may have been removed." />
      ) : (
        <StudentProfileView student={student} onAssignTransport={openTransportModal} />
      )}

      {/* Edit Student Profile Modal */}
      {isEditModalOpen && (
        <Modal title="Edit Student Profile" onClose={closeEditModal}>
          <form onSubmit={handleEditSubmit(onEditSubmit)}>
            <StudentFormFields
              register={editRegister}
              errors={editErrors}
              classSectionOptions={classSectionOptions}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "1.25rem" }}>
              <Button type="button" variant="ghost" onClick={closeEditModal}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isUpdating}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Assign Transport Route & Location Fee Modal */}
      {isTransportModalOpen && (
        <Modal title="Manage Student Transport & Location Fee" onClose={() => setIsTransportModalOpen(false)}>
          <form onSubmit={onTransportSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <FormSection title="1. Bus Route Assignment">
              <Select
                label="Transport Bus Route"
                value={selectedRouteId}
                onChange={(e) => setSelectedRouteId(e.target.value)}
                options={routeOptions}
              />
            </FormSection>

            <FormSection title="2. Fee Location Rate Selection">
              <Input
                label="Search Location / Village Name"
                placeholder="Type to search location (e.g. Rampur, Lakshmipur, Sector 14...)"
                value={locationSearchQuery}
                onChange={(e) => setLocationSearchQuery(e.target.value)}
              />

              <Select
                label={`Transport Location / Village (${filteredVillages.length} locations matching)`}
                value={selectedVillageId}
                onChange={(e) => setSelectedVillageId(e.target.value)}
                options={[
                  { label: "No Location Selected", value: "" },
                  ...filteredVillages.map((v) => ({
                    label: `${v.name} — Rate: ₹${v.monthlyFee.toLocaleString("en-IN")}/mo`,
                    value: String(v.id),
                  })),
                ]}
              />

              {activeVillage && (
                <div style={{ padding: "0.65rem 0.85rem", background: "rgba(2, 132, 199, 0.06)", border: "1px solid rgba(2, 132, 199, 0.2)", borderRadius: "var(--erp-radius-sm)", fontSize: "0.85rem", color: "var(--erp-primary-700)", fontWeight: 600 }}>
                  Assigned Monthly Rate: ₹{activeVillage.monthlyFee.toLocaleString("en-IN")} / month ({activeVillage.name})
                </div>
              )}
            </FormSection>

            {selectedVillageId && (
              <FormSection title="3. Billing Effective Date & Policy">
                <FormGrid>
                  <Input
                    label="Effective Start Date *"
                    type="date"
                    required
                    value={transportStartDate}
                    onChange={(e) => setTransportStartDate(e.target.value)}
                  />
                  <Select
                    label="Current Month Charge Policy"
                    value={transportPolicy}
                    onChange={(e) => setTransportPolicy(e.target.value as any)}
                    options={[
                      { label: "Full Month — Charge full current month", value: "FULL_MONTH" },
                      { label: "Prorated — Charge only active days", value: "PRORATED" },
                      { label: "Next Month — Start from next month", value: "NEXT_PERIOD" },
                    ]}
                  />
                </FormGrid>
              </FormSection>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "1.25rem" }}>
              <Button type="button" variant="ghost" onClick={() => setIsTransportModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isAssigningTransport || isAssigningVillage}>
                Save Transport Assignment
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Set Login Credentials Modal */}
      {isModalOpen && (
        <Modal title="Set Student Login" onClose={closeModal}>
          <form onSubmit={handleCredentialsSubmit(onCredentialsSubmit)}>
            <FormSection title="Login Details">
              <FormGrid>
                <Input
                  label="Email"
                  type="email"
                  placeholder="Optional — leave blank to use admission number only"
                  style={{ gridColumn: "1 / -1" }}
                  {...credentialsRegister("email")}
                />
                <Input
                  label="Password"
                  type="password"
                  required
                  style={{ gridColumn: "1 / -1" }}
                  error={credentialsErrors.password?.message}
                  {...credentialsRegister("password", { required: "Password is required" })}
                />
              </FormGrid>
            </FormSection>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginTop: "0.4rem" }}>
              <Button type="button" variant="ghost" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSavingCredentials}>
                Save Login
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default StudentDetailPage;
