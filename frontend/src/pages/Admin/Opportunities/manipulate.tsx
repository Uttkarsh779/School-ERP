import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { motion } from "framer-motion";
import styles from "./submenu.module.css";
import Button from "../../../components/Button";
import Input from "../../../components/Input";
import Select from "../../../components/Select";

// Validation schema
const schema = yup.object().shape({
  title: yup.string().required("Title is required"),
  file_url: yup.string().required("URL is required"),
  type: yup.string().required("Type is required"),
  notice: yup.boolean(),
});

interface FormData {
  title: string;
  file_url: string;
  type: string;
  notice: boolean;
}

interface AddBottomMenuProps {
  isOpen: boolean;
  onClose: () => void;
  defaultValues?: Partial<FormData>;
  mode: string;
  onSubmitHandler: (data: FormData) => void;
  isLoading?: boolean;
}

const AddOpportunity: React.FC<AddBottomMenuProps> = ({
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
  } = useForm<FormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      title: "",
      file_url: "",
      type: "",
      notice: true,
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        title: "",
        file_url: "",
        type: "",
        notice: true,
        ...defaultValues,
      });
    }
  }, [isOpen, defaultValues, reset]);

  const onSubmit = (data: FormData) => {
    console.log("Form data being submitted:", data);
    onSubmitHandler(data);
  };

  const displayOnMenuOptions = [
    { label: "True", value: "True" },
    { label: "False", value: "False" },
  ];

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
            {mode === "ADD" ? "Add Opportunity" : "Edit Opportunity"}
          </h2>
          <button
            onClick={onClose}
            className={styles.closeButton}
            disabled={isLoading}
          >
            ×
          </button>
        </div>

        <form className={styles.formGrid} onSubmit={handleSubmit(onSubmit as any)}>
          <div>
            <Input
              label="File_url"
              name="file_url"
              type="text"
              register={register}
              errors={errors}
              required
              placeholder="Enter file URL"
            />
          </div>

          <div>
            <Input
              label="Title"
              name="title"
              type="text"
              register={register}
              errors={errors}
              required
              placeholder="Enter Title"
            />
          </div>

          <div>
            <Input
              label="Type"
              name="type"
              type="text"
              register={register}
              errors={errors}
              required
              placeholder="Enter Type"
            />
          </div>

          <div className={styles.fullSpan}>
            <Select
              label="Notice"
              name="notice"
              register={register}
              options={displayOnMenuOptions}
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
                title={
                  mode === "ADD" ? "Add Opportunity" : "Update Opportunity"
                }
                isLoading={isLoading}
              />
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddOpportunity;
