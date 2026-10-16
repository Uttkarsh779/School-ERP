import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { useDropzone } from "react-dropzone";
import Input from "../../../components/Input";
import Button from "../../../components/Button";
import styles from "./GalleryImageManagement.module.css";
import { motion } from "framer-motion";

interface GalleryImageItem {
  id?: number;
  ref_id: number;
  image: File | string; // File for new upload, string (URL) for existing
}

interface Props {
  mode: string;
  imageData?: GalleryImageItem;
  onSave: (data: FormData) => void; // FormData to parent for API call
  onClose: () => void;
}

const schema = yup.object({
  ref_id: yup
    .number()
    .typeError("Reference ID must be a number")
    .required("Reference ID is required")
    .integer("Reference ID must be an integer")
    .positive("Reference ID must be positive"),
  image: yup.mixed().test("required", "Image is required", (value) => {
    if (!value) return false;
    if (typeof value === "string") return value.length > 0;
    if (value instanceof File) return true;
    return false;
  }),
});

const Manipulate: React.FC<Props> = ({ mode, imageData, onSave, onClose }) => {
  const [filePreview, setFilePreview] = useState<string>("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<GalleryImageItem>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      ref_id: 0,
      image: "",
    },
  });

  useEffect(() => {
    if (mode === "edit" && imageData) {
      reset({
        ref_id: imageData.ref_id,
        image: imageData.image,
      });
      if (typeof imageData.image === "string") {
        setFilePreview(imageData.image);
      }
    } else {
      reset({ ref_id: 0, image: "" });
      setFilePreview("");
    }
  }, [mode, imageData, reset]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (!file) return;
      setValue("image", file, { shouldValidate: true });
      setFilePreview(URL.createObjectURL(file));
    },
  });

  const submit = (data: GalleryImageItem) => {
    const formData = new FormData();
    if (imageData?.id) {
      formData.append("id", imageData.id.toString());
    }
    formData.append("ref_id", data.ref_id.toString());
    if (data.image instanceof File) {
      formData.append("image", data.image);
    } else if (typeof data.image === "string" && data.image.length > 0) {
      formData.append("image_url", data.image);
    }

    onSave(formData);
  };

  return (
    <div className={styles.modalBackdrop}>
      <motion.div
        className={styles.modalContainer}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
      >
        <div className={styles.modalContent}>
          <div className={styles.modalHead}>
            <h2 className={styles.modalTitle}>
              {mode === "edit" ? "Edit Gallery Image" : "Add Gallery Image"}
            </h2>
            <button onClick={onClose} className={styles.closeButton}>
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit(submit as any)} className={styles.modalForm}>
            <Input
              label="Reference ID"
              name="ref_id"
              type="number"
              register={register}
              errors={errors}
              required
              placeholder="Enter reference ID"
            />
            {errors.ref_id && (
              <p className={styles.errorText}>{errors.ref_id.message}</p>
            )}

            <div
              {...getRootProps()}
              className={`${styles.dropzone} ${
                isDragActive ? styles.dropzoneActive : ""
              }`}
              style={{
                border: "2px dashed #666",
                padding: 20,
                textAlign: "center",
                cursor: "pointer",
                marginBottom: 12,
              }}
            >
              <input {...getInputProps()} />
              {isDragActive ? (
                <p>Drop the image here...</p>
              ) : (
                <p>Drag & drop an image here, or click to select one</p>
              )}
            </div>

            {errors.image && (
              <p className={styles.errorText}>
                {errors.image.message as string}
              </p>
            )}

            {filePreview && (
              <img
                src={filePreview}
                alt="Preview"
                style={{
                  maxWidth: "100%",
                  maxHeight: 200,
                  objectFit: "contain",
                }}
              />
            )}
            <br />

            <div className={styles.modalActions}>
              <Button
                title="Cancel"
                type="button"
                onClick={onClose}
                buttonType="secondary"
                disabled={isSubmitting}
              />
              <Button
                title={mode === "edit" ? "Save Changes" : "Add Image"}
                type="submit"
                isLoading={isSubmitting}
                buttonType="primary"
              />
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default Manipulate;
