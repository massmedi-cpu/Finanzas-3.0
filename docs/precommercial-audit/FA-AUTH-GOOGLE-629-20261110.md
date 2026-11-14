# FA-AUTH-GOOGLE-629 — Acceso privado con Google (10/11/2026)

Estado: **implementado en la rama candidata PR #619; NO verificado extremo a extremo; NO publicar**.

## Objetivo
Entrar con **Continuar con Google**, sin teclear correo y contraseña en Financial App, usando la cuenta **massmedi@gmail.com**. massmedi@google.com es otra dirección; no figura autorizada.

## Qué hace el cambio
- El botón principal redirige a Supabase Auth, que delega la identidad en Google. Se conserva acceso con contraseña como alternativa de recuperación oculta, hasta certificar Google en un navegador real.
- GET /api/auth/google: PKCE S256 y estado aleatorio; cookies HttpOnly, SameSite=Lax, Secure en producción, caducidad 5 minutos.
- GET /api/auth/google/callback: valida estado y verificador del mismo navegador, intercambia un código de un solo uso en servidor, limita respuestas, verifica financial_app_is_authorized() antes de establecer sesión.
- La autorización sigue ligada al auth.uid() existente de financial_app.authorized_users; una identidad Google no autorizada queda denegada y se revoca la sesión.
- Ninguna identidad ni token de Google se usa para sincronizar Drive o Sheets. No se modifican transacciones, origen bancario, SQL, RLS ni producción.

## Configuración externa pendiente de verificar
1. Google Cloud OAuth: configurar cliente **Aplicación web**, pantalla de consentimiento con la cuenta de prueba si aplica y URI de redirección autorizada **https://btzukbfesxdratqnxuoj.supabase.co/auth/v1/callback**. Este es el callback de Supabase, NO la URL de Financial App.
2. Supabase (proyecto financial-app, ID btzukbfesxdratqnxuoj), Authentication > Providers > Google: habilitar Google e introducir Client ID y Client Secret de forma privada. No copiar secretos en GitHub, Notion o chat.
3. Supabase Authentication > URL Configuration: permitir el retorno a **https://HOST-DE-PRUEBAS/api/auth/google/callback**, con el parámetro variable state, de forma restringida al host legítimo. Añadir el host de producción únicamente en su lanzamiento. Evitar comodines indiscriminados de dominio.
4. Probar desde Chrome normal, elegir **massmedi@gmail.com** y verificar que Google se vincula al usuario autorizado. Consulta de 10/11/2026: identidad actual solo email con correo verificado, Google aún no vinculado.
5. Verificar rechazo anónimo y no autorizado, inicio, renovación, cierre, lectura de datos, móvil y escritorio sin guardar secretos.
6. Solo con CI, backup, QA del propietario, reversión y postflight puede considerarse producción. No importar movimientos ni modificar origen.

## Evidencia
- Misma [PR #619](https://github.com/massmedi-cpu/Finanzas-3.0/pull/619); HEAD de la implementación inicial **271d6fe925621175fc897cf5750abf737f8128ce**.
- Suite sintética [google-sign-in-auth.spec.ts](https://github.com/massmedi-cpu/Finanzas-3.0/blob/chat/integrated-b-e-c-visual-20261010/tests/e2e/google-sign-in-auth.spec.ts): PKCE, estado, rutas públicas, retorno local, autorización, rechazo y revocación.
- CI del nuevo HEAD pendiente de estado terminal. No atribuirle resultados anteriores.
- La conexión Supabase disponible no permite configurar los proveedores Auth ni la consola de Google Cloud; es necesaria la activación del propietario desde dichos paneles. No está probado el acceso real del usuario.

Referencias: [Supabase Google OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) · [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) · [Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking).
