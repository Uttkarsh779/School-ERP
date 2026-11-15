import { useState } from "react";
import { toast } from "react-toastify";
import { Button, Card, Input } from "../../ui";
import { useChangePasswordMutation } from "../../../store/api/profile.api";
import { useAppDispatch, useAppSelector } from "../../../store/store";
import { setTokens } from "../../../store/reducers/authReducer";

const errorOf = (err: unknown, fallback: string) =>
  (err as { data?: { message?: string } })?.data?.message ?? fallback;

// Change password for any role. Rules match the server: 8+ characters, a letter and a number.
const ChangePasswordCard = () => {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [changePassword, { isLoading }] = useChangePasswordMutation();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);

  const rules = {
    length: form.next.length >= 8,
    letter: /[A-Za-z]/.test(form.next),
    number: /\d/.test(form.next),
    match: form.next !== "" && form.next === form.confirm,
  };
  const ok = rules.length && rules.letter && rules.number && rules.match && form.current !== "";

  const submit = async () => {
    if (!ok) return;
    try {
      const res = await changePassword({ currentPassword: form.current, newPassword: form.next }).unwrap();
      // The old tokens stop working at the next refresh; keep this device signed in.
      if (res?.data?.accessToken) dispatch(setTokens({ ...res.data, user }));
      toast.success("Password changed. You've been signed out on your other devices.");
      setForm({ current: "", next: "", confirm: "" });
    } catch (e) {
      toast.error(errorOf(e, "Couldn't change the password"));
    }
  };

  const Rule = ({ met, text }: { met: boolean; text: string }) => (
    <li style={{ color: met ? "var(--erp-success)" : "var(--erp-text-muted)", fontSize: "0.8rem" }}>
      {met ? "✓" : "•"} {text}
    </li>
  );

  return (
    <Card title="Change password">
      <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
        <Input label="Current password" type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
        <Input label="New password" type="password" autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        <ul style={{ margin: 0, paddingLeft: "0.2rem", listStyle: "none", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
          <Rule met={rules.length} text="At least 8 characters" />
          <Rule met={rules.letter && rules.number} text="Contains a letter and a number" />
          <Rule met={rules.match} text="Both new passwords match" />
        </ul>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button onClick={submit} isLoading={isLoading} disabled={!ok}>
            Change password
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default ChangePasswordCard;
