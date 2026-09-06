"use client";

import { FormEvent, useState } from "react";

type Props = {
  nextPath: string;
};

export default function LoginForm({ nextPath }: Props) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setPending(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, next: nextPath }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const row = payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};

      if (response.ok) {
        window.location.assign(typeof row.next === "string" ? row.next : "/");
        return;
      }

      if (response.status === 429) {
        setMessage("Demasiados intentos. Espera un momento antes de volver a intentarlo.");
      } else if (response.status === 503) {
        setMessage("El acceso seguro no está disponible temporalmente.");
      } else {
        setMessage("Correo o contraseña incorrectos.");
      }
    } catch {
      setMessage("No se ha podido conectar con el acceso seguro.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="config-form" onSubmit={submit} noValidate>
      <label>
        Correo electrónico
        <input
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          maxLength={254}
          disabled={pending}
        />
      </label>
      <label>
        Contraseña
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={512}
          disabled={pending}
        />
      </label>
      {message ? <p role="alert" className="field-hint">{message}</p> : null}
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? "Comprobando…" : "Entrar"}
        </button>
      </div>
    </form>
  );
}
