import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { motion } from "framer-motion";
import styles from "./style.module.css";
import Button from "../../../components/Button";
import Input from "../../../components/Input";
import Select from "../../../components/Select";

// Validation schema
const schema = yup.object().shape({
  name: yup.string().required("Name is required"),
  slogan: yup.string().required("Slogan on Menu is required"),
  logo: yup
    .mixed()
    .test("fileRequired", "A file is required", (value) => {
      if (typeof document !== "undefined") {
        const isSubmitting = document.querySelector("form")?.checkValidity();
        return !isSubmitting || value instanceof File;
      }
      return true;
    })
    .test("fileSize", "File is too large (max 2MB)", (value) => {
      return !value || (value instanceof File && value.size <= 2 * 1024 * 1024);
    })
    .test(
      "fileType",
      "Unsupported file format (JPEG, PNG, SVG only)",
      (value) => {
        return (
          !value ||
          (value instanceof File &&
            ["image/jpeg", "image/png", "image/svg+xml"].includes(value.type))
        );
      }
    ),
  videoUrl: yup
    .mixed()
    .test("fileRequired", "A file is required", (value) => {
      if (typeof document !== "undefined") {
        const isSubmitting = document.querySelector("form")?.checkValidity();
        return !isSubmitting || value instanceof File;
      }
      return true;
    })
    .test(
      "fileType",
      "Unsupported file format (MP4, WebM, Ogg only)",
      (value) => {
        return (
          !value ||
          (value instanceof File &&
            ["video/mp4", "video/webm", "video/ogg"].includes(value.type))
        );
      }
    )
    .test("fileSize", "File too large (max 10MB)", (value) => {
      return (
        !value || (value instanceof File && value.size <= 10 * 1024 * 1024)
      );
    }),
  audioUrl: yup
    .mixed()
    .test("fileRequired", "A file is required", (value) => {
      if (typeof document !== "undefined") {
        const isSubmitting = document.querySelector("form")?.checkValidity();
        return !isSubmitting || value instanceof File;
      }
      return true;
    })
    .test("fileType", "Unsupported file format (MP3, WAV only)", (value) => {
      return (
        !value ||
        (value instanceof File &&
          ["audio/mpeg", "audio/wav", "audio/mp3"].includes(value.type))
      );
    })
    .test("fileSize", "File is too large (max 5MB)", (value) => {
      return !value || (value instanceof File && value.size <= 5 * 1024 * 1024);
    }),
  content: yup.string().required("Content is required"),
  lang: yup.string().required("Language is required"),
});

interface FormData {
  name: string;
  logo: File | null;
  slogan: string;
  videoUrl: File | null;
  content: string;
  audioUrl: File | null;
  lang: string;
}

interface AddBottomMenuProps {
  isOpen: boolean;
  onClose: () => void;
  defaultValues?: Partial<FormData>;
  mode: string;
  onSubmitHandler: (data: FormData) => void;
  isLoading?: boolean;
}

const AddSetting: React.FC<AddBottomMenuProps> = ({
  isOpen,
  onClose,
  defaultValues = {},
  mode,
  onSubmitHandler,
  isLoading = false,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      name: "",
      slogan: "",
      content: "",
      lang: "",
      logo: null,
      videoUrl: null,
      audioUrl: null,
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        name: "",
        slogan: "",
        content: "",
        lang: "",
        logo: null,
        videoUrl: null,
        audioUrl: null,
        ...defaultValues,
      });

      // Clear file inputs when modal opens
      if (typeof document !== "undefined") {
        const fileInputs = document.querySelectorAll('input[type="file"]');
        fileInputs.forEach((input) => ((input as HTMLInputElement).value = ""));
      }
    }
  }, [isOpen, defaultValues, reset]);

  const onSubmit = (data: FormData) => {
    onSubmitHandler(data);
  };

  const handleFileChange =
    (fieldName: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      setValue(fieldName, file, { shouldValidate: true });
    };

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop}>
      <motion.div
        className={styles.modalContainer}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
      >
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            {mode === "ADD" ? "Add setting" : "Edit setting"}
          </h2>
          <button
            onClick={onClose}
            className={styles.closeButton}
            disabled={isLoading}
          >
            ×
          </button>
        </div>

        <div className={styles.breadcrumb}>
          <span className={styles.breadcrumbLink}>admin</span>
          <span> / </span>
          <span className={styles.breadcrumbLink}>setting</span>
          <span> / </span>
          <span className={styles.breadcrumbCurrent}>
            {mode === "ADD" ? "Add setting" : "Edit setting"}
          </span>
        </div>

        <form className={styles.formGrid} onSubmit={handleSubmit(onSubmit as any)}>
          <div>
            <Input
              label="Name"
              name="name"
              type="text"
              register={register}
              errors={errors}
              required
              placeholder="Enter Name"
            />
          </div>

          <div>
            <Input
              label="Slogan"
              name="slogan"
              type="text"
              register={register}
              errors={errors}
              required
              placeholder="Enter Slogan"
            />
          </div>

          <div>
            <label>Logo *</label>
            <input
              type="file"
              accept="image/jpeg, image/png, image/svg+xml"
              onChange={handleFileChange("logo")}
            />
            {errors.logo && (
              <span className={styles.error}>{errors.logo.message}</span>
            )}
            {watch("logo") && (
              <div className={styles.filePreview}>
                Selected: {watch("logo")?.name}
              </div>
            )}
          </div>

          <div>
            <label>Video URL *</label>
            <input
              type="file"
              accept="video/mp4, video/webm, video/ogg"
              onChange={handleFileChange("videoUrl")}
            />
            {errors.videoUrl && (
              <span className={styles.error}>{errors.videoUrl.message}</span>
            )}
            {watch("videoUrl") && (
              <div className={styles.filePreview}>
                Selected: {watch("videoUrl")?.name}
              </div>
            )}
          </div>

          <div>
            <label>Audio URL *</label>
            <input
              type="file"
              accept="audio/mpeg, audio/wav, audio/mp3"
              onChange={handleFileChange("audioUrl")}
            />
            {errors.audioUrl && (
              <span className={styles.error}>{errors.audioUrl.message}</span>
            )}
            {watch("audioUrl") && (
              <div className={styles.filePreview}>
                Selected: {watch("audioUrl")?.name}
              </div>
            )}
          </div>

          <div>
            <Input
              label="Content"
              name="content"
              type="text"
              register={register}
              errors={errors}
              required
              placeholder="Enter Content"
            />
          </div>

          <div>
            <Select
              label="Language"
              name="lang"
              register={register}
              options={[{ value: "en", label: "English" }]}
              errors={errors}
              required
            />
          </div>

          <div className={styles.fullSpan}>
            <div className={styles.formActions}>
              <Button
                type="button"
                onClick={onClose}
                buttonType="secondary"
                title="Cancel"
                disabled={isLoading}
              />
              <Button
                type="submit"
                buttonType="primary"
                title={mode === "ADD" ? "Add Setting" : "Update Setting"}
                isLoading={isLoading}
              />
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddSetting;
