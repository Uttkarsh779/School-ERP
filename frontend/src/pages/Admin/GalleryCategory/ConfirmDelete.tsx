import React from "react";
import styles from "./GalleryCategory.module.css";
import Button from "../../../components/Button";

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
        <h2>{title}</h2>
        {message && <p>{message}</p>}
        <div className={styles.actions}>
          <Button title="Cancel" buttonType="secondary" onClick={onCancel} />
          <Button title="Delete" buttonType="primary" onClick={onConfirm} />
        </div>
      </div>
    </div>
  );
};

export default ConfirmDelete;
