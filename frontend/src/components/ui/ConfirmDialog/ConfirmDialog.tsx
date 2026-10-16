import Modal from "../Modal/Modal";
import Button from "../Button/Button";
import styles from "./ConfirmDialog.module.css";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// A confirmation prompt before an irreversible-ish action (deactivate, unlink, delete).
// Always render this conditionally from the caller (e.g. `{pendingAction && <ConfirmDialog .../>}`)
// rather than keeping it mounted — that keeps the "are you sure" state colocated with
// whatever triggered it.
const ConfirmDialog = ({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => (
  <Modal title={title} onClose={onCancel}>
    <p className={styles.message}>{message}</p>
    <div className={styles.actions}>
      <Button variant="outline" onClick={onCancel} disabled={isLoading}>
        {cancelLabel}
      </Button>
      <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} isLoading={isLoading}>
        {confirmLabel}
      </Button>
    </div>
  </Modal>
);

export default ConfirmDialog;
