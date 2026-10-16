import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

interface AnimatedDivProps {
  children: ReactNode;
  direction?: "left" | "right" | "top" | "bottom";
  delay?: number;
  duration?: number;
  distance?: number;
  easing?: [number, number, number, number]; // Cubic bezier curve
  once?: boolean; // Only animate once
  immediate?: boolean;
}

const Div = ({
  children,
  direction = "left",
  delay = 0,
  duration = 0.5,
  distance = 25,
  easing = [0.42, 0, 0.58, 1], // Default ease-in-out
  once = true,
  immediate = false,
}: AnimatedDivProps) => {
  // Calculate initial position based on direction
  const getInitialPosition = () => {
    switch (direction) {
      case "left":
        return { x: -distance, opacity: 0 };
      case "right":
        return { x: distance, opacity: 0 };
      case "top":
        return { y: -distance, opacity: 0 };
      case "bottom":
        return { y: distance, opacity: 0 };
      default:
        return { x: -distance, opacity: 0 };
    }
  };

  const variants: Variants = {
    hidden: getInitialPosition(),
    visible: {
      x: 0,
      y: 0,
      opacity: 1,
      transition: {
        delay,
        duration,
        ease: easing,
      },
    },
  };

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      whileInView={!immediate && once ? "visible" : undefined}
      animate={immediate || !once ? "visible" : undefined}
      viewport={!immediate && once ? { once } : undefined}
    >
      {children}
    </motion.div>
  );
};

export default Div;
