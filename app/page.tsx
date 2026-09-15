import AppShell from "./app-shell";
import InicioClient from "./inicio-client";
import styles from "./home-audit.module.css";

export default function Home() {
  return (
    <AppShell>
      <div className={styles.scope}>
        <InicioClient />
      </div>
    </AppShell>
  );
}
