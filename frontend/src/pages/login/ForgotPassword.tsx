import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { toast } from "react-toastify";
import styles from "./Login.module.css";
import Button from "../../components/Button";
import Input from "../../components/Input";
import { useForgotPasswordMutation, useResetPasswordMutation } from "../../store/services/user.api";

type Mode = "family" | "staff";
type RequestForm = { identifier: string };
type ResetForm = { code: string; newPassword: string; confirmPassword: string };

const requestSchema = yup.object({ identifier: yup.string().trim().required("This field is required") });

// Same rules as the server (8+ characters, a letter and a number).
const resetSchema = yup.object({
  code: yup.string().trim().matches(/^\d{6}$/, "Enter the 6-digit code").required("Enter the 6-digit code"),
  newPassword: yup
    .string()
    .min(8, "At least 8 characters")
    .max(72, "Too long")
    .matches(/[A-Za-z]/, "Needs at least one letter")
    .matches(/\d/, "Needs at least one number")
    .required("Enter a new password"),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref("newPassword")], "Passwords don't match")
    .required("Confirm the new password"),
});

const RESEND_SECONDS = 60;

const errMessage = (e: any, fallback: string) => e?.data?.message || fallback;

const ForgotPassword: React.FC<{ mode: Mode; onBack: () => void }> = ({ mode, onBack }) => {
  const [step, setStep] = useState<"request" | "reset">("request");
  const [identifier, setIdentifier] = useState("");
  const [sentMessage, setSentMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [forgotPassword, { isLoading: sending }] = useForgotPasswordMutation();
  const [resetPassword, { isLoading: resetting }] = useResetPasswordMutation();

  const requestForm = useForm<RequestForm>({ resolver: yupResolver(requestSchema) });
  const resetForm = useForm<ResetForm>({ resolver: yupResolver(resetSchema) });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async (id: string) => {
    try {
      const res = await forgotPassword({ identifier: id, mode }).unwrap();
      setIdentifier(id);
      setSentMessage(res.message);
      setCooldown(RESEND_SECONDS);
      setStep("reset");
    } catch (e) {
      toast.error(errMessage(e, "The code couldn't be sent. Please try again."));
    }
  };

  const onReset = async (data: ResetForm) => {
    try {
      const res = await resetPassword({ identifier, mode, code: data.code.trim(), newPassword: data.newPassword }).unwrap();
      toast.success(res.message);
      onBack();
    } catch (e) {
      toast.error(errMessage(e, "Password couldn't be changed. Please try again."));
    }
  };

  const isStaff = mode === "staff";

  if (step === "request") {
    return (
      <>
        <h1 className={styles.title}>Forgot your password?</h1>
        <p className={styles.subtitle}>
          {isStaff
            ? "Enter your email. We'll email you a 6-digit code."
            : "Enter the admission number. We'll send a 6-digit code by SMS to the registered mobile number."}
        </p>
        <form onSubmit={requestForm.handleSubmit((d) => sendCode(d.identifier.trim()))} className={styles.form}>
          <Input
            name="identifier"
            label={isStaff ? "Email" : "Admission Number"}
            type={isStaff ? "email" : "text"}
            register={requestForm.register}
            errors={requestForm.formState.errors}
            required
          />
          <Button type="submit" buttonType="primary" isLoading={sending} title="Send code" />
          <Button type="button" buttonType="link" title="Back to sign in" onClick={onBack} />
        </form>
      </>
    );
  }

  return (
    <>
      <h1 className={styles.title}>Enter the code</h1>
      <p className={styles.subtitle}>{sentMessage} It expires in 10 minutes.</p>
      <form onSubmit={resetForm.handleSubmit(onReset)} className={styles.form}>
        <Input name="code" label="6-digit code" type="text" register={resetForm.register} errors={resetForm.formState.errors} required placeholder="123456" />
        <Input name="newPassword" label="New password" type="password" register={resetForm.register} errors={resetForm.formState.errors} required />
        <Input name="confirmPassword" label="Confirm new password" type="password" register={resetForm.register} errors={resetForm.formState.errors} required />
        <Button type="submit" buttonType="primary" isLoading={resetting} title="Change password" />
        <Button
          type="button"
          buttonType="link"
          title={cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          onClick={() => cooldown <= 0 && !sending && sendCode(identifier)}
        />
        <Button type="button" buttonType="link" title="Use a different account" onClick={() => setStep("request")} />
        <p className={styles.subtitle} style={{ textAlign: "left", fontSize: 13 }}>
          No code? {isStaff ? "Ask the Super Admin" : "Ask the school office"} to reset your password
          {isStaff ? "" : ", or to update the mobile number on file"}.
        </p>
      </form>
    </>
  );
};

export default ForgotPassword;
