import { useState } from "react";
import { toast } from "react-toastify";
import { Modal, Button, Badge, ConfirmDialog, Spinner } from "../../../../components/ui";
import {
  useGetParentByIdQuery,
  useLinkChildToParentMutation,
  useUnlinkChildFromParentMutation,
} from "../../../../store/api/parents.api";
import ChildPicker from "./ChildPicker";
import styles from "./ParentModals.module.css";

interface ManageChildrenModalProps {
  parentId: number;
  onClose: () => void;
}

/**
 * Lets an admin add/remove children from an existing parent account.
 * Subscribes to getParentById directly so it always reflects the latest
 * link/unlink state (tag invalidation refetches this automatically).
 */
const ManageChildrenModal = ({ parentId, onClose }: ManageChildrenModalProps) => {
  const { data: parent, isLoading } = useGetParentByIdQuery(parentId);
  const [linkChild, { isLoading: isLinking }] = useLinkChildToParentMutation();
  const [unlinkChild] = useUnlinkChildFromParentMutation();
  const [pendingUnlinkId, setPendingUnlinkId] = useState<number | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<{ studentId: number; name: string } | null>(null);
  const [addSelection, setAddSelection] = useState<number[]>([]);

  const linkedIds = parent?.children.map((link) => link.studentId) ?? [];

  const handleUnlink = async (studentId: number) => {
    setPendingUnlinkId(studentId);
    try {
      await unlinkChild({ parentId, studentId }).unwrap();
      toast.success("Child unlinked.");
    } catch {
      toast.error("Failed to unlink child.");
    } finally {
      setPendingUnlinkId(null);
    }
  };

  const handleAdd = async () => {
    try {
      await Promise.all(addSelection.map((studentId) => linkChild({ parentId, studentId }).unwrap()));
      toast.success(addSelection.length > 1 ? "Children linked." : "Child linked.");
      setAddSelection([]);
    } catch {
      toast.error("Failed to link one or more children.");
    }
  };

  const displayName = parent?.name && parent.name !== "Unknown" ? parent.name : (parent?.children?.[0]?.student?.fatherName || "Unknown");

  return (
    <Modal title={`Manage children${parent ? ` — ${parent.user?.name ?? parent.user?.email ?? displayName}` : ""}`} onClose={onClose}>
      {isLoading || !parent ? (
        <Spinner />
      ) : (
        <div className={styles.manageWrapper}>
          <section>
            <h4 className={styles.sectionTitle}>Currently linked</h4>
            {parent.children.length === 0 ? (
              <p className={styles.emptyNote}>No children linked yet.</p>
            ) : (
              <ul className={styles.linkedList}>
                {parent.children.map((link) => (
                  <li key={link.id} className={styles.linkedRow}>
                    <span className={styles.linkedName}>
                      {link.student.name} <Badge tone="neutral">Roll {link.student.rollNo}</Badge>
                    </span>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      isLoading={pendingUnlinkId === link.studentId}
                      onClick={() => setConfirmUnlink({ studentId: link.studentId, name: link.student.name })}
                    >
                      Unlink
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.addSection}>
            <h4 className={styles.sectionTitle}>Add a child</h4>
            <ChildPicker selectedIds={addSelection} onChange={setAddSelection} excludeIds={linkedIds} />
            <Button
              type="button"
              onClick={handleAdd}
              disabled={addSelection.length === 0}
              isLoading={isLinking}
              fullWidth
            >
              Link selected ({addSelection.length})
            </Button>
          </section>
        </div>
      )}

      {confirmUnlink && (
        <ConfirmDialog
          title="Unlink child?"
          message={`${confirmUnlink.name} will no longer show up on this parent's account. This doesn't affect the student's own record.`}
          confirmLabel="Unlink"
          tone="danger"
          isLoading={pendingUnlinkId === confirmUnlink.studentId}
          onCancel={() => setConfirmUnlink(null)}
          onConfirm={async () => {
            await handleUnlink(confirmUnlink.studentId);
            setConfirmUnlink(null);
          }}
        />
      )}
    </Modal>
  );
};

export default ManageChildrenModal;
