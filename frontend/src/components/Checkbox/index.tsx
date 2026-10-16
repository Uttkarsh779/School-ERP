import { motion } from "framer-motion";
import styles from "./Checkbox.module.css";
import type {
  UseFormRegister,
  FieldValues,
  FieldErrors,
  Path,
} from "react-hook-form";

interface CheckboxProps<T extends FieldValues> {
  name: Path<T>;
  label: string;
  register: UseFormRegister<T>;
  errors?: FieldErrors<T>;
}

const Checkbox = <T extends FieldValues = FieldValues>({
  name,
  label,
  register,
  errors,
}: CheckboxProps<T>) => {
  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  };

  return (
    <motion.div className={styles.formGroup} variants={itemVariants}>
      <input type="checkbox" id={name} {...register(name)} />
      <label htmlFor={name}>{label}</label>
      {errors && errors[name] && (
        <span className={styles.error}>
          {typeof errors[name]?.message === "string"
            ? errors[name]?.message
            : ""}
        </span>
      )}
    </motion.div>
  );
};

export default Checkbox;
