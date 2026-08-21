import { GoogleLoginButton } from "@/components/google-login-button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="loginPage">
      <section className="loginCard">
        <div className="brandMark large">F</div>
        <p className="eyebrow">Privado · Seguro</p>
        <h1>Financial App</h1>
        <p className="muted">Control total y planificación financiera inteligente.</p>
        {error === "unauthorized" && <div className="alert" role="alert">Esta cuenta de Google no está autorizada para acceder a Financial App.</div>}
        {error === "oauth" && <div className="alert" role="alert">No se ha podido completar el acceso con Google. Inténtalo de nuevo.</div>}
        <GoogleLoginButton />
        <small>El acceso se realiza exclusivamente mediante Google OAuth.</small>
      </section>
    </main>
  );
}
