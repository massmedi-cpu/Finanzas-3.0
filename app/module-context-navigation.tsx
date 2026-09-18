import Link from "next/link";
import type { ModuleContextLink } from "../src/application/navigation/module-context";
import styles from "./module-context-navigation.module.css";

export default function ModuleContextNavigation({
  links,
  ariaLabel = "Conexiones entre módulos",
}: {
  links: ModuleContextLink[];
  ariaLabel?: string;
}) {
  return (
    <nav className={styles.shell} aria-label={ariaLabel}>
      <div className={styles.intro}>
        <span>CONTINUAR EN</span>
        <strong>Otros módulos con el contexto útil</strong>
      </div>
      <div className={styles.links}>
        {links.map((item) => (
          <Link prefetch={false} className={styles.link} href={item.href} key={`${item.label}-${item.href}`}>
            <strong>{item.label}</strong>
            <span>{item.detail}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
