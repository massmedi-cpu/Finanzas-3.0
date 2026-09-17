import styles from "./loading.module.css";

export default function Loading() {
  return (
    <main className={styles.shell} role="status" aria-live="polite" aria-label="Cargando sección">
      <div className={styles.topBar} aria-hidden="true">
        <span className={styles.brandMark} />
        <span className={styles.navLine} />
        <span className={styles.navLineShort} />
      </div>
      <section className={styles.content} aria-hidden="true">
        <div className={styles.heading} />
        <div className={styles.summaryGrid}>
          <div className={styles.card} />
          <div className={styles.card} />
          <div className={styles.card} />
        </div>
        <div className={styles.panel} />
      </section>
      <span className={styles.srOnly}>Cargando la siguiente sección…</span>
    </main>
  );
}
