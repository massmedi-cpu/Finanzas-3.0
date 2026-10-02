"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Props = {
  nextPath: string;
};

const LOGIN_ERROR_ID = "login-error";

type ErrorTarget = "email" | "form" | null;

export default function LoginForm({ nextPath }: Props) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [errorTarget, setErrorTarget] = useState<ErrorTarget>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!message) return;
    if (errorTarget === "email") emailRef.current?.focus();
    else errorRef.current?.focus();
  }, [errorTarget, message]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setPending(true);
    setMessage("");
    setErrorTarget(null);

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
        setErrorTarget("form");
      } else if (response.status === 503) {
        setMessage("El acceso seguro no está disponible temporalmente.");
        setErrorTarget("form");
      } else if (response.status === 403) {
        setMessage("Esta cuenta no tiene acceso autorizado a Financial App.");
        setErrorTarget("email");
      } else {
        setMessage("Correo o contraseña incorrectos.");
        setErrorTarget("form");
      }
    } catch {
      setMessage("No se ha podido conectar con el acceso seguro.");
      setErrorTarget("form");
    } finally {
      setPending(false);
    }
  }

  const invalid = Boolean(message);

  return (
    <form className="config-form" onSubmit={submit} noValidate aria-describedby={invalid ? LOGIN_ERROR_ID : undefined}>
      <label>
        Correo electrónico
        <input
          ref={emailRef}
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          maxLength={254}
          disabled={pending}
          aria-invalid={invalid ? "true" : undefined}
          aria-describedby={invalid ? LOGIN_ERROR_ID : undefined}
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
          aria-invalid={invalid ? "true" : undefined}
          aria-describedby={invalid ? LOGIN_ERROR_ID : undefined}
        />
      </label>
      {message ? (
        <p
          ref={errorRef}
          id={LOGIN_ERROR_ID}
          role="alert"
          tabIndex={-1}
          className="field-hint"
        >
          {message}
        </p>
      ) : null}
      <div className="form-actions">
        <button className="primary-button" type="submit" disabled={pending}>
          {pending ? "Comprobando…" : "Entrar"}
        </button>
      </div>
    </form>
  );
}
