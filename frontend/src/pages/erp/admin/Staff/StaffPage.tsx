import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  FormGrid,
  FormSection,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
  StatCard,
  Table,
} from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import {
  useCreateStaffMutation,
  useGetStaffListQuery,
  useSetStaffActiveMutation,
  useUpdateStaffMutation,
} from "../../../../store/api/staff.api";
import { useIdCards } from "../../../../components/shared/Print/useIdCards";
import { useAppSelector } from "../../../../store/store";
import ResetPasswordModal from "./ResetPasswordModal";
import StaffDetailsFields, { detailsFromStaff, detailsPayload, emptyStaffDetails, type StaffDetailsForm } from "./StaffDetailsFields";
import styles from "./StaffPage.module.css";
import ExportButton from "../../../../components/shared/ExportButton";

interface StaffFormInputs {
  name: string;
  email: string;
  password: string;
  qualifications?: string;
  contact?: string;
  group: "TEACHING" | "NON_TEACHING";
  staffCategory: string;
}

// Designation = the job title (HR, ID cards). Login role = what the person can do in the
// software. They're chosen separately; the designation only suggests a login role.
const TEACHING_ROLES = [
  { value: "TEACHER", label: "Teacher" },
  { value: "PRINCIPAL", label: "Principal" },
  { value: "VICE_PRINCIPAL", label: "Vice Principal" },
  { value: "COORDINATOR", label: "Coordinator" },
];

const NON_TEACHING_ROLES = [
  { value: "GUARD", label: "Guard / Security" },
  { value: "DRIVER", label: "Driver" },
  { value: "CLEANING_STAFF", label: "Cleaning Staff" },
  { value: "HOUSEKEEPING_STAFF", label: "Housekeeping Staff" },
  { value: "OFFICE_STAFF", label: "Office Staff" },
  { value: "ADMIN_STAFF", label: "Admin Staff" },
  { value: "ACCOUNTANT", label: "Accountant" },
  { value: "SUPPORT_STAFF", label: "Support Staff" },
  { value: "OTHER", label: "Other Non-Teaching Staff" },
];

const ALL_ROLES = [...TEACHING_ROLES, ...NON_TEACHING_ROLES];

const ACCOUNT_REQUIRED_ROLES = [
  "TEACHER",
  "PRINCIPAL",
  "VICE_PRINCIPAL",
  "COORDINATOR",
  "ADMIN_STAFF",
  "OFFICE_STAFF",
  "ACCOUNTANT",
];

const LOGIN_ROLES = [
  { value: "TEACHER", label: "Teacher" },
  { value: "ADMIN", label: "Admin (school office)" },
  { value: "PRINCIPAL", label: "Principal" },
  { value: "ACCOUNTANT", label: "Accountant" },
];
const ROLE_ACCESS: Record<string, string> = {
  TEACHER: "Their classes: marks, attendance and homework.",
  ADMIN: "The office console: admissions, records, fee counter. Can't enter marks.",
  PRINCIPAL: "Sees everything, runs academics, approves leave and publishes results; reads fees but doesn't collect. Can't enter marks.",
  ACCOUNTANT: "Fees, day book and expenses; views students. Can't enter marks.",
  SUPER_ADMIN: "Full control, including fee setup, discounts, staff accounts and backups. At most 2 Super Admins; the last one can't be removed.",
};
// Editing an existing staff member can also make them Super Admin (limits are checked on save).
const EDIT_LOGIN_ROLES = [...LOGIN_ROLES, { value: "SUPER_ADMIN", label: "Super Admin" }];
const roleLabel = (role?: string) => (role === "SUPER_ADMIN" ? "Super Admin" : LOGIN_ROLES.find((r) => r.value === role)?.label ?? role ?? "—");

// The usual login role for a designation (backend staff/service.ts loginRoleFor).
const usualLoginRole = (category?: string) =>
  category === "PRINCIPAL" ? "PRINCIPAL" : category === "ACCOUNTANT" ? "ACCOUNTANT" : category === "ADMIN_STAFF" || category === "OFFICE_STAFF" ? "ADMIN" : "TEACHER";

const Hint = ({ children }: { children: React.ReactNode }) => (
  <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: "0.82rem", color: "var(--erp-text-muted)" }}>{children}</p>
);

const isAccountRequiredRole = (role?: string) => {
  if (!role) return true;
  return ACCOUNT_REQUIRED_ROLES.includes(role);
};

const getRoleDetails = (category?: string | null) => {
  const cat = category?.toUpperCase() || "TEACHER";
  const found = ALL_ROLES.find((r) => r.value === cat);
  const isTeaching = ["TEACHER", "PRINCIPAL", "VICE_PRINCIPAL", "COORDINATOR"].includes(cat);
  return {
    value: cat,
    label: found ? found.label : cat.replace("_", " "),
    group: isTeaching ? ("Teaching" as const) : ("Non-Teaching" as const),
  };
};

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message) return data.message;
  }
  return fallback;
};

const StaffPage = () => {
  const { data: staffList, isLoading, isError } = useGetStaffListQuery();
  const [createStaff, { isLoading: isCreating }] = useCreateStaffMutation();
  const [updateStaff, { isLoading: isUpdating }] = useUpdateStaffMutation();
  const [setStaffActive] = useSetStaffActiveMutation();
  const { printStaff } = useIdCards();
  const isSuperAdmin = useAppSelector((s) => s.auth.user?.role) === "SUPER_ADMIN";
  const [newDetails, setNewDetails] = useState<StaffDetailsForm>(emptyStaffDetails);
  const [editDetails, setEditDetails] = useState<StaffDetailsForm>(emptyStaffDetails);
  const [resetFor, setResetFor] = useState<IStaff | null>(null);
  const [examCoordinator, setExamCoordinator] = useState(false);
  // New staff: follows the designation until someone picks a role.
  const [newLoginRole, setNewLoginRole] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<IStaff | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryGroup, setCategoryGroup] = useState<"ALL" | "TEACHING" | "NON_TEACHING">("ALL");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Staff Profile Edit Form State
  const [profileStaff, setProfileStaff] = useState<IStaff | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    contact: "",
    qualifications: "",
    group: "TEACHING" as "TEACHING" | "NON_TEACHING",
    staffCategory: "TEACHER",
    loginRole: "TEACHER",
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<StaffFormInputs>({
    defaultValues: {
      group: "TEACHING",
      staffCategory: "TEACHER",
    },
  });

  const selectedGroup = watch("group");

  const closeModal = () => {
    setIsModalOpen(false);
    reset();
    setNewDetails(emptyStaffDetails);
    setNewLoginRole(null);
  };

  const openProfile = (staff: IStaff) => {
    setProfileStaff(staff);
    setEditDetails(detailsFromStaff(staff));
    setExamCoordinator(!!staff.isExamCoordinator);
    const details = getRoleDetails(staff.staffCategory);
    setEditForm({
      name: staff.user.name || "",
      email: staff.user.email || "",
      contact: staff.contact || "",
      qualifications: staff.qualifications || "",
      group: details.group === "Teaching" ? "TEACHING" : "NON_TEACHING",
      staffCategory: details.value,
      loginRole: staff.user.role ?? "TEACHER",
    });
  };

  const closeProfile = () => {
    setProfileStaff(null);
  };

  const canHaveLoginRole = isAccountRequiredRole(editForm.staffCategory);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileStaff) return;
    try {
      await updateStaff({
        id: profileStaff.id,
        details: {
          name: editForm.name,
          email: editForm.email,
          contact: editForm.contact,
          qualifications: editForm.qualifications,
          staffCategory: editForm.staffCategory,
          ...(isSuperAdmin ? { isExamCoordinator: examCoordinator } : {}),
          ...(isSuperAdmin && canHaveLoginRole ? { loginRole: editForm.loginRole } : {}),
          ...detailsPayload(editDetails, { includeSensitive: isSuperAdmin, onlyFilled: false }),
        },
      }).unwrap();
      const roleChanged = canHaveLoginRole && editForm.loginRole !== profileStaff.user.role;
      toast.success(roleChanged ? "Saved. The new login role applies within 15 minutes." : "Staff profile updated successfully");
      closeProfile();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update staff profile"));
    }
  };

  const onSubmit = async (values: StaffFormInputs) => {
    const needsAccount = isAccountRequiredRole(values.staffCategory);
    if (needsAccount && (!values.email || !values.email.trim())) {
      toast.error("Email address is required for Teaching & Admin staff accounts");
      return;
    }

    try {
      await createStaff({
        email: values.email?.trim() || undefined,
        password: values.password || undefined,
        name: values.name,
        qualifications: values.qualifications || undefined,
        contact: values.contact || undefined,
        staffCategory: values.staffCategory,
        ...(needsAccount ? { loginRole: newLoginRole ?? usualLoginRole(values.staffCategory) } : {}),
        ...detailsPayload(newDetails, { includeSensitive: isSuperAdmin, onlyFilled: true }),
      }).unwrap();
      toast.success(needsAccount ? "Staff member created with portal login access" : "Support staff record created (No Portal Access)");
      closeModal();
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to create staff member"));
    }
  };

  const setActive = async (staff: IStaff, isActive: boolean) => {
    setTogglingId(staff.id);
    try {
      await setStaffActive({ id: staff.id, isActive }).unwrap();
      toast.success(isActive ? "Staff member activated" : "Staff member deactivated");
      if (profileStaff && profileStaff.id === staff.id) {
        setProfileStaff({ ...profileStaff, isActive });
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update staff status"));
    } finally {
      setTogglingId(null);
    }
  };

  const handleToggleActive = (staff: IStaff) => {
    if (staff.isActive) {
      setPendingDeactivate(staff);
    } else {
      setActive(staff, true);
    }
  };

  // Filtered Staff Calculation
  const filteredStaff = useMemo(() => {
    if (!staffList) return [];
    return staffList.filter((staff) => {
      const details = getRoleDetails(staff.staffCategory);

      // Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = staff.user.name?.toLowerCase().includes(q);
        const emailMatch = staff.user.email?.toLowerCase().includes(q);
        const contactMatch = staff.contact?.toLowerCase().includes(q) || staff.employeeCode?.toLowerCase().includes(q);
        const roleMatch = details.label.toLowerCase().includes(q) || details.group.toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !contactMatch && !roleMatch) return false;
      }

      // Group Filter (Teaching vs Non-Teaching)
      if (categoryGroup === "TEACHING" && details.group !== "Teaching") return false;
      if (categoryGroup === "NON_TEACHING" && details.group !== "Non-Teaching") return false;

      // Role Filter
      if (selectedRoleFilter !== "ALL" && details.value !== selectedRoleFilter) return false;

      // Status Filter
      if (statusFilter === "ACTIVE" && !staff.isActive) return false;
      if (statusFilter === "INACTIVE" && staff.isActive) return false;

      return true;
    });
  }, [staffList, searchQuery, categoryGroup, selectedRoleFilter, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    if (!staffList) return { total: 0, teaching: 0, nonTeaching: 0, active: 0 };
    return {
      total: staffList.length,
      teaching: staffList.filter((s) => getRoleDetails(s.staffCategory).group === "Teaching").length,
      nonTeaching: staffList.filter((s) => getRoleDetails(s.staffCategory).group === "Non-Teaching").length,
      active: staffList.filter((s) => s.isActive).length,
    };
  }, [staffList]);

  const columns: TableColumn<IStaff>[] = [
    {
      key: "name",
      label: "Name & Email",
      render: (row) => {
        const isInternal = row.user.email?.endsWith(".internal");
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
            <strong style={{ color: "var(--erp-text)", cursor: "pointer" }} onClick={() => openProfile(row)}>
              {row.user.name ?? "—"}
            </strong>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              {row.employeeCode ? `${row.employeeCode} · ` : ""}
              {isInternal ? "No Login Email (Record Only)" : row.user.email}
            </span>
          </div>
        );
      },
    },
    {
      key: "category",
      label: "Designation & login",
      render: (row) => {
        const details = getRoleDetails(row.staffCategory);
        const needsAccount = isAccountRequiredRole(details.value);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
            <span style={{ fontWeight: 600, color: "var(--erp-text)", fontSize: "0.9rem" }}>
              {details.label}
            </span>
            <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
              {details.group} Staff • {needsAccount ? `Login: ${roleLabel(row.user.role)}` : "No login"}
            </span>
          </div>
        );
      },
    },
    { key: "qualifications", label: "Qualifications", render: (row) => row.qualifications ?? "—" },
    { key: "contact", label: "Contact", render: (row) => row.contact ?? "—" },
    {
      key: "status",
      label: "Status",
      render: (row) =>
        row.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>,
    },
    {
      key: "actions",
      label: "Actions",
      width: "12rem",
      render: (row) => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <Button variant="outline" size="sm" onClick={() => openProfile(row)}>
            Edit Profile
          </Button>
          <Button
            variant={row.isActive ? "outline" : "primary"}
            size="sm"
            isLoading={togglingId === row.id}
            onClick={() => handleToggleActive(row)}
          >
            {row.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <PageHeader
        title="Staff Directory"
        subtitle="Manage teaching staff (Teachers, Principals, Coordinators) and non-teaching staff (Guard, Driver, Cleaning, etc.)"
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
            <Button
              variant="outline"
              onClick={() => {
                // Cards for the staff in the list as filtered, currently employed only.
                const list = filteredStaff.filter((s) => s.isActive);
                if (list.length === 0) return void toast.info("No active staff in the list to print.");
                printStaff(list);
              }}
            >
              Print ID cards
            </Button>
            {isSuperAdmin && <ExportButton path="staff" size="md" />}
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>
              + New Staff
            </Button>
          </div>
        }
      />

      {/* Summary Stat Cards */}
      <div className={styles.statsGrid}>
        <StatCard label="Total Staff" value={stats.total} />
        <StatCard label="Teaching Staff" value={stats.teaching} />
        <StatCard label="Non-Teaching Staff" value={stats.nonTeaching} />
        <StatCard label="Active Accounts" value={stats.active} />
      </div>

      {/* Search & Filtering Bar */}
      <div className={styles.filterCard}>
        <div className={styles.filterHeader}>
          {/* Category Group Tabs */}
          <div className={styles.tabGroup}>
            <button
              className={`${styles.tab} ${categoryGroup === "ALL" ? styles.tabActive : ""}`}
              onClick={() => {
                setCategoryGroup("ALL");
                setSelectedRoleFilter("ALL");
              }}
            >
              All Staff ({stats.total})
            </button>
            <button
              className={`${styles.tab} ${categoryGroup === "TEACHING" ? styles.tabActive : ""}`}
              onClick={() => {
                setCategoryGroup("TEACHING");
                setSelectedRoleFilter("ALL");
              }}
            >
              Teaching ({stats.teaching})
            </button>
            <button
              className={`${styles.tab} ${categoryGroup === "NON_TEACHING" ? styles.tabActive : ""}`}
              onClick={() => {
                setCategoryGroup("NON_TEACHING");
                setSelectedRoleFilter("ALL");
              }}
            >
              Non-Teaching ({stats.nonTeaching})
            </button>
          </div>

          <div className={styles.controlsRow}>
            {/* Search Box */}
            <div className={styles.searchBox}>
              <Input
                placeholder="Search staff by name, email, contact, designation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Specific Role Dropdown */}
            <div className={styles.filterSelect}>
              <Select
                value={selectedRoleFilter}
                onChange={(e) => setSelectedRoleFilter(e.target.value)}
                options={[
                  { label: "All designations", value: "ALL" },
                  ...(categoryGroup !== "NON_TEACHING" ? TEACHING_ROLES : []),
                  ...(categoryGroup !== "TEACHING" ? NON_TEACHING_ROLES : []),
                ]}
              />
            </div>

            {/* Status Dropdown */}
            <div className={styles.filterSelect}>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                options={[
                  { label: "All Status", value: "ALL" },
                  { label: "Active Only", value: "ACTIVE" },
                  { label: "Inactive Only", value: "INACTIVE" },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <EmptyState title="Couldn't load staff" description="Please try refreshing the page." />
      ) : !staffList || staffList.length === 0 ? (
        <EmptyState
          title="No staff members yet"
          description="Add your first staff member to get started."
          action={
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>
              + New Staff
            </Button>
          }
        />
      ) : filteredStaff.length === 0 ? (
        <EmptyState
          title="No staff members match your filter"
          description="Try adjusting your search criteria or category filter."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setCategoryGroup("ALL");
                setSelectedRoleFilter("ALL");
                setStatusFilter("ALL");
              }}
            >
              Reset Filters
            </Button>
          }
        />
      ) : (
        <Table columns={columns} data={filteredStaff} keyField="id" />
      )}

      {/* New Staff Creation Modal */}
      {isModalOpen && (
        <Modal title="New Staff Member" onClose={closeModal}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FormSection title="Staff Details">
              <FormGrid>
                <Input
                  label="Full Name"
                  required
                  error={errors.name?.message}
                  {...register("name", { required: "Name is required" })}
                />

                <Select
                  label="Staff Category Group"
                  required
                  value={selectedGroup}
                  onChange={(e) => {
                    const grp = e.target.value as "TEACHING" | "NON_TEACHING";
                    setValue("group", grp);
                    setValue("staffCategory", grp === "TEACHING" ? "TEACHER" : "GUARD");
                  }}
                  options={[
                    { label: "Teaching Staff (Teacher, Principal, Coordinator...)", value: "TEACHING" },
                    { label: "Non-Teaching Staff (Guard, Driver, Cleaning, Office, Admin...)", value: "NON_TEACHING" },
                  ]}
                />

                <Select
                  label="Designation"
                  required
                  error={errors.staffCategory?.message}
                  {...register("staffCategory", { required: "Designation is required" })}
                  options={selectedGroup === "TEACHING" ? TEACHING_ROLES : NON_TEACHING_ROLES}
                />
                {isAccountRequiredRole(watch("staffCategory") || "TEACHER") ? (
                  <>
                    <Select
                      label="Login role"
                      required
                      value={newLoginRole ?? usualLoginRole(watch("staffCategory") || "TEACHER")}
                      onChange={(e) => setNewLoginRole(e.target.value)}
                      options={LOGIN_ROLES}
                    />
                    <Hint>{ROLE_ACCESS[newLoginRole ?? usualLoginRole(watch("staffCategory") || "TEACHER")]}</Hint>
                  </>
                ) : (
                  <Hint>No login.</Hint>
                )}

                {(() => {
                  const currentRole = watch("staffCategory") || "TEACHER";
                  const needsAccount = isAccountRequiredRole(currentRole);
                  return (
                    <>
                      <Input
                        label={needsAccount ? "Email Address (Portal Username) *" : "Email Address (Optional)"}
                        type="email"
                        placeholder={needsAccount ? "e.g. teacher@school.com" : "Optional for support staff"}
                        required={needsAccount}
                        error={errors.email?.message}
                        {...register("email", {
                          required: needsAccount ? "Email is required for portal access accounts" : false,
                        })}
                      />

                      <Input
                        label={needsAccount ? "Portal Password *" : "Portal Password (Optional)"}
                        type="password"
                        placeholder={needsAccount ? "Set login password" : "Default generated if left blank"}
                        required={needsAccount}
                        error={errors.password?.message}
                        {...register("password", {
                          required: needsAccount ? "Password is required for portal access accounts" : false,
                        })}
                      />
                    </>
                  );
                })()}

                <Input label="Qualifications" placeholder="e.g. B.Ed, M.Sc, High School" {...register("qualifications")} />
                <Input label="Contact Number" placeholder="e.g. +91 9876543210" {...register("contact")} />

                {(() => {
                  const currentRole = watch("staffCategory") || "TEACHER";
                  const needsAccount = isAccountRequiredRole(currentRole);
                  return (
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        fontSize: "0.78rem",
                        color: "var(--text-secondary)",
                        marginTop: "0.25rem",
                        lineHeight: 1.4,
                      }}
                    >
                      * <strong>Account Note:</strong>{" "}
                      {needsAccount
                        ? "Portal Login Access is enabled for Teaching & Admin Staff."
                        : "Employee Record Only. No portal login credentials are generated for operational staff."}
                    </div>
                  );
                })()}
              </FormGrid>
            </FormSection>
            <StaffDetailsFields value={newDetails} onChange={setNewDetails} showSensitive={isSuperAdmin} isNew />
            <div className={styles.formActions}>
              <Button type="button" variant="ghost" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={isCreating}>
                Create Staff
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Interactive Edit Staff Member Modal */}
      {profileStaff && (
        <Modal title="Edit Staff Profile" onClose={closeProfile}>
          <form onSubmit={handleSaveProfile}>
            <div className={styles.profileCard}>
              <div className={styles.profileHeader}>
                <div className={styles.avatar}>
                  {editForm.name ? editForm.name.charAt(0).toUpperCase() : "S"}
                </div>
                <div className={styles.profileMeta}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
                    <span className={styles.profileName}>{editForm.name || "Staff Member"}</span>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                      ({profileStaff.employeeCode ?? `STF-${profileStaff.id}`})
                    </span>
                  </div>
                  <div className={styles.profileEmail}>{editForm.email}</div>
                  <div style={{ marginTop: "0.35rem", display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
                    <Badge tone="neutral">
                      {editForm.group === "TEACHING" ? "Teaching Staff" : "Non-Teaching Staff"}
                    </Badge>
                    <Badge tone={profileStaff.isActive ? "success" : "neutral"} dot>
                      {profileStaff.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </div>

              <FormSection title="Edit Staff Information">
                <FormGrid>
                  <Input
                    label="Full Name"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                  <Input
                    label="Email Address"
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  />
                  <Input
                    label="Contact Number"
                    placeholder="e.g. +91 9876543210"
                    value={editForm.contact}
                    onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })}
                  />
                  <Input
                    label="Qualifications"
                    placeholder="e.g. B.Ed, M.Sc"
                    value={editForm.qualifications}
                    onChange={(e) => setEditForm({ ...editForm, qualifications: e.target.value })}
                  />

                  <Select
                    label="Staff Category Group"
                    required
                    value={editForm.group}
                    onChange={(e) => {
                      const grp = e.target.value as "TEACHING" | "NON_TEACHING";
                      setEditForm({
                        ...editForm,
                        group: grp,
                        staffCategory: grp === "TEACHING" ? "TEACHER" : "GUARD",
                      });
                    }}
                    options={[
                      { label: "Teaching Staff (Teacher, Principal, Coordinator...)", value: "TEACHING" },
                      { label: "Non-Teaching Staff (Guard, Driver, Cleaning...)", value: "NON_TEACHING" },
                    ]}
                  />

                  <Select
                    label="Designation"
                    required
                    value={editForm.staffCategory}
                    onChange={(e) => setEditForm({ ...editForm, staffCategory: e.target.value })}
                    options={editForm.group === "TEACHING" ? TEACHING_ROLES : NON_TEACHING_ROLES}
                  />
                  {!isAccountRequiredRole(editForm.staffCategory) ? (
                    <Hint>No login.</Hint>
                  ) : (
                    <>
                      <Select
                        label="Login role"
                        required
                        disabled={!isSuperAdmin}
                        value={editForm.loginRole}
                        onChange={(e) => setEditForm({ ...editForm, loginRole: e.target.value })}
                        options={EDIT_LOGIN_ROLES}
                      />
                      <Hint>
                        {ROLE_ACCESS[editForm.loginRole]}
                        {editForm.loginRole !== "SUPER_ADMIN" && usualLoginRole(editForm.staffCategory) !== editForm.loginRole && ` The usual role for a ${getRoleDetails(editForm.staffCategory).label} is ${roleLabel(usualLoginRole(editForm.staffCategory))}.`}
                      </Hint>
                    </>
                  )}
                </FormGrid>
              </FormSection>

              <StaffDetailsFields value={editDetails} onChange={setEditDetails} showSensitive={isSuperAdmin} />

              {isSuperAdmin && isAccountRequiredRole(editForm.staffCategory) && editForm.loginRole === "TEACHER" && (
                <FormSection title="Permissions">
                  <label style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", cursor: "pointer", fontSize: "0.9rem" }}>
                    <input type="checkbox" checked={examCoordinator} onChange={(e) => setExamCoordinator(e.target.checked)} style={{ marginTop: 3 }} />
                    <span>
                      <strong>Exam coordinator</strong>
                      <br />
                      <span style={{ color: "var(--erp-text-muted)", fontSize: "0.84rem" }}>
                        Can plan exams for all classes, set max marks, date sheets and admit cards, set marks deadlines and lock marks. Publishing stays with the Super Admin and Principal.
                      </span>
                    </span>
                  </label>
                </FormSection>
              )}

              <div className={styles.formActions} style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Button
                  type="button"
                  variant={profileStaff.isActive ? "outline" : "primary"}
                  onClick={() => {
                    handleToggleActive(profileStaff);
                  }}
                >
                  {profileStaff.isActive ? "Deactivate" : "Activate"}
                </Button>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  <Button type="button" variant="outline" onClick={() => printStaff([profileStaff])}>
                    Print ID card
                  </Button>
                  {isSuperAdmin && isAccountRequiredRole(profileStaff.staffCategory ?? undefined) && (
                    <Button type="button" variant="outline" onClick={() => setResetFor(profileStaff)}>
                      Reset password
                    </Button>
                  )}
                  <Button type="button" variant="ghost" onClick={closeProfile}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" isLoading={isUpdating}>
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmation Dialog for Deactivation */}
      {pendingDeactivate && (
        <ConfirmDialog
          title="Deactivate staff member?"
          message={`${pendingDeactivate.user.name} will no longer be able to sign in. You can reactivate this account any time.`}
          confirmLabel="Deactivate"
          tone="danger"
          isLoading={togglingId === pendingDeactivate.id}
          onCancel={() => setPendingDeactivate(null)}
          onConfirm={async () => {
            await setActive(pendingDeactivate, false);
            setPendingDeactivate(null);
          }}
        />
      )}
      {resetFor && <ResetPasswordModal staff={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  );
};

export default StaffPage;
