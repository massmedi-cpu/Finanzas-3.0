'use client';

import { FormEvent, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setupRequired = searchParams.get('setup') === '1';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const body = (await response.json()) as { ok?: boolean; status?: string };
      if (!response.ok || !body.ok) {
        setError(body.status === 'access-not-configured' ? 'La protección privada todavía no está configurada.' : 'Contraseña incorrecta.');
        return;
      }

      const next = searchParams.get('next');
      router.replace(next && next.startsWith('/') ? next : '/');
      router.refresh();
    } catch {
      setError('No se ha podido iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-card" onSubmit={submit}>
      <div className="eyebrow">Acceso privado</div>
      <h1 className="login-title">Finanzas 3.0</h1>
      <p className="subtitle">Tus datos financieros quedan protegidos antes de activar la sincronización.</p>

      {setupRequired && (
        <div className="login-notice">La aplicación está bloqueada hasta configurar la contraseña y el secreto de sesión.</div>
      )}

      <label className="field-label" htmlFor="password">Contraseña</label>
      <input
        id="password"
        className="control login-input"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        disabled={loading}
      />
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="primary-button" type="submit" disabled={loading || !password}>
        {loading ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
