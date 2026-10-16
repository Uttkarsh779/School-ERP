
import React from "react";
import { motion } from "framer-motion";
import styles from "./quickmenu.module.css";
import Button from "../../../components/Button";

interface DeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message?: string;
  isLoading?: boolean;
}

const DeleteDialog: React.FC<DeleteDialogProps> = ({   
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Deletion",
  message = "Are you sure you want to delete this record? This action cannot be undone.",
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className={styles.backdrop}>
      <motion.div
        className={styles.dialog}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
      >
        <div className={styles.dialogHeader}>
          <h2 className={styles.dialogTitle}>{title}</h2>
        </div>
        
        <div className={styles.dialogContent}>
          <p className={styles.dialogMessage}>{message}</p>
        </div>
        
        <div className={styles.dialogActions}>
          <Button
            type="button"
            onClick={onClose}
            buttonType="secondary"
            title="Cancel"
            disabled={isLoading}
          />
          <Button
            type="button"
            onClick={onConfirm}
            buttonType="primary"
            title="Delete"
            isLoading={isLoading}
          />
        </div>
      </motion.div>
    </div>
  );
};

export default DeleteDialog;