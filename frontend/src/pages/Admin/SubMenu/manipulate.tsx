import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { motion } from "framer-motion";
import styles from "./submenu.module.css";
import Button from "../../../components/Button";
import Input from "../../../components/Input";
import Select from "../../../components/Select";

import { useGetMainMenuQuery } from "../../../store/services/mainMenu.api"; // <-- Your API hook

// Validation schema
const schema = yup
  .object({
    parent_id: yup
      .number()
      .typeError("Parent menu is required")
      .required("Parent menu is required"),
    name: yup.string().required("Name is required"),
    url: yup.string(),
    other_url: yup.string().url("Must be a valid URL"),
    sorting_order: yup
      .string()
      .matches(/^[1-9]\d*$/, "Sorting order must be a positive number")
      .required("Sorting order is required"),
    target: yup.string().required("Target is required"),
    lang: yup.string().required("Language is required"),
  })
  .required()
  .test(
    "url-or-other_url",
    "Either URL or Other URL must be provided",
    (obj) => !!obj.url || !!obj.other_url
  );

interface AddBottomMenuProps {
  isOpen: boolean;
  onClose: () => void;
  defaultValues?: Partial<ISubMenu>;
  mode: string;
  onSubmitHandler: (data: ISubMenu) => void;
  isLoading?: boolean;
}

const AddSubMenu: React.FC<AddBottomMenuProps> = ({
  isOpen,
  onClose,
  defaultValues = {},
  mode,
  onSubmitHandler,
  isLoading = false,
}) => {
  const defaultPropValues: ISubMenu = {
    parent_id: undefined,
    name: "",
    url: "",
    other_url: "",
    sorting_order: 1,
    target: "_self",
    lang: "en",
  };
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ISubMenu>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      ...defaultPropValues,
      ...defaultValues,
    },
  });

  // main menu data come like parent_id
  const { data: mainMenuData, isLoading: isMenuLoading } = useGetMainMenuQuery(
    {}
  );

  const parentMenuOptions =
    mainMenuData?.data?.map((menu: IMainMenu) => ({
      label: menu.name,
      value: menu.id,
    })) || [];

  useEffect(() => {
    if (isOpen) {
      reset({
        ...defaultPropValues,
        ...defaultValues,
      });
    }
  }, [isOpen, reset]);

  const onSubmit = (data: ISubMenu) => {
    console.log("Form data being submitted:", data);
    onSubmitHandler(data);
  };

  const websiteOptions = [{ label: "English", value: "en" }];

  const targetOptions = [
    { label: "Same Window", value: "_self" },
    { label: "New Window", value: "_blank" },
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
            {mode === "ADD" ? "Add Sub Menu" : "Edit Sub Menu"}
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
          {!isMenuLoading && (
            <div>
              <Select
                label="Main Menu"
                name="parent_id"
                register={register}
                options={parentMenuOptions}
                errors={errors}
                required
              />
            </div>
          )}

          <div>
            <Select
              label="Website"
              name="lang"
              register={register}
              options={websiteOptions}
              errors={errors}
              required
            />
          </div>

          <div>
            <Input
              label="Menu Name"
              name="name"
              type="text"
              register={register}
              errors={errors}
              required
              placeholder="Enter Menu Name"
            />
          </div>

          <div>
            <Input
              label="Menu Position"
              name="sorting_order"
              type="number"
              register={register}
              errors={errors}
              required
              placeholder="Enter Position"
              min="1"
            />
          </div>

          <div>
            <Input
              label="SEO URL"
              name="url"
              type="text"
              register={register}
              errors={errors}
              placeholder="Enter SEO Friendly URL"
            />
          </div>

          <div>
            <Input
              label="Other URL"
              name="other_url"
              type="text"
              register={register}
              errors={errors}
              placeholder="Enter Alternate URL"
            />
          </div>

          <div>
            <Select
              label="Target"
              name="target"
              register={register}
              options={targetOptions}
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
                title={mode === "ADD" ? "Add SubMenu" : "Update SubMenu"}
                isLoading={isLoading}
              />
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddSubMenu;
