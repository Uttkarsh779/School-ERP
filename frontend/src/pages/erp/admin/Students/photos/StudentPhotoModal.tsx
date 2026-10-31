import { useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button, Modal } from "../../../../../components/ui";
import ImageCropModal from "../../../../../components/shared/ImageCrop/ImageCropModal";
import { useUploadFileMutation } from "../../../../../store/api/upload.api";
import { useSetStudentPhotoMutation } from "../../../../../store/api/students.api";
import styles from "./StudentPhotos.module.css";

// The office sets a student's passport-style photo (used on report cards and ID cards):
// pick a picture, crop it square, save. Stored at 512×512 (about 50 KB).
const StudentPhotoModal = ({ student, onClose }: { student: { id: number; name: string; photoUrl?: string | null }; onClose: () => void }) => {
  const input = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [upload, { isLoading: uploading }] = useUploadFileMutation();
  const [setPhoto, { isLoading: saving }] = useSetStudentPhotoMutation();

  const save = async (blob: Blob) => {
    try {
      const res = await upload({ file: blob, folder: "school_erp/students" }).unwrap();
      await setPhoto({ id: student.id, photoUrl: res.data.url }).unwrap();
      toast.success("Photo saved");
      setCropFile(null);
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't save the photo");
    }
  };

  const remove = async () => {
    try {
      await setPhoto({ id: student.id, photoUrl: null }).unwrap();
      toast.success("Photo removed");
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't remove the photo");
    }
  };

  if (cropFile) {
    return <ImageCropModal file={cropFile} title={`Photo for ${student.name}`} busy={uploading || saving} onCancel={() => setCropFile(null)} onCropped={save} />;
  }

  return (
    <Modal title={`Photo · ${student.name}`} size="sm" onClose={onClose}>
      <div className={styles.single}>
        {student.photoUrl ? <img src={student.photoUrl} alt="" className={styles.bigPhoto} /> : <div className={styles.noPhoto}>No photo yet</div>}
        <p className={styles.muted}>A clear, front-facing passport-style photo on a plain background works best. It appears on report cards and ID cards.</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) setCropFile(f);
        }}
      />
      <div className={styles.actions}>
        {student.photoUrl && (
          <Button variant="ghost" isLoading={saving} onClick={remove}>
            Remove
          </Button>
        )}
        <Button onClick={() => input.current?.click()}>{student.photoUrl ? "Change photo" : "Choose photo"}</Button>
      </div>
    </Modal>
  );
};

export default StudentPhotoModal;
