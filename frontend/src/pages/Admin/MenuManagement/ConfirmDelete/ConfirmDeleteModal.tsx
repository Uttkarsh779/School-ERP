import React from "react";
import "./ConfirmDelete.css";
import Button from "../../../../components/Button";

interface ConfirmDeleteModalProps {
  onClose: () => void;
  onConfirm: () => void;
  menuName: string;
}

const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  onClose,
  onConfirm,
  menuName,
}) => {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Confirm Deletion</h2>
        <p>Are you sure you want to delete the menu "{menuName}"?</p>
        <div className="modal-buttons">
          <Button
            title="Cancel"
            type="button"
            onClick={onClose}
            buttonType="secondary"
          />
          <Button
            title={"Delete"}
            type="button"
            onClick={onConfirm}
            buttonType="primary"
          />
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteModal;
