import { motion } from "framer-motion";
import styles from "./Select.module.css"; // Reuse same styles
import type {
  UseFormRegister,
  FieldValues,
  FieldErrors,
  FieldError,
  Merge,
  FieldErrorsImpl,
  Path,
} from "react-hook-form";

interface Option {
  label: string;
  value: string;
}

interface SelectProps<T extends FieldValues> {
  label: string;
  name: Path<T>;
  register: UseFormRegister<T>;
  options: Option[];
  errors?: FieldErrors<T>;
  required?: boolean;
  placeholder?: string;
}

const Select = <T extends FieldValues = FieldValues>({
  label,
  name,
  register,
  options,
  errors,
  required = false,
  placeholder = `Select your ${label.toLowerCase()}`,
}: SelectProps<T>) => {
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
      <select
        id={name}
        {...register(name, { required })}
        className={`${styles.input} ${error ? styles.inputError : ""}`}
        aria-invalid={error ? "true" : "false"}
        defaultValue=""
      >
        <option value="" disabled hidden>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <motion.p
          className={styles.errorMessage}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          role="alert"
        >
          {typeof error?.message === "string"
            ? error.message
            : "Invalid selection"}
        </motion.p>
      )}
    </motion.div>
  );
};

export default Select;
