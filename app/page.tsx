import InicioOverview from "./inicio-overview";
import styles from "./home-audit.module.css";

export default function Home() {
  return (
    <div className={styles.scope}>
      <InicioOverview />
    </div>
  );
}
