import { useState } from "react";
import { toast } from "react-toastify";
import { Button, Input, Modal } from "../../../../components/ui";
import { useResetStaffPasswordMutation } from "../../../../store/api/staff.api";

// Super Admin sets a new password for a staff member who forgot theirs. "Suggest" makes an
// easy-to-read temporary one (letters + digits, no look-alike characters) to tell them.
const suggest = () => {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  return Array.from({ length: 5 }, () => pick(letters)).join("") + Array.from({ length: 4 }, () => pick("23456789")).join("");
};

const ResetPasswordModal = ({ staff, onClose }: { staff: IStaff; onClose: () => void }) => {
  const [password, setPassword] = useState(suggest);
  const [done, setDone] = useState(false);
  const [reset, { isLoading }] = useResetStaffPasswordMutation();

  const submit = async () => {
    try {
      await reset({ id: staff.id, password }).unwrap();
      setDone(true);
      toast.success("Password reset");
    } catch (e: any) {
      toast.error(e?.data?.message ?? "Couldn't reset the password");
    }
  };

  return (
    <Modal title={`Reset password — ${staff.user.name ?? "Staff"}`} onClose={onClose}>
      {done ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <p style={{ margin: 0 }}>Tell {staff.user.name ?? "them"} to sign in with:</p>
          <div style={{ padding: "0.8rem 1rem", borderRadius: "var(--erp-radius-md)", background: "var(--erp-primary-50)", lineHeight: 1.7 }}>
            Email: <strong>{staff.user.email}</strong>
            <br />
            Password: <strong style={{ fontFamily: "ui-monospace, monospace", fontSize: "1.05rem" }}>{password}</strong>
          </div>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--erp-text-muted)" }}>
            Ask them to change it from <strong>My Profile</strong> after signing in. This password isn't shown again.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            Sets a new password for <strong>{staff.user.email}</strong>. Their old password stops working.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <Input label="New password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
            </div>
            <Button type="button" variant="outline" onClick={() => setPassword(suggest())}>
              Suggest
            </Button>
          </div>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--erp-text-muted)" }}>At least 8 characters, with a letter and a number.</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} isLoading={isLoading} disabled={password.trim().length < 8}>
              Reset password
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ResetPasswordModal;
