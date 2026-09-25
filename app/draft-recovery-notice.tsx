import type { AuthRecoveryState } from "../src/application/auth-recovery";
import styles from "./draft-recovery-notice.module.css";

export function DraftRecoveryNotice({
  state,
  nextPath,
}: {
  state: AuthRecoveryState;
  nextPath: string;
}) {
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;

  return (
    <aside className={styles.notice} role="status" data-testid="draft-recovery-notice">
      <strong>{state === "required" ? "El borrador sigue en este formulario." : "No hemos descartado tus cambios."}</strong>
      <p>
        {state === "required"
          ? "Abre el acceso seguro en otra pestaña. Cuando termines, vuelve aquí y pulsa de nuevo la acción de guardar."
          : "El servicio de acceso no responde ahora mismo. Mantén esta pestaña abierta y vuelve a intentar la acción en unos instantes."}
      </p>
      {state === "required" ? (
        <a href={loginHref} target="_blank" rel="noopener noreferrer">
          Iniciar sesión en otra pestaña ↗
        </a>
      ) : null}
    </aside>
  );
}
