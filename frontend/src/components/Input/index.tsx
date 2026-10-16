import { useState } from "react";
import { motion } from "framer-motion";
import styles from "./Input.module.css";
import type {
  UseFormRegister,
  FieldValues,
  FieldErrors,
  FieldError,
  Merge,
  FieldErrorsImpl,
  Path,
  UseFormSetValue,
  PathValue,
} from "react-hook-form";

interface InputProps<T extends FieldValues> {
  label: string;
  name: Path<T>;
  type?: React.HTMLInputTypeAttribute;
  register: UseFormRegister<T>;
  errors?: FieldErrors<T>;
  setValue?: UseFormSetValue<T>;
  required?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
}

const Input = <T extends FieldValues = FieldValues>({
  label,
  name,
  type = "text",
  register,
  errors,
  setValue,
  required = false,
  placeholder = `Enter your ${label.toLowerCase()} here`,
  min = "",
  max = "",
}: InputProps<T>) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPasswordType = type === "password";
  const inputType = isPasswordType ? (showPassword ? "text" : "password") : type;

  const itemVariants = {
    hidden: { opacity: 1, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  };

  const getNestedError = (errors: FieldErrors, path: string) => {
    return path.split(".").reduce<unknown>((acc, part) => {
      if (acc && typeof acc === "object" && acc !== null) {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, errors);
  };

  const error = getNestedError(errors ?? {}, name) as
    | FieldError
    | Merge<FieldError, FieldErrorsImpl<FieldError>>
    | undefined;

  return (
    <motion.div className={styles.formGroup} variants={itemVariants}>
      <label htmlFor={name} className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>
      {type === "file" ? (
        <input
          id={name}
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (setValue && file) {
              setValue(name, file as PathValue<T, typeof name>);
            }
          }}
          className={`${styles.input} ${error ? styles.inputError : ""}`}
          aria-invalid={error ? "true" : "false"}
        />
      ) : (
        <div className={styles.inputWrapper}>
          <input
            id={name}
            type={inputType}
            {...register(name, { required })}
            className={`${styles.input} ${isPasswordType ? styles.passwordInput : ""} ${error ? styles.inputError : ""}`}
            placeholder={placeholder}
            aria-invalid={error ? "true" : "false"}
            min={min}
            max={max}
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
      )}

      {error && (
        <motion.p
          className={styles.errorMessage}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          role="alert"
        >
          {typeof error?.message === "string" ? error.message : "Invalid input"}
        </motion.p>
      )}
    </motion.div>
  );
};

export default Input;
