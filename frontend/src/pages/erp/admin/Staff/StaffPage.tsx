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
import styles from "./StaffPage.module.css";

interface StaffFormInputs {
  name: string;
  email: string;
  password: string;
  qualifications?: string;
  contact?: string;
  group: "TEACHING" | "NON_TEACHING";
  staffCategory: string;
}

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
];

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
  };

  const openProfile = (staff: IStaff) => {
    setProfileStaff(staff);
    const details = getRoleDetails(staff.staffCategory);
    setEditForm({
      name: staff.user.name || "",
      email: staff.user.email || "",
      contact: staff.contact || "",
      qualifications: staff.qualifications || "",
      group: details.group === "Teaching" ? "TEACHING" : "NON_TEACHING",
      staffCategory: details.value,
    });
  };

  const closeProfile = () => {
    setProfileStaff(null);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileStaff) return;
    try {
      await updateStaff({
        id: profileStaff.id,
        name: editForm.name,
        email: editForm.email,
        contact: editForm.contact,
        qualifications: editForm.qualifications,
        staffCategory: editForm.staffCategory,
      }).unwrap();
      toast.success("Staff profile updated successfully");
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
        setProfileStaff({
          ...profileStaff,
          user: { ...profileStaff.user, isActive },
        });
      }
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to update staff status"));
    } finally {
      setTogglingId(null);
    }
  };

  const handleToggleActive = (staff: IStaff) => {
    if (staff.user.isActive) {
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
        const contactMatch = staff.contact?.toLowerCase().includes(q);
        const roleMatch = details.label.toLowerCase().includes(q) || details.group.toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !contactMatch && !roleMatch) return false;
      }

      // Group Filter (Teaching vs Non-Teaching)
      if (categoryGroup === "TEACHING" && details.group !== "Teaching") return false;
      if (categoryGroup === "NON_TEACHING" && details.group !== "Non-Teaching") return false;

      // Role Filter
      if (selectedRoleFilter !== "ALL" && details.value !== selectedRoleFilter) return false;

      // Status Filter
      if (statusFilter === "ACTIVE" && !staff.user.isActive) return false;
      if (statusFilter === "INACTIVE" && staff.user.isActive) return false;

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
      active: staffList.filter((s) => s.user.isActive).length,
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
              {isInternal ? "No Login Email (Record Only)" : row.user.email}
            </span>
          </div>
        );
      },
    },
    {
      key: "category",
      label: "Designation / Category",
      render: (row) => {
        const details = getRoleDetails(row.staffCategory);
        const needsAccount = isAccountRequiredRole(details.value);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
            <span style={{ fontWeight: 600, color: "var(--erp-text)", fontSize: "0.9rem" }}>
              {details.label}
            </span>
            <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
              {details.group} Staff • {needsAccount ? "Portal Account" : "Record Only"}
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
        row.user.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>,
    },
    {
      key: "actions",
      label: "Actions",
      width: "12rem",
      render: (row) => (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Button variant="outline" size="sm" onClick={() => openProfile(row)}>
            Edit Profile
          </Button>
          <Button
            variant={row.user.isActive ? "outline" : "primary"}
            size="sm"
            isLoading={togglingId === row.id}
            onClick={() => handleToggleActive(row)}
          >
            {row.user.isActive ? "Deactivate" : "Activate"}
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
          <Button variant="primary" onClick={() => setIsModalOpen(true)}>
            + New Staff
          </Button>
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
                placeholder="Search staff by name, email, contact, role..."
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
                  { label: "All Roles", value: "ALL" },
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
                  label="Role / Designation"
                  required
                  error={errors.staffCategory?.message}
                  {...register("staffCategory", { required: "Role is required" })}
                  options={selectedGroup === "TEACHING" ? TEACHING_ROLES : NON_TEACHING_ROLES}
                />

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
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span className={styles.profileName}>{editForm.name || "Staff Member"}</span>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                      (STF-{profileStaff.id})
                    </span>
                  </div>
                  <div className={styles.profileEmail}>{editForm.email}</div>
                  <div style={{ marginTop: "0.35rem", display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    <Badge tone="neutral">
                      {editForm.group === "TEACHING" ? "Teaching Staff" : "Non-Teaching Staff"}
                    </Badge>
                    <Badge tone={profileStaff.user.isActive ? "success" : "neutral"} dot>
                      {profileStaff.user.isActive ? "Active Account" : "Inactive Account"}
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
                    label="Role / Designation"
                    required
                    value={editForm.staffCategory}
                    onChange={(e) => setEditForm({ ...editForm, staffCategory: e.target.value })}
                    options={editForm.group === "TEACHING" ? TEACHING_ROLES : NON_TEACHING_ROLES}
                  />
                </FormGrid>
              </FormSection>

              <div className={styles.formActions} style={{ justifyContent: "space-between", alignItems: "center" }}>
                <Button
                  type="button"
                  variant={profileStaff.user.isActive ? "outline" : "primary"}
                  onClick={() => {
                    handleToggleActive(profileStaff);
                  }}
                >
                  {profileStaff.user.isActive ? "Deactivate Account" : "Activate Account"}
                </Button>
                <div style={{ display: "flex", gap: "0.5rem" }}>
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
    </div>
  );
};

export default StaffPage;
