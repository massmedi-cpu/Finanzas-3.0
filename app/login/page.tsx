import { Suspense } from 'react';
import LoginForm from './LoginForm';

export default function LoginPage() {
  return (
    <main className="login-page">
      <Suspense fallback={<div className="login-card">Cargando acceso…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
