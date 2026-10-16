import { motion, type Easing, type Transition } from "framer-motion";
import styles from "./Button.module.css";

const BlockLoader = () => {
  const getBlockTransition = (delay: number): Transition => ({
    duration: 0.6,
    repeat: Infinity,
    repeatType: "reverse" as const,
    ease: "easeInOut" as Easing, // Properly typed as Easing
    delay,
  });

  const blockVariants = {
    start: {
      y: "0%",
    },
    end: {
      y: "100%",
    },
  };

  return (
    <div className={styles.blockLoader}>
      {[0, 0.2, 0.4].map((delay, index) => (
        <motion.span
          className={styles.block}
          variants={blockVariants}
          transition={getBlockTransition(delay)}
          key={index}
          animate="end"
        />
      ))}
    </div>
  );
};

export default BlockLoader;
