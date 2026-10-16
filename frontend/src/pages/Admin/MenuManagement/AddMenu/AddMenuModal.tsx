// import React, { useEffect } from "react";
// import { useForm } from "react-hook-form";
// import Input from "../../../../components/Input";
// import Select from "../../../../components/Select";
// import Button from "../../../../components/Button";

// import styles from "./AddMenu.module.css";
// // import styles from "./AddMenuModal.module.css";

// import { motion } from "framer-motion";
// const itemVariants = {
//   hidden: { opacity: 0, y: 10 },
//   visible: {
//     opacity: 1,
//     y: 0,
//     transition: { duration: 0.3 },
//   },
// };

// interface MenuFormValues {
//   name: string;
//   sorting_order: number;
//   lang: string;
//   url?: string;
//   other_url?: string;
//   target: string;
// }

// interface AddMenuModalProps {
//   onClose: () => void;
//   onSubmit: (data: MenuFormValues) => void;
//   editMenu?: Partial<MenuFormValues> | null;
//   onSave: (menu: Partial<IMainMenu>) => Promise<any>;
//   mode: "ADD" | "EDIT";
//   isLoading?: boolean;
// }

// export default function AddMenuModal({
//   onClose,

//   editMenu,
//   onSave,
//   mode,
//   isLoading,
// }: AddMenuModalProps) {
//   const {
//     register,
//     handleSubmit,
//     setValue,
//     formState: { errors, isSubmitting },
//   } = useForm<MenuFormValues>();

//   useEffect(() => {
//     if (editMenu) {
//       Object.entries(editMenu).forEach(([key, value]) => {
//         setValue(key as keyof MenuFormValues, value as any);
//       });
//     }
//   }, [editMenu, setValue]);

//   const submit = async (data: IMainMenu) => {
//     const payload: Partial<IMainMenu> = {
//       name: data.name.trim(),
//       target: data.target,
//       lang: data.lang,
//       sorting_order: Number(data.sorting_order),
//       url: data.url
//         ? data.url.trim().startsWith("/")
//           ? data.url.trim()
//           : "/" + data.url.trim()
//         : "",
//       other_url: data.other_url ? data.other_url.trim() : "",
//     };

//     try {
//       await onSave(payload);
//       onClose();
//     } catch (error) {
//       console.error("Failed to save menu:", error);
//     }
//   };

//   // const submit = (data: MenuFormValues) => {
//   //   onSubmit(data);
//   // };

//   return (
//     <div className={styles.modalBackdrop}>
//       <div className={styles.modalContent}>
//         <motion.div
//           initial="hidden"
//           animate="visible"
//           variants={itemVariants}
//           className={styles.formContainer}
//         />
//         <div className={styles.modalTop}>
//           <h2 className={styles.modalTitle}>
//             {editMenu ? "Edit Menu" : "Add New Menu"}
//           </h2>
//           <button className={styles.closeButton} onClick={onClose}>
//             x
//           </button>
//         </div>

//         <form onSubmit={handleSubmit(submit)} className={styles.modalForm}>
//           {/* General Information */}
//           <div className={styles.modalFormGrid}>
//             <div className={styles.modalSectionHeader}>
//               <h3>General Information</h3>
//             </div>

//             <Input
//               label="Name"
//               name="name"
//               register={register}
//               errors={errors}
//               required
//               placeholder="Enter Menu Name"
//             />

//             <Input
//               label="Sorting Order"
//               name="sorting_order"
//               register={register}
//               errors={errors}
//               required
//               placeholder="Enter numeric position"
//             />

//             <Select
//               label="Language"
//               name="lang"
//               options={[{ label: "English", value: "en" }]}
//               register={register}
//               errors={errors}
//               required
//             />
//           </div>

//           {/* Link Information */}
//           <div className={styles.modalFormGrid}>
//             <div className={styles.modalSectionHeader}>
//               <h3>Link Information</h3>
//             </div>

//             <Input
//               label="URL"
//               name="url"
//               register={register}
//               errors={errors}
//               placeholder="SEO-friendly URL (e.g., my-page)"
//             />

//             <Input
//               label="Other URL"
//               name="other_url"
//               register={register}
//               errors={errors}
//               placeholder="Full URL (e.g., https://example.com)"
//             />

//             <Select
//               label="Target"
//               name="target"
//               options={[
//                 { label: "Same Window", value: "_self" },
//                 { label: "New Window", value: "_blank" },
//               ]}
//               register={register}
//               errors={errors}
//               required
//             />
//           </div>

//           {/* Actions */}
//           <div className={styles.modalActions}>
//             <Button
//               title="Cancel"
//               type="button"
//               onClick={onClose}
//               buttonType="secondary"
//             />
//             <Button
//               title={editMenu ? "Update Menu" : "Add Menu"}
//               type="submit"
//               isLoading={isSubmitting}
//               buttonType="primary"
//             />
//           </div>
//         </form>
//       </div>
//     </div>
//   );
// }

import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { motion } from "framer-motion";

import Input from "../../../../components/Input";
import Select from "../../../../components/Select";
import Button from "../../../../components/Button";

import styles from "./AddMenu.module.css";

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

interface MenuFormValues {
  name: string;
  sorting_order: number;
  lang: string;
  url?: string;
  other_url?: string;
  target: string;
}

interface AddMenuModalProps {
  onClose: () => void;
  editMenu?: Partial<MenuFormValues> | null;
  onSave: (menu: Partial<IMainMenu>) => Promise<any>;
  mode: "ADD" | "EDIT";
  isLoading?: boolean;
}

export default function AddMenuModal({
  onClose,
  editMenu,
  onSave,
  mode,
  isLoading,
}: AddMenuModalProps) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MenuFormValues>();

  /** Pre-fill form when editing */
  useEffect(() => {
    if (editMenu) {
      Object.entries(editMenu).forEach(([key, value]) => {
        setValue(key as keyof MenuFormValues, value as any);
      });
    }
  }, [editMenu, setValue]);

  /** Handle form submission */
  const submit = async (data: MenuFormValues) => {
    const payload: Partial<IMainMenu> = {
      name: data.name.trim(),
      target: data.target,
      lang: data.lang,
      sorting_order: Number(data.sorting_order),
      url: data.url
        ? data.url.trim().startsWith("/")
          ? data.url.trim()
          : "/" + data.url.trim()
        : "",
      other_url: data.other_url?.trim() || "",
    };

    try {
      await onSave(payload);
      onClose();
    } catch (error) {
      console.error("Failed to save menu:", error);
    }
  };

  return (
    <div className={styles.modalBackdrop}>
      <motion.div
        className={styles.modalContent}
        initial="hidden"
        animate="visible"
        variants={itemVariants}
      >
        {/* Header */}
        <div className={styles.modalTop}>
          <h2 className={styles.modalTitle}>
            {mode === "EDIT" ? "Edit Menu" : "Add New Menu"}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close Modal"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(submit)} className={styles.modalForm}>
          {/* General Information */}
          <div className={styles.modalFormGrid}>
            <div className={styles.modalSectionHeader}>
              <h3>General Information</h3>
            </div>

            <Input
              label="Name"
              name="name"
              register={register}
              errors={errors}
              required
              placeholder="Enter Menu Name"
            />

            <Input
              label="Sorting Order"
              name="sorting_order"
              register={register}
              errors={errors}
              required
              placeholder="Enter numeric position"
            />

            <Select
              label="Language"
              name="lang"
              options={[{ label: "English", value: "en" }]}
              register={register}
              errors={errors}
              required
            />
          </div>

          {/* Link Information */}
          <div className={styles.modalFormGrid}>
            <div className={styles.modalSectionHeader}>
              <h3>Link Information</h3>
            </div>

            <Input
              label="URL"
              name="url"
              register={register}
              errors={errors}
              placeholder="SEO-friendly URL (e.g., my-page)"
            />

            <Input
              label="Other URL"
              name="other_url"
              register={register}
              errors={errors}
              placeholder="Full URL (e.g., https://example.com)"
            />

            <Select
              label="Target"
              name="target"
              options={[
                { label: "Same Window", value: "_self" },
                { label: "New Window", value: "_blank" },
              ]}
              register={register}
              errors={errors}
              required
            />
          </div>

          {/* Actions */}
          <div className={styles.modalActions}>
            <Button
              title="Cancel"
              type="button"
              onClick={onClose}
              buttonType="secondary"
            />
            <Button
              title={mode === "EDIT" ? "Update Menu" : "Add Menu"}
              type="submit"
              isLoading={isSubmitting || isLoading}
              buttonType="primary"
            />
          </div>
        </form>
      </motion.div>
    </div>
  );
}
