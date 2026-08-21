'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        if (body.status === 'bridge-unavailable') {
          setError('No se ha podido conectar con el servicio financiero.');
        } else {
          setError('La clave no es correcta.');
        }
        return;
      }

      const next = new URLSearchParams(window.location.search).get('next');
      const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      router.replace(destination);
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
      <p className="subtitle">Usa la misma clave privada de acceso de Finanzas Alberto.</p>

      <label className="field-label" htmlFor="password">Clave de acceso</label>
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
