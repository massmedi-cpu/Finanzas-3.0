import Link from "next/link";
import styles from "./number-explanation.module.css";

export type NumberExplanationRow = {
  label: string;
  text: string;
};

export type NumberExplanationLink = {
  href: string;
  label: string;
};

export default function NumberExplanation({
  rows,
  links = [],
}: {
  rows: NumberExplanationRow[];
  links?: NumberExplanationLink[];
}) {
  return (
    <details className={styles.explanation}>
      <summary>Explicar cifras</summary>
      <div className={styles.body}>
        <dl>
          {rows.map((row) => (
            <div key={`${row.label}:${row.text}`}>
              <dt>{row.label}</dt>
              <dd>{row.text}</dd>
            </div>
          ))}
        </dl>
        {links.length > 0 && (
          <nav className={styles.links} aria-label="Abrir detalle de las cifras">
            {links.map((link) => <Link prefetch={false} key={`${link.href}:${link.label}`} href={link.href}>{link.label}</Link>)}
          </nav>
        )}
      </div>
    </details>
  );
}
