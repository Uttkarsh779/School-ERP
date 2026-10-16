import { motion } from "framer-motion";
import styles from "./Button.module.css";
import BlockLoader from "./loader";

interface ButtonProps {
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  buttonType?: "primary" | "secondary" | "link";
  title: string;
}

const Button = ({
  type = "button",
  isLoading = false,
  buttonType = "primary",
  disabled = false,
  title = "",
  onClick = () => {},
}: ButtonProps) => {
  const buttonVariants = {
    hover: { scale: 1.03 },
    tap: { scale: 0.98 },
    disabled: { opacity: 0.6 },
  };

  return (
    <motion.button
      type={type}
      className={`${styles.btn} ${styles[buttonType]}`}
      variants={buttonVariants}
      disabled={disabled}
      whileHover={!isLoading ? "hover" : {}}
      whileTap={!isLoading ? "tap" : {}}
      animate={isLoading ? "disabled" : "visible"}
      onClick={!isLoading ? onClick : undefined}
    >
      {isLoading ? <BlockLoader /> : title}
    </motion.button>
  );
};

export default Button;
