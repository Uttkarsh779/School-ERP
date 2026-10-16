import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { motion } from "framer-motion";
import styles from "./faq.module.css";
import Button from "../../../components/Button";
import Input from "../../../components/Input";
import Textarea from "../../../components/Textarea";

// Validation schema
const schema = yup.object().shape({
  question: yup.string().required("Question is required"),
  answer: yup.string().required("Answer is required"),
});

interface FormData {
  question: string;
  answer: string;
}

interface AddBottomMenuProps {
  isOpen: boolean;
  onClose: () => void;
  defaultValues?: Partial<FormData>;
  mode: string;
  onSubmitHandler: (data: FormData) => void;
  isLoading?: boolean;
}

const AddFaq: React.FC<AddBottomMenuProps> = ({
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
      question: "",
      answer: "",
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        question: "",
        answer: "",
        ...defaultValues,
      });
    }
  }, [isOpen, defaultValues, reset]);

  const onSubmit = (data: FormData) => {
    console.log("Form data being submitted:", data);
    onSubmitHandler(data);
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
            {mode === "ADD" ? "Add Faq" : "Edit Faq"}
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
          <div className={styles.fullSpan}>
            <Input
              label="Question"
              name="question"
              type="text"
              register={register}
              errors={errors}
              required
              placeholder="Enter question"
            />
          </div>

          <div className={styles.fullSpan}>
            <Textarea
              label="Answer"
              name="answer"
              register={register}
              errors={errors}
              placeholder="Enter Answer"
              rows={3}
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
                title={mode === "ADD" ? "Add Faq" : "Update Faq"}
                isLoading={isLoading}
              />
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddFaq;
