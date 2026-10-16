import { forwardRef, useState, type InputHTMLAttributes } from "react";
import styles from "./Input.module.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, required, id, className, type = "text", ...rest }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPasswordType = type === "password";
    const inputType = isPasswordType ? (showPassword ? "text" : "password") : type;
    const inputId = id ?? rest.name;

    return (
      <div className={styles.field}>
        {label && (
          <label className={styles.label} htmlFor={inputId}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}
        <div className={styles.inputWrapper}>
          <input
            ref={ref}
            id={inputId}
            type={inputType}
            required={required}
            className={[styles.input, isPasswordType ? styles.passwordInput : "", error ? styles.inputError : "", className ?? ""].filter(Boolean).join(" ")}
            aria-invalid={!!error}
            {...rest}
          />
          {isPasswordType && (
            <button
              type="button"
              className={styles.togglePasswordBtn}
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          )}
        </div>
        {error ? <span className={styles.error}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
