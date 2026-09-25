import styles from "./compare.module.css";

export default function ComparisonLoadingFrame({
  message = "Preparando la comparación financiera…",
}: {
  message?: string;
}) {
  return (
    <main className={styles.shell} aria-busy="true">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>FINANCIAL APP · DECISIÓN CON DATOS</p>
          <h1>Comparador</h1>
          <span className={styles.headerCopy}>{message}</span>
        </div>
      </header>
      <div className={styles.skeleton} role="status" aria-live="polite" aria-label="Cargando comparador financiero">
        <span className={styles.skeletonFilters} />
        <div className={styles.skeletonCards}>{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
        <div className={styles.skeletonPanels}><span /><span /></div>
      </div>
    </main>
  );
}
