import React, { useRef } from "react";
import { toast } from "react-toastify";
import Icon from "../Icon/Icon";
import Spinner from "../Spinner/Spinner";
import { useUploadFileMutation } from "../../../store/api/upload.api";
import styles from "./ImageUpload.module.css";

interface ImageUploadProps {
  label?: string;
  value?: string;
  onChange: (url: string) => void;
  folder?: string;
  accept?: string;
  helperText?: string;
}

const ImageUpload: React.FC<ImageUploadProps> = ({
  label,
  value,
  onChange,
  folder = "school_erp/cms",
  accept = "image/jpeg,image/png,image/webp,image/gif",
  helperText = "PNG, JPG, or WebP up to 10MB. Hosted securely on Cloudinary.",
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadFile, { isLoading }] = useUploadFileMutation();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10MB limit.");
      return;
    }

    try {
      const res = await uploadFile({ file, folder }).unwrap();
      if (res.data?.url) {
        onChange(res.data.url);
        toast.success("Image uploaded to Cloudinary!");
      }
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to upload image to Cloudinary.");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isLoading) return;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10MB limit.");
      return;
    }

    try {
      const res = await uploadFile({ file, folder }).unwrap();
      if (res.data?.url) {
        onChange(res.data.url);
        toast.success("Image uploaded to Cloudinary!");
      }
    } catch (err: any) {
      toast.error(err?.data?.message || "Failed to upload image to Cloudinary.");
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className={styles.container}>
      {label && <label className={styles.label}>{label}</label>}

      {value ? (
        <div className={styles.previewContainer}>
          <img src={value} alt="Uploaded preview" className={styles.previewImage} />
          <div className={styles.previewInfo}>
            <span className={styles.badge}>
              <Icon name="check" size={12} /> Cloudinary Hosted
            </span>
            <span className={styles.urlText} title={value}>
              {value}
            </span>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                Change Image
              </button>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.removeBtn}`}
                onClick={() => onChange("")}
                disabled={isLoading}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`${styles.dropzone} ${isLoading ? styles.dropzoneDisabled : ""}`}
          onClick={() => !isLoading && fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {isLoading ? (
            <>
              <Spinner size="sm" />
              <span className={styles.primaryText}>Uploading to Cloudinary...</span>
            </>
          ) : (
            <>
              <div className={styles.uploadIconWrap}>
                <Icon name="plus" size={20} />
              </div>
              <div>
                <span className={styles.primaryText}>Click to upload</span>
                <span className={styles.subText}> or drag and drop</span>
              </div>
              <span className={styles.subText}>{helperText}</span>
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        className={styles.hiddenInput}
        onChange={handleFileChange}
      />
    </div>
  );
};

export default ImageUpload;
