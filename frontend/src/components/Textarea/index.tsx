import { motion } from "framer-motion";
import styles from "./Textarea.module.css";
import type {
  UseFormRegister,
  FieldValues,
  FieldErrors,
  FieldError,
  Merge,
  FieldErrorsImpl,
  Path,
} from "react-hook-form";

interface TextareaProps<T extends FieldValues> {
  label: string;
  name: Path<T>;
  register: UseFormRegister<T>;
  errors?: FieldErrors<T>;
  required?: boolean;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}

const Textarea = <T extends FieldValues = FieldValues>({
  label,
  name,
  register,
  errors,
  required = false,
  placeholder = `Enter your ${label.toLowerCase()} here`,
  rows = 4,
  maxLength,
}: TextareaProps<T>) => {
  const itemVariants = {
    hidden: { opacity: 1, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  };

  const error = errors?.[name] as
    | FieldError
    | Merge<FieldError, FieldErrorsImpl<FieldError>>
    | undefined;

  return (
    <motion.div className={styles.formGroup} variants={itemVariants}>
      <label htmlFor={name} className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>
      <textarea
        id={name}
        {...register(name, { required })}
        className={`${styles.input} ${error ? styles.inputError : ""}`}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        aria-invalid={error ? "true" : "false"}
      />
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

export default Textarea;
