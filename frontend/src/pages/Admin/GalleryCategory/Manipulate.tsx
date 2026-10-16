import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import Input from "../../../components/Input";
import Textarea from "../../../components/Textarea";
import Button from "../../../components/Button";
import styles from "./GalleryCategory.module.css";

interface FormValues {
  title: string;
  description: string;
}

interface Props {
  mode: string;
  category?: { id?: number; title: string; description: string };
  isLoading?: boolean;
  onSave: (data: {
    id?: number;
    title: string;
    description: string;
  }) => Promise<void> | void;
  onClose: () => void;
}

// ✅ Yup schema
const schema = yup.object().shape({
  title: yup
    .string()
    .required("Title is required")
    .min(3, "Title must be at least 3 characters")
    .max(100, "Title cannot exceed 100 characters"),
  description: yup
    .string()
    .max(300, "Description cannot exceed 300 characters")
    .nullable(),
});

const Manipulate: React.FC<Props> = ({
  mode,
  category,
  onSave,
  onClose,
  isLoading = false,
}) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema) as any,
    defaultValues: { title: "", description: "" },
  });

  useEffect(() => {
    if (mode === "edit" && category) {
      reset({
        title: category.title || "",
        description: category.description || "",
      });
    } else {
      reset({ title: "", description: "" });
    }
  }, [mode, category, reset]);

  const submit = async (data: FormValues) => {
    const payload = {
      ...(mode === "edit" && category?.id ? { id: category.id } : {}),
      title: data.title.trim(),
      description: data.description?.trim() || "",
    };

    await onSave(payload);
    onClose();
  };

  return (
    <div className={styles.modalBackdrop}>
      <div className={styles.modalContent}>
        <div className={styles.modalHead}>
          <h2 className={styles.modalTitle}>
            {mode === "edit" ? "Edit Category" : "Add Category"}
          </h2>
          <button
            onClick={onClose}
            className={styles.closeButton}
            disabled={isLoading}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit(submit as any)} className={styles.modalForm}>
          <Input
            label="Title"
            name="title"
            register={register}
            errors={errors}
            required
            placeholder="Category title"
          />

          <div className={styles.colFull}>
            <Textarea
              label="Description"
              name="description"
              register={register}
              errors={errors}
              placeholder="Short description"
            />
          </div>

          <div className={styles.modalActions}>
            <Button
              title="Cancel"
              type="button"
              onClick={onClose}
              buttonType="secondary"
            />
            <Button
              title={mode === "edit" ? "Save Changes" : "Add Category"}
              type="submit"
              isLoading={isSubmitting}
              buttonType="primary"
            />
          </div>
        </form>
      </div>
    </div>
  );
};

export default Manipulate;
