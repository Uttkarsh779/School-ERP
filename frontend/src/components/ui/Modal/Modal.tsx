import type { ReactNode } from "react";
import styles from "./Modal.module.css";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  maxWidth?: string;
}

const Modal = ({ title, onClose, children, size = "md", maxWidth }: ModalProps) => {
  const getMaxWidth = () => {
    if (maxWidth) return maxWidth;
    switch (size) {
      case "sm":
        return "420px";
      case "md":
        return "560px";
      case "lg":
        return "820px";
      case "xl":
        return "1020px";
      default:
        return "560px";
    }
  };

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} style={{ maxWidth: getMaxWidth() }} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
};

export default Modal;
