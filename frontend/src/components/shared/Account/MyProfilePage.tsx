import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Spinner } from "../../ui";
import ImageCropModal from "../ImageCrop/ImageCropModal";
import ChangePasswordCard from "./ChangePasswordCard";
import { useGetMyProfileQuery, useUpdateMyProfileMutation } from "../../../store/api/profile.api";
import { useUploadFileMutation } from "../../../store/api/upload.api";
import styles from "./MyProfilePage.module.css";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  TEACHER: "Teacher",
  STUDENT: "Student",
  PARENT: "Parent",
};

const errorOf = (err: unknown, fallback: string) => (err as { data?: { message?: string } })?.data?.message ?? fallback;
const humanize = (v: string) => v.toLowerCase().split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

// "My profile" for staff (teachers, admins): photo (upload + crop to Cloudinary), basic
// details and change password. Used at /teacher/profile and /admin/profile (students use StudentProfilePage).
const MyProfilePage = () => {
  const { data: profile, isLoading, isError, refetch } = useGetMyProfileQuery();
  const [updateProfile, { isLoading: saving }] = useUpdateMyProfileMutation();
  const [uploadFile, { isLoading: uploading }] = useUploadFileMutation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [form, setForm] = useState({ name: "", contact: "", qualifications: "", address: "" });

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name,
      contact: profile.staff?.contact ?? "",
      qualifications: profile.staff?.qualifications ?? "",
      address: profile.staff?.address ?? "",
    });
  }, [profile]);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Choose an image file (JPG, PNG or WebP)");
    if (f.size > 10 * 1024 * 1024) return toast.error("Image must be under 10MB");
    setCropFile(f);
  };

  const savePhoto = async (blob: Blob) => {
    try {
      const file = new File([blob], `profile-${Date.now()}.jpg`, { type: "image/jpeg" });
      const res = await uploadFile({ file, folder: "school_erp/profiles" }).unwrap();
      await updateProfile({ photoUrl: res.data.url }).unwrap();
      toast.success("Profile photo updated");
      setCropFile(null);
    } catch (e) {
      toast.error(errorOf(e, "Couldn't update the photo"));
    }
  };

  const removePhoto = async () => {
    try {
      await updateProfile({ photoUrl: null }).unwrap();
      toast.success("Photo removed");
    } catch (e) {
      toast.error(errorOf(e, "Couldn't remove the photo"));
    }
  };

  const saveDetails = async () => {
    if (form.name.trim().length < 2) return toast.error("Name must be at least 2 characters");
    try {
      await updateProfile({
        name: form.name.trim(),
        ...(profile?.staff
          ? { contact: form.contact.trim() || null, qualifications: form.qualifications.trim() || null, address: form.address.trim() || null }
          : {}),
      }).unwrap();
      toast.success("Details saved");
    } catch (e) {
      toast.error(errorOf(e, "Couldn't save your details"));
    }
  };

  if (isLoading) {
    return (
      <div className={styles.page}>
        <PageHeader title="My Profile" />
        <Spinner />
      </div>
    );
  }
  if (isError || !profile) {
    return (
      <div className={styles.page}>
        <PageHeader title="My Profile" />
        <EmptyState title="Couldn't load your profile" action={<Button variant="outline" onClick={() => refetch()}>Retry</Button>} />
      </div>
    );
  }

  const dirty =
    form.name !== profile.name ||
    (profile.staff &&
      (form.contact !== (profile.staff.contact ?? "") ||
        form.qualifications !== (profile.staff.qualifications ?? "") ||
        form.address !== (profile.staff.address ?? "")));

  return (
    <div className={styles.page}>
      <PageHeader title="My Profile" subtitle="Your photo, contact details and password" />

      <Card>
        <div className={styles.hero}>
          <div className={styles.photoWrap}>
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt={profile.name} className={styles.photo} />
            ) : (
              <div className={styles.avatar}>{profile.name.charAt(0).toUpperCase()}</div>
            )}
          </div>
          <div className={styles.heroMain}>
            <h2 className={styles.name}>{profile.name}</h2>
            <div className={styles.meta}>
              <Badge tone="primary">{ROLE_LABEL[profile.role] ?? profile.role}</Badge>
              {profile.staff && <Badge tone="neutral">{humanize(profile.staff.staffCategory)}</Badge>}
              <span>{profile.email}</span>
            </div>
            {profile.canEditPhoto && (
              <div className={styles.photoActions}>
                <Button size="sm" onClick={() => fileInput.current?.click()} isLoading={uploading && !cropFile}>
                  {profile.photoUrl ? "Change photo" : "Upload photo"}
                </Button>
                {profile.photoUrl && (
                  <Button size="sm" variant="ghost" onClick={removePhoto} disabled={saving}>
                    Remove
                  </Button>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onChange={(e) => {
                    pickFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className={styles.grid}>
        <Card title="Basic details" subtitle={profile.canEditDetails ? "Your email and role are managed by the school office" : undefined}>
          <div className={styles.form}>
            <Input label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!profile.canEditDetails} />
            <Input label="Email (sign-in)" value={profile.email} disabled />
            {profile.staff && (
              <>
                <Input label="Phone number" inputMode="tel" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="e.g. 98765 43210" />
                <Input label="Qualifications" value={form.qualifications} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} placeholder="e.g. M.Sc. Mathematics, B.Ed" />
                <Input label="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </>
            )}
            {profile.canEditDetails && (
              <div className={styles.formActions}>
                <Button onClick={saveDetails} isLoading={saving} disabled={!dirty}>
                  Save details
                </Button>
              </div>
            )}
          </div>
        </Card>

        <div className={styles.side}>
          <ChangePasswordCard />
          {profile.staff && (profile.staff.classTeacherOf.length > 0 || profile.staff.teaches.length > 0) && (
            <Card title="My classes">
              {profile.staff.classTeacherOf.length > 0 && (
                <p className={styles.line}>
                  <strong>Class teacher of:</strong> {profile.staff.classTeacherOf.join(", ")}
                </p>
              )}
              {profile.staff.teaches.length > 0 && (
                <p className={styles.line}>
                  <strong>Teaches:</strong> {profile.staff.teaches.join(", ")}
                </p>
              )}
            </Card>
          )}
        </div>
      </div>

      {cropFile && <ImageCropModal file={cropFile} busy={uploading || saving} onCancel={() => setCropFile(null)} onCropped={savePhoto} />}
    </div>
  );
};

export default MyProfilePage;
