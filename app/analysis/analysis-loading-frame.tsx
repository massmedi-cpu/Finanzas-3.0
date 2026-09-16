import styles from "./analysis.module.css";

export default function AnalysisLoadingFrame({
  message = "Preparando tus datos financieros…",
}: {
  message?: string;
}) {
  return (
    <main className={styles.shell} aria-busy="true">
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <p>FINANCIAL APP · INTELIGENCIA FINANCIERA</p>
          <div><h1>Análisis</h1></div>
          <span className={styles.periodCaption}>{message}</span>
        </div>
      </header>
      <div className={styles.skeletonWrap} role="status" aria-live="polite" aria-label="Cargando análisis financiero">
        <div className={styles.skeletonKpis}>{Array.from({ length: 4 }, (_, index) => <span key={index} />)}</div>
        <div className={styles.skeletonLarge} />
        <div className={styles.skeletonGrid}><span /><span /></div>
      </div>
    </main>
  );
}
