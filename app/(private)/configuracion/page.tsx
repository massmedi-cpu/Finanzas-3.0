import { APP_NAME, APP_VERSION } from "@/lib/version";

export default function ConfiguracionPage() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? "local";
  const environment = process.env.VERCEL_ENV ?? "development";
  return (
    <section className="pageStack">
      <header className="pageHeader"><div><p className="eyebrow">Sistema</p><h1>Configuración</h1><p>Estado, versión, datos, cuenta y preferencias.</p></div></header>
      <div className="settingsGrid">
        <article className="panel"><h2>Aplicación</h2><dl><div><dt>Nombre</dt><dd>{APP_NAME}</dd></div><div><dt>Versión</dt><dd>{APP_VERSION}</dd></div><div><dt>Commit</dt><dd>{commit}</dd></div><div><dt>Entorno</dt><dd>{environment}</dd></div></dl></article>
        <article className="panel"><h2>Datos</h2><p>La fuente oficial está configurada como solo lectura. La sincronización se habilitará al conectar la base aislada.</p><button className="secondaryButton" disabled>Actualizar datos</button></article>
        <article className="panel"><h2>Cuenta</h2><form action="/auth/signout" method="post"><button className="secondaryButton" type="submit">Cerrar sesión</button></form></article>
      </div>
    </section>
  );
}
