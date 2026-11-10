import { safeNextPath } from "../../src/infrastructure/auth/access-control";
import { PwaInstallButton } from "../pwa-install-button";
import LoginForm from "./login-form";
import styles from "./login.module.css";

type Props = {
  searchParams: Promise<{ next?: string | string[]; google_error?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = Array.isArray(params.next) ? params.next[0] : params.next;
  const googleError = Array.isArray(params.google_error) ? params.google_error[0] : params.google_error;
  const authMessage = googleError === "denied"
    ? "La cuenta de Google seleccionada no tiene acceso a Financial App, o has cancelado el inicio de sesión."
    : googleError === "unavailable"
      ? "No se ha podido completar el acceso con Google. Comprueba la configuración del proveedor e inténtalo de nuevo."
      : googleError === "invalid"
        ? "La identificación con Google ha caducado o no es válida. Vuelve a intentarlo desde esta página."
        : null;

  return (
    <main id="main-content" className="reset-screen">
      <section className="reset-card" aria-labelledby="login-title">
        <p className="eyebrow">Financial App</p>
        <h1 id="login-title">Acceso privado</h1>
        <p>Esta aplicación contiene información financiera personal. Inicia sesión para continuar.</p>
        {authMessage ? <p role="alert" className="field-hint">{authMessage}</p> : null}
        <div className={styles.formWrap}>
          <LoginForm nextPath={safeNextPath(next)} />
        </div>
        <div className={styles.installWrap}>
          <PwaInstallButton className="primary-button" promptOnly />
        </div>
      </section>
    </main>
  );
}
