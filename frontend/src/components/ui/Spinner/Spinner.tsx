import styles from "./Spinner.module.css";

const Spinner = () => (
  <div className={styles.wrapper}>
    <div className={styles.spinner} role="status" aria-label="Loading" />
  </div>
);

export default Spinner;
