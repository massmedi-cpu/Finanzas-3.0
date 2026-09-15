import AppShell from "./app-shell";
import InicioOverview from "./inicio-overview";
import styles from "./home-audit.module.css";

export default function Home() {
  return (
    <AppShell>
      <div className={styles.scope}>
        <InicioOverview />
      </div>
    </AppShell>
  );
}
