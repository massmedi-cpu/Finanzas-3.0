import { safeNextPath } from "../../src/infrastructure/auth/access-control";
import LoginForm from "./login-form";

type Props = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const next = Array.isArray(params.next) ? params.next[0] : params.next;

  return (
    <main className="reset-screen">
      <section className="reset-card" aria-labelledby="login-title">
        <p className="eyebrow">Financial App</p>
        <h1 id="login-title">Acceso privado</h1>
        <p>Esta aplicación contiene información financiera personal. Inicia sesión para continuar.</p>
        <div style={{ marginTop: "1.5rem", textAlign: "left" }}>
          <LoginForm nextPath={safeNextPath(next)} />
        </div>
      </section>
    </main>
  );
}
