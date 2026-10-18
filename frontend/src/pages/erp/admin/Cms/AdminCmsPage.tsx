import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  PageHeader,
  Button,
  Card,
  Table,
  Badge,
  Modal,
  Input,
  Select,
  Icon,
  Spinner,
  EmptyState,
  ImageUpload,
} from "../../../../components/ui";
import type { TableColumn } from "../../../../components/ui";
import {
  useGetCmsSettingsQuery,
  useUpdateCmsSettingsMutation,
  useGetCmsFacilitiesQuery,
  useCreateCmsFacilityMutation,
  useUpdateCmsFacilityMutation,
  useDeleteCmsFacilityMutation,
  useGetCmsNoticesQuery,
  useCreateCmsNoticeMutation,
  useUpdateCmsNoticeMutation,
  useDeleteCmsNoticeMutation,
  useGetAdmissionInquiriesQuery,
  useUpdateInquiryStatusMutation,
  type IWebsiteSetting,
  type IWebsiteFacility,
  type IWebsitePublicNotice,
  type IAdmissionInquiry,
} from "../../../../store/api/cms.api";
import styles from "./AdminCmsPage.module.css";

type CmsTab = "settings" | "facilities" | "notices" | "inquiries";

const AdminCmsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<CmsTab>("settings");

  // ==================== TAB 1: SETTINGS ====================
  const { data: settingsData, isLoading: isLoadingSettings } = useGetCmsSettingsQuery();
  const [updateSettings, { isLoading: isUpdatingSettings }] = useUpdateCmsSettingsMutation();
  const [settingsForm, setSettingsForm] = useState<Partial<IWebsiteSetting>>({});

  useEffect(() => {
    if (settingsData) {
      setSettingsForm(settingsData);
    }
  }, [settingsData]);

  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSettings(settingsForm).unwrap();
      toast.success("Website settings updated successfully!");
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to update settings");
    }
  };

  // ==================== TAB 2: FACILITIES ====================
  const { data: facilities, isLoading: isLoadingFacilities } = useGetCmsFacilitiesQuery();
  const [createFacility] = useCreateCmsFacilityMutation();
  const [updateFacility] = useUpdateCmsFacilityMutation();
  const [deleteFacility] = useDeleteCmsFacilityMutation();

  const [facilityModalOpen, setFacilityModalOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState<IWebsiteFacility | null>(null);
  const [facilityForm, setFacilityForm] = useState({
    title: "",
    description: "",
    iconName: "building",
    imageUrl: "",
    order: 0,
    isActive: true,
  });

  const openFacilityModal = (fac?: IWebsiteFacility) => {
    if (fac) {
      setEditingFacility(fac);
      setFacilityForm({
        title: fac.title,
        description: fac.description,
        iconName: fac.iconName,
        imageUrl: fac.imageUrl || "",
        order: fac.order,
        isActive: fac.isActive,
      });
    } else {
      setEditingFacility(null);
      setFacilityForm({
        title: "",
        description: "",
        iconName: "building",
        imageUrl: "",
        order: (facilities?.length || 0) + 1,
        isActive: true,
      });
    }
    setFacilityModalOpen(true);
  };

  const handleFacilitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingFacility) {
        await updateFacility({ id: editingFacility.id, data: facilityForm }).unwrap();
        toast.success("Facility updated!");
      } else {
        await createFacility(facilityForm).unwrap();
        toast.success("Facility added!");
      }
      setFacilityModalOpen(false);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to save facility");
    }
  };

  const handleDeleteFacility = async (id: number) => {
    if (window.confirm("Are you sure you want to delete this facility?")) {
      try {
        await deleteFacility(id).unwrap();
        toast.success("Facility deleted");
      } catch (err: any) {
        toast.error(err?.data?.message || "Failed to delete facility");
      }
    }
  };

  // ==================== TAB 3: NOTICES ====================
  const { data: notices, isLoading: isLoadingNotices } = useGetCmsNoticesQuery();
  const [createNotice] = useCreateCmsNoticeMutation();
  const [updateNotice] = useUpdateCmsNoticeMutation();
  const [deleteNotice] = useDeleteCmsNoticeMutation();

  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<IWebsitePublicNotice | null>(null);
  const [noticeForm, setNoticeForm] = useState({
    title: "",
    content: "",
    category: "General",
    fileUrl: "",
    isPinned: false,
    isActive: true,
  });

  const openNoticeModal = (not?: IWebsitePublicNotice) => {
    if (not) {
      setEditingNotice(not);
      setNoticeForm({
        title: not.title,
        content: not.content,
        category: not.category,
        fileUrl: not.fileUrl || "",
        isPinned: not.isPinned,
        isActive: not.isActive,
      });
    } else {
      setEditingNotice(null);
      setNoticeForm({
        title: "",
        content: "",
        category: "General",
        fileUrl: "",
        isPinned: false,
        isActive: true,
      });
    }
    setNoticeModalOpen(true);
  };

  const handleNoticeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingNotice) {
        await updateNotice({ id: editingNotice.id, data: noticeForm }).unwrap();
        toast.success("Notice updated!");
      } else {
        await createNotice(noticeForm).unwrap();
        toast.success("Notice published!");
      }
      setNoticeModalOpen(false);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to save notice");
    }
  };

  const handleDeleteNotice = async (id: number) => {
    if (window.confirm("Are you sure you want to delete this circular?")) {
      try {
        await deleteNotice(id).unwrap();
        toast.success("Notice removed");
      } catch (err: any) {
        toast.error(err?.data?.message || "Failed to delete notice");
      }
    }
  };

  // ==================== TAB 4: ADMISSION INQUIRIES ====================
  const [inquiryStatusFilter, setInquiryStatusFilter] = useState("ALL");
  const { data: inquiries, isLoading: isLoadingInquiries } = useGetAdmissionInquiriesQuery(inquiryStatusFilter);
  const [updateInquiryStatus] = useUpdateInquiryStatusMutation();

  const [selectedInquiry, setSelectedInquiry] = useState<IAdmissionInquiry | null>(null);
  const [inquiryModalOpen, setInquiryModalOpen] = useState(false);
  const [inquiryStatusForm, setInquiryStatusForm] = useState({
    status: "NEW",
    notes: "",
  });

  const openInquiryModal = (inq: IAdmissionInquiry) => {
    setSelectedInquiry(inq);
    setInquiryStatusForm({
      status: inq.status,
      notes: inq.notes || "",
    });
    setInquiryModalOpen(true);
  };

  const handleInquiryStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInquiry) return;
    try {
      await updateInquiryStatus({
        id: selectedInquiry.id,
        status: inquiryStatusForm.status,
        notes: inquiryStatusForm.notes,
      }).unwrap();
      toast.success("Inquiry status updated!");
      setInquiryModalOpen(false);
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to update inquiry");
    }
  };

  // Table Column Definitions
  const facilityColumns: TableColumn<IWebsiteFacility>[] = [
    { key: "order", label: "Order", render: (r) => <strong>#{r.order}</strong> },
    { key: "title", label: "Title", render: (r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{r.title}</div>
        <div style={{ fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>{r.description}</div>
      </div>
    ) },
    { key: "icon", label: "Icon", render: (r) => (
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <Icon name={(r.iconName as any) || "building"} size={16} />
        <span style={{ fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>{r.iconName}</span>
      </div>
    ) },
    { key: "status", label: "Status", render: (r) => (
      <Badge tone={r.isActive ? "success" : "neutral"}>
        {r.isActive ? "Active" : "Hidden"}
      </Badge>
    ) },
    { key: "actions", label: "Actions", render: (r) => (
      <div style={{ display: "flex", gap: "8px" }}>
        <Button size="sm" variant="outline" onClick={() => openFacilityModal(r)}>
          Edit
        </Button>
        <Button size="sm" variant="danger" onClick={() => handleDeleteFacility(r.id)}>
          Delete
        </Button>
      </div>
    ) },
  ];

  const noticeColumns: TableColumn<IWebsitePublicNotice>[] = [
    { key: "title", label: "Circular Title", render: (r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{r.title}</div>
        <div style={{ fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>
          {new Date(r.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </div>
      </div>
    ) },
    { key: "category", label: "Category", render: (r) => (
      <Badge tone="primary">{r.category || "General"}</Badge>
    ) },
    { key: "pinned", label: "Pinned", render: (r) => (
      r.isPinned ? <Badge tone="danger">Pinned</Badge> : <span style={{ color: "var(--erp-text-muted)" }}>—</span>
    ) },
    { key: "status", label: "Status", render: (r) => (
      <Badge tone={r.isActive ? "success" : "neutral"}>
        {r.isActive ? "Live" : "Draft"}
      </Badge>
    ) },
    { key: "actions", label: "Actions", render: (r) => (
      <div style={{ display: "flex", gap: "8px" }}>
        <Button size="sm" variant="outline" onClick={() => openNoticeModal(r)}>
          Edit
        </Button>
        <Button size="sm" variant="danger" onClick={() => handleDeleteNotice(r.id)}>
          Delete
        </Button>
      </div>
    ) },
  ];

  const inquiryColumns: TableColumn<IAdmissionInquiry>[] = [
    { key: "studentName", label: "Applicant Name", render: (r) => (
      <div>
        <div style={{ fontWeight: 600 }}>{r.studentName}</div>
        <div style={{ fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>Grade: {r.gradeApplyingFor}</div>
      </div>
    ) },
    { key: "parentName", label: "Parent Details", render: (r) => (
      <div>
        <div>{r.parentName}</div>
        <div style={{ fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>{r.phone} {r.email ? `• ${r.email}` : ""}</div>
      </div>
    ) },
    { key: "date", label: "Submitted On", render: (r) => (
      <span style={{ fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>
        {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
      </span>
    ) },
    { key: "status", label: "Status", render: (r) => {
      let tone: "primary" | "success" | "danger" | "neutral" = "primary";
      if (r.status === "ADMITTED") tone = "success";
      if (r.status === "REJECTED") tone = "danger";
      if (r.status === "CONTACTED") tone = "primary";
      if (r.status === "NEW") tone = "danger";
      return <Badge tone={tone}>{r.status}</Badge>;
    } },
    { key: "actions", label: "Actions", render: (r) => (
      <Button size="sm" variant="outline" onClick={() => openInquiryModal(r)}>
        Manage
      </Button>
    ) },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Website CMS & Content Manager"
        subtitle="Manage public school website content, campus facilities, circulars, and prospective student admission enquiries"
        actions={
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none" }}
          >
            <Button icon={<Icon name="globe" size={16} />} variant="primary">
              View Live Website
            </Button>
          </a>
        }
      />

      {/* Tabs */}
      <div className={styles.tabsContainer}>
        <button
          className={`${styles.tabBtn} ${activeTab === "settings" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          <Icon name="building" size={16} />
          <span>School Profile & Hero</span>
        </button>

        <button
          className={`${styles.tabBtn} ${activeTab === "facilities" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("facilities")}
        >
          <Icon name="layers" size={16} />
          <span>Campus Facilities</span>
        </button>

        <button
          className={`${styles.tabBtn} ${activeTab === "notices" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("notices")}
        >
          <Icon name="bell" size={16} />
          <span>Public Notices</span>
        </button>

        <button
          className={`${styles.tabBtn} ${activeTab === "inquiries" ? styles.tabBtnActive : ""}`}
          onClick={() => setActiveTab("inquiries")}
        >
          <Icon name="users" size={16} />
          <span>Admission Enquiries ({inquiries?.filter(i => i.status === "NEW").length || 0} New)</span>
        </button>
      </div>

      {/* ==================== TAB 1: SETTINGS ==================== */}
      {activeTab === "settings" && (
        <Card padded title="School Profile & Website Content">
          {isLoadingSettings ? (
            <Spinner />
          ) : (
            <form onSubmit={handleSettingsSubmit} style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <div>
                <h4 style={{ margin: "0 0 1rem 0", color: "var(--erp-text)" }}>1. Basic School Information</h4>
                <div className={styles.formGrid}>
                  <Input
                    label="School Name *"
                    value={settingsForm.schoolName || ""}
                    onChange={(e) => setSettingsForm({ ...settingsForm, schoolName: e.target.value })}
                    required
                  />

                  <Input
                    label="Tagline / Motto"
                    value={settingsForm.tagline || ""}
                    onChange={(e) => setSettingsForm({ ...settingsForm, tagline: e.target.value })}
                  />

                  <Input
                    label="Affiliation Number"
                    value={settingsForm.affiliationNo || ""}
                    onChange={(e) => setSettingsForm({ ...settingsForm, affiliationNo: e.target.value })}
                  />

                  <Input
                    label="Established Year"
                    type="number"
                    value={settingsForm.establishedYear ? String(settingsForm.establishedYear) : ""}
                    onChange={(e) => setSettingsForm({ ...settingsForm, establishedYear: Number(e.target.value) })}
                  />

                  <Input
                    label="Contact Phone Number *"
                    value={settingsForm.phone || ""}
                    onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                    required
                  />

                  <Input
                    label="Official Email Address *"
                    value={settingsForm.email || ""}
                    onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })}
                    required
                  />

                  <div className={styles.fullWidth}>
                    <Input
                      label="Campus Address *"
                      value={settingsForm.address || ""}
                      onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ margin: "0 0 1rem 0", color: "var(--erp-text)" }}>2. Hero Banner & Homepage Headlines</h4>
                <div className={styles.formGrid}>
                  <div className={styles.fullWidth}>
                    <Input
                      label="Main Hero Title *"
                      value={settingsForm.heroTitle || ""}
                      onChange={(e) => setSettingsForm({ ...settingsForm, heroTitle: e.target.value })}
                      required
                    />
                  </div>

                  <div className={styles.fullWidth}>
                    <Input
                      label="Hero Subtitle / Description"
                      value={settingsForm.heroSubtitle || ""}
                      onChange={(e) => setSettingsForm({ ...settingsForm, heroSubtitle: e.target.value })}
                    />
                  </div>

                  <Input
                    label="Primary CTA Button Label"
                    value={settingsForm.heroCtaText || ""}
                    onChange={(e) => setSettingsForm({ ...settingsForm, heroCtaText: e.target.value })}
                  />

                  <div className={styles.checkboxField} style={{ marginTop: "1.5rem" }}>
                    <input
                      type="checkbox"
                      id="admissionsOpen"
                      className={styles.checkbox}
                      checked={settingsForm.admissionsOpen !== false}
                      onChange={(e) => setSettingsForm({ ...settingsForm, admissionsOpen: e.target.checked })}
                    />
                    <label htmlFor="admissionsOpen">Admissions Currently Open (Shows live badge)</label>
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ margin: "0 0 1rem 0", color: "var(--erp-text)" }}>3. About School & Principal's Desk</h4>
                <div className={styles.formGrid}>
                  <div className={`${styles.textareaField} ${styles.fullWidth}`}>
                    <label>About Our School Narrative</label>
                    <textarea
                      className={styles.textarea}
                      value={settingsForm.aboutText || ""}
                      onChange={(e) => setSettingsForm({ ...settingsForm, aboutText: e.target.value })}
                      rows={4}
                    />
                  </div>

                  <Input
                    label="Principal Name"
                    value={settingsForm.principalName || ""}
                    onChange={(e) => setSettingsForm({ ...settingsForm, principalName: e.target.value })}
                  />

                  <div className={`${styles.textareaField} ${styles.fullWidth}`}>
                    <label>Principal's Welcome Message</label>
                    <textarea
                      className={styles.textarea}
                      value={settingsForm.principalMessage || ""}
                      onChange={(e) => setSettingsForm({ ...settingsForm, principalMessage: e.target.value })}
                      rows={4}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Button type="submit" variant="primary" disabled={isUpdatingSettings}>
                  {isUpdatingSettings ? "Saving Settings..." : "Save Website Settings"}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {/* ==================== TAB 2: FACILITIES ==================== */}
      {activeTab === "facilities" && (
        <Card
          padded
          title="Campus Facilities & Infrastructure"
          action={
            <Button icon={<Icon name="plus" size={16} />} onClick={() => openFacilityModal()}>
              Add Facility
            </Button>
          }
        >
          {isLoadingFacilities ? (
            <Spinner />
          ) : !facilities || facilities.length === 0 ? (
            <EmptyState
              title="No facilities added yet"
              description="Add campus infrastructure features like Smart Labs, Sports turf, and Library to showcase on the website."
              action={
                <Button icon={<Icon name="plus" size={16} />} onClick={() => openFacilityModal()}>
                  Add Facility
                </Button>
              }
            />
          ) : (
            <Table columns={facilityColumns} data={facilities} keyField="id" />
          )}
        </Card>
      )}

      {/* ==================== TAB 3: NOTICES ==================== */}
      {activeTab === "notices" && (
        <Card
          padded
          title="Public Circulars & Announcements"
          action={
            <Button icon={<Icon name="plus" size={16} />} onClick={() => openNoticeModal()}>
              Publish Circular
            </Button>
          }
        >
          {isLoadingNotices ? (
            <Spinner />
          ) : !notices || notices.length === 0 ? (
            <EmptyState
              title="No public notices published"
              description="Publish notices, exam schedules, and circulars to keep prospective parents and visitors informed."
              action={
                <Button icon={<Icon name="plus" size={16} />} onClick={() => openNoticeModal()}>
                  Publish Circular
                </Button>
              }
            />
          ) : (
            <Table columns={noticeColumns} data={notices} keyField="id" />
          )}
        </Card>
      )}

      {/* ==================== TAB 4: ADMISSION INQUIRIES ==================== */}
      {activeTab === "inquiries" && (
        <Card padded title="Inbound Admission Enquiries">
          <div className={styles.filtersRow}>
            {["ALL", "NEW", "CONTACTED", "ADMITTED", "REJECTED"].map((status) => (
              <button
                key={status}
                className={`${styles.filterChip} ${inquiryStatusFilter === status ? styles.filterChipActive : ""}`}
                onClick={() => setInquiryStatusFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>

          {isLoadingInquiries ? (
            <Spinner />
          ) : !inquiries || inquiries.length === 0 ? (
            <EmptyState
              title="No admission enquiries found"
              description="When prospective parents fill out the inquiry form on the public website, their submissions will appear here."
            />
          ) : (
            <Table columns={inquiryColumns} data={inquiries} keyField="id" />
          )}
        </Card>
      )}

      {/* Modal: Add/Edit Facility */}
      {facilityModalOpen && (
        <Modal
          title={editingFacility ? "Edit Campus Facility" : "Add Campus Facility"}
          onClose={() => setFacilityModalOpen(false)}
        >
          <form onSubmit={handleFacilitySubmit} className={styles.modalForm}>
            <Input
              label="Facility Title *"
              placeholder="e.g. Advanced Robotics Lab"
              value={facilityForm.title}
              onChange={(e) => setFacilityForm({ ...facilityForm, title: e.target.value })}
              required
            />

            <Select
              label="Display Icon"
              value={facilityForm.iconName}
              onChange={(e) => setFacilityForm({ ...facilityForm, iconName: e.target.value })}
              options={[
                { label: "Building / Campus (default)", value: "building" },
                { label: "Layers / STEM Lab", value: "layers" },
                { label: "Dashboard / Sports Turf", value: "dashboard" },
                { label: "Graduation Cap / Library", value: "graduationCap" },
                { label: "School Bus / Transport", value: "bus" },
                { label: "Users / Arts & Drama", value: "users" },
                { label: "Calendar / Events", value: "calendar" },
              ]}
            />

            <div className={styles.textareaField}>
              <label>Description *</label>
              <textarea
                className={styles.textarea}
                placeholder="Highlight equipment, safety, or key learning features..."
                value={facilityForm.description}
                onChange={(e) => setFacilityForm({ ...facilityForm, description: e.target.value })}
                required
              />
            </div>

            <ImageUpload
              label="Facility Photo (Cloudinary)"
              value={facilityForm.imageUrl}
              onChange={(url) => setFacilityForm({ ...facilityForm, imageUrl: url })}
              folder="school_erp/facilities"
              helperText="Upload a photo of this facility to display on the school website."
            />

            <Input
              label="Display Order (Ascending)"
              type="number"
              value={String(facilityForm.order)}
              onChange={(e) => setFacilityForm({ ...facilityForm, order: Number(e.target.value) })}
            />

            <label className={styles.checkboxField}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={facilityForm.isActive}
                onChange={(e) => setFacilityForm({ ...facilityForm, isActive: e.target.checked })}
              />
              <span>Display on live public website</span>
            </label>

            <div className={styles.modalActions}>
              <Button type="button" variant="outline" onClick={() => setFacilityModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                {editingFacility ? "Update Facility" : "Add Facility"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Add/Edit Circular */}
      {noticeModalOpen && (
        <Modal
          title={editingNotice ? "Edit Circular" : "Publish New Circular"}
          onClose={() => setNoticeModalOpen(false)}
        >
          <form onSubmit={handleNoticeSubmit} className={styles.modalForm}>
            <Input
              label="Circular Title *"
              placeholder="e.g. Schedule for Pre-Board Examinations"
              value={noticeForm.title}
              onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })}
              required
            />

            <Select
              label="Category"
              value={noticeForm.category}
              onChange={(e) => setNoticeForm({ ...noticeForm, category: e.target.value })}
              options={[
                { label: "General Notice", value: "General" },
                { label: "Academic / Exams", value: "Academic" },
                { label: "Admissions Update", value: "Admission" },
                { label: "School Event / Sports", value: "Event" },
                { label: "Holiday Announcement", value: "Holiday" },
              ]}
            />

            <div className={styles.textareaField}>
              <label>Circular Content / Details *</label>
              <textarea
                className={styles.textarea}
                placeholder="Write the full circular announcement..."
                value={noticeForm.content}
                onChange={(e) => setNoticeForm({ ...noticeForm, content: e.target.value })}
                rows={5}
                required
              />
            </div>

            <ImageUpload
              label="Circular Flyer / Attachment (Cloudinary)"
              value={noticeForm.fileUrl}
              onChange={(url) => setNoticeForm({ ...noticeForm, fileUrl: url })}
              folder="school_erp/notices"
              helperText="Upload event flyer, schedule image, or PDF circular."
            />

            <div style={{ display: "flex", gap: "2rem" }}>
              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={noticeForm.isPinned}
                  onChange={(e) => setNoticeForm({ ...noticeForm, isPinned: e.target.checked })}
                />
                <span>Pin to top of public list</span>
              </label>

              <label className={styles.checkboxField}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={noticeForm.isActive}
                  onChange={(e) => setNoticeForm({ ...noticeForm, isActive: e.target.checked })}
                />
                <span>Active / Published</span>
              </label>
            </div>

            <div className={styles.modalActions}>
              <Button type="button" variant="outline" onClick={() => setNoticeModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                {editingNotice ? "Update Circular" : "Publish Circular"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Manage Admission Inquiry */}
      {inquiryModalOpen && selectedInquiry && (
        <Modal
          title={`Manage Enquiry — ${selectedInquiry.studentName}`}
          onClose={() => setInquiryModalOpen(false)}
        >
          <form onSubmit={handleInquiryStatusSubmit} className={styles.modalForm}>
            <div style={{ background: "var(--erp-primary-50)", padding: "1rem", borderRadius: "0.5rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.88rem" }}>
                <div><strong>Grade Applying:</strong> {selectedInquiry.gradeApplyingFor}</div>
                <div><strong>Parent Name:</strong> {selectedInquiry.parentName}</div>
                <div><strong>Contact Phone:</strong> {selectedInquiry.phone}</div>
                <div><strong>Email:</strong> {selectedInquiry.email || "N/A"}</div>
                {selectedInquiry.currentSchool && (
                  <div style={{ gridColumn: "1 / -1" }}><strong>Previous School:</strong> {selectedInquiry.currentSchool}</div>
                )}
                {selectedInquiry.message && (
                  <div style={{ gridColumn: "1 / -1", marginTop: "0.5rem", color: "var(--erp-text-muted)" }}>
                    <strong>Parent Note:</strong> {selectedInquiry.message}
                  </div>
                )}
              </div>
            </div>

            <Select
              label="Application Status *"
              value={inquiryStatusForm.status}
              onChange={(e) => setInquiryStatusForm({ ...inquiryStatusForm, status: e.target.value })}
              options={[
                { label: "NEW (Pending Follow-up)", value: "NEW" },
                { label: "CONTACTED (Interview / Tour Scheduled)", value: "CONTACTED" },
                { label: "ADMITTED (Enrolled in School)", value: "ADMITTED" },
                { label: "REJECTED / WITHDRAWN", value: "REJECTED" },
              ]}
              required
            />

            <div className={styles.textareaField}>
              <label>Internal Counselor / Admin Notes</label>
              <textarea
                className={styles.textarea}
                placeholder="Log phone calls, fee discussion, campus visit impressions..."
                value={inquiryStatusForm.notes}
                onChange={(e) => setInquiryStatusForm({ ...inquiryStatusForm, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className={styles.modalActions}>
              <Button type="button" variant="outline" onClick={() => setInquiryModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Update Status
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default AdminCmsPage;
