import Image from "next/image";
import { GoogleLoginButton } from "@/components/google-login-button";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-logo-wrap"><Image src="/brand/logotipo.png" width={360} height={240} alt="Financial App" priority /></div>
        <p className="eyebrow">PRIVADO · SEGURO</p>
        <h1 id="login-title" className="sr-only">Financial App</h1>
        <p className="login-copy">Control, análisis, presupuesto y planificación financiera personal.</p>
        {error === "unauthorized" && <div className="auth-alert" role="alert">Esta cuenta de Google no está autorizada para acceder a Financial App.</div>}
        {error === "oauth" && <div className="auth-alert" role="alert">No se ha podido completar el acceso con Google. Inténtalo de nuevo.</div>}
        {error === "configuration" && <div className="auth-alert" role="alert">La autenticación todavía no está configurada en este entorno.</div>}
        <GoogleLoginButton />
        <small className="login-note">El acceso se realiza exclusivamente mediante Google OAuth. Financial App no utiliza contraseñas propias.</small>
      </section>
    </main>
  );
}
