import { forwardRef, type SelectHTMLAttributes } from "react";
import styles from "./Select.module.css";

export interface SelectOption {
  label: string;
  value: string | number;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, required, id, className, options, placeholder, ...rest }, ref) => {
    const selectId = id ?? rest.name;
    const { value, defaultValue, ...otherRest } = rest;
    return (
      <div className={styles.field}>
        {label && (
          <label className={styles.label} htmlFor={selectId}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          required={required}
          className={[styles.select, error ? styles.selectError : "", className ?? ""].filter(Boolean).join(" ")}
          aria-invalid={!!error}
          {...(value !== undefined ? { value } : { defaultValue: defaultValue ?? "" })}
          {...otherRest}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <span className={styles.error}>{error}</span>}
      </div>
    );
  }
);

Select.displayName = "Select";

export default Select;
