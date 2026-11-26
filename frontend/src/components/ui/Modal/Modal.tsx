import { useEffect, useRef, type ReactNode } from "react";
import styles from "./Modal.module.css";

// Open modals, newest last. Escape closes only the top one, so a confirm box
// opened from inside another modal doesn't close both.
const openStack: symbol[] = [];

const onEscape = (e: KeyboardEvent) => {
  if (e.key !== "Escape" || e.defaultPrevented || !openStack.length) return;
  e.preventDefault();
  closers.get(openStack[openStack.length - 1])?.();
};
const closers = new Map<symbol, () => void>();

interface ModalProps {
  isOpen?: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  maxWidth?: string;
}

const Modal = ({ isOpen = true, title, onClose, children, size = "md", maxWidth }: ModalProps) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const id = Symbol("modal");
    openStack.push(id);
    closers.set(id, () => onCloseRef.current());
    if (openStack.length === 1) document.addEventListener("keydown", onEscape);
    return () => {
      const i = openStack.indexOf(id);
      if (i >= 0) openStack.splice(i, 1);
      closers.delete(id);
      if (!openStack.length) document.removeEventListener("keydown", onEscape);
    };
  }, [isOpen]);

  if (!isOpen) return null;

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
