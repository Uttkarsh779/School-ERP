import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: Variant;
  size?: "sm" | "md";
  isLoading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

const Button = ({
  variant = "primary",
  size = "md",
  isLoading = false,
  fullWidth = false,
  icon,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) => {
  const classes = [
    styles.button,
    styles[variant],
    size === "sm" ? styles.sm : "",
    fullWidth ? styles.fullWidth : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} disabled={disabled || isLoading} {...rest}>
      {isLoading ? <span className={styles.spinner} aria-hidden="true" /> : icon}
      {children}
    </button>
  );
};

export default Button;
