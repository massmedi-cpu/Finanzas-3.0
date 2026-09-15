import AppShell from "./app-shell";
import DashboardClient from "./dashboard-client";
import styles from "./home-audit.module.css";

export default function Home() {
  return (
    <AppShell>
      <div className={styles.scope}>
        <DashboardClient />
      </div>
    </AppShell>
  );
}
