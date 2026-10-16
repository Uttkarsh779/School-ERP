import React from "react";
import Button from "../../../components/Button";
import styles from "./GalleryImageManagement.module.css";

interface ConfirmDeleteProps {
  title: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDelete: React.FC<ConfirmDeleteProps> = ({
  title,
  message,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={styles.modalTitle}>{title}</h2>
        {message && <p className={styles.modalMessage}>{message}</p>}
        <div className={styles.actions}>
          <Button title="Cancel" buttonType="secondary" onClick={onCancel} />
          <Button title="Delete" buttonType="primary" onClick={onConfirm} />
        </div>
      </div>
    </div>
  );
};

export default ConfirmDelete;
