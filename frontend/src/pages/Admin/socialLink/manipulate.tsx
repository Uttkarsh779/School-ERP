import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { motion } from "framer-motion";
import styles from "./sociallink.module.css";
import Button from "../../../components/Button";
import Input from "../../../components/Input";
import Select from "../../../components/Select";

// Validation schema
const schema = yup
  .object({
    title: yup.string().required("Title is required"),
    url: yup.string(),
  }
  );

export interface ISocialLinkData {
  id?: number;
  title: string;
  url?: string;
}

interface AddBottomMenuProps {
  isOpen: boolean;
  onClose: () => void;
  defaultValues?: Partial<ISocialLinkData>;
  mode: string;
  onSubmitHandler: (data: ISocialLinkData) => void;
  isLoading?: boolean;
}

const AddSocialLink: React.FC<AddBottomMenuProps> = ({
  isOpen,
  onClose,
  defaultValues = {},
  mode,
  onSubmitHandler,
  isLoading = false,
}) => {
  const defaultPropValues: ISocialLinkData = {
    title: "",
    url: "",
  };
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ISocialLinkData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      ...defaultPropValues,
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        ...defaultPropValues,
        ...defaultValues,
      });
    }
  }, [isOpen, reset]); // Only depend on isOpen and reset

  const onSubmit = (data: ISocialLinkData) => {
    console.log("Form data being submitted:", data);
    onSubmitHandler(data);
  };

  const TitleOptions = [{ label: "Facebook", value: "facebook" },
    {label: "Instagram", value: "instagram"},
{label: "Linkedin", value: "linkedin"},
{label: "Twitter", value: "twitter"}];


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
            {mode === "ADD" ? "Add Social Link" : "Edit Social Link"}
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
            <Select
              label="Title"
              name="title"
              register={register}
              options={TitleOptions}
              errors={errors}
              required
            />
          </div>


          <div>
            <Input
              label="URL"
              name="url"
              type="text"
              register={register}
              errors={errors}
              placeholder="Enter  URL"
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
                title={mode === "ADD" ? "Add Social Link" : "Update Social Link"}
                isLoading={isLoading}
              />
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddSocialLink;
