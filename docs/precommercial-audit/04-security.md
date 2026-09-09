# 04 · Auditoría de seguridad

## Dictamen

Financial App 10.0.0 tiene una seguridad **sólida para su instancia privada actual de propietario único**: Production exige autenticación, la autorización usa allowlist, las cookies son HttpOnly/Secure/SameSite=Lax, el gateway de base de datos valida OIDC exacto de Vercel, la fuente Google sólo obtiene scopes de lectura, el refresh token vive cifrado en Supabase Vault y el bucket documental es privado.

No obstante, una hipotética comercialización exige endurecer varias capas de defensa en profundidad y resolver dos bloqueos estructurales ya identificados: tenancy real y aislamiento Preview/Production.

## Evidencia viva y controles positivos

- `/api/transactions?limit=1` sin sesión en Production devuelve HTTP 401 `authentication_required`.
- Navegar sin sesión a `/transactions` termina en la pantalla de acceso privado.
- HSTS efectivo en Production: `max-age=63072000; includeSubDomains; preload`.
- Cookies de sesión: HttpOnly, Secure en Production, SameSite=Lax, host-only y path `/`.
- Login valida forma/tamaño, propaga 429 del proveedor y aplica allowlist después de autenticar; si la autorización falla, revoca la sesión.
- El proxy falla cerrado ante indisponibilidad de autenticación y no deja pasar rutas privadas.
- Gateway Supabase: JWT OIDC validado contra JWKS de Vercel, issuer/audience, owner, project, environment y subject exactos; payload comprimido máx. 2 MiB y descomprimido máx. 16 MiB.
- Esquema `financial_app`: sin grants directos de tablas financieras a `anon` o `authenticated`; acceso normal por gateway de servidor.
- Funciones revisadas tienen `search_path` endurecido; SECURITY DEFINER no depende del search path del llamador.
- OAuth Google: `state` de 32 bytes aleatorios, cookie HttpOnly/Secure/SameSite=Lax de 10 min y comparación constante; redirect URI exige HTTPS.
- OAuth Google sólo solicita `openid`, `email`, `spreadsheets.readonly` y `drive.metadata.readonly`; valida correo verificado y correo permitido.
- Refresh token Google no se guarda en texto plano en la tabla de conexión: se persiste como secreto en Supabase Vault y se reemplaza/elimina de forma transaccional.
- Bucket `financial-app-documents`: privado, límite 15 MiB y allowlist PDF/JPEG/PNG/WebP.
- Apertura Supabase usa URL firmada de 300 s.
- OCR Supabase sólo descarga HTTPS del host exacto de Storage y rechaza redirects; imágenes validan firma/MIME real, lado <= 12000, <=60 Mpx; OCR tiene timeouts. PDF limita procesamiento a 16 páginas y render a 2800 px/2.5x.

## Hallazgos

### SEC-001 — P0 comercial · No existe aislamiento por propietario/tenant a nivel de datos

**Área:** Autorización / datos  
**Evidencia:** las tablas financieras no tienen `user_id`/`tenant_id`; el único ownership de identidad reside en `authorized_users`.  
**Consecuencia actual:** aceptable para una instancia personal de único propietario.  
**Consecuencia comercial:** un backend compartido no puede garantizar aislamiento entre clientes por fila.  
**Recomendación:** resolver junto con ARC-001/BE-002 mediante tenancy incremental, constraints y defensa en profundidad en BD.  
**Esfuerzo:** Alto.  
**Riesgo de regresión:** Alto.  
**Prioridad:** P0 comercial.  
**Criterio de aceptación:** pruebas negativas de acceso cruzado para lectura, escritura, asociaciones, documentos y motores financieros.

### SEC-002 — P1 · Preview puede llegar al mismo datastore que Production

**Área:** Separación de entornos / integridad  
**Evidencia:** el gateway acepta OIDC `preview` y `production` y resuelve una única `SUPABASE_DB_URL`; las acciones de negocio mutables no están todas restringidas por environment.  
**Consecuencia:** un Preview o prueba manual defectuosa podría modificar datos reales aunque los health checks sintéticos actuales hagan rollback correctamente.  
**Recomendación:** persistencia aislada para Preview/Staging o bloqueo explícito de mutaciones normales desde Preview contra Production.  
**Esfuerzo:** Medio/alto.  
**Riesgo de regresión:** Medio.  
**Prioridad:** P1 antes de salida comercial.  
**Criterio de aceptación:** una identidad OIDC Preview no puede cambiar una sola fila de Production.

### SEC-003 — P1 comercial · Protección de contraseñas filtradas desactivada

**Área:** Autenticación / abuso  
**Evidencia:** Supabase Security Advisor mantiene `WARN` de leaked-password protection desactivada. El login sí maneja el rate limit de Supabase, pero no existe una política de contraseña comprometida habilitada en el proyecto actual.  
**Consecuencia:** una contraseña conocida en filtraciones puede seguir siendo aceptada si cumple el resto de requisitos del proveedor. En una aplicación financiera comercial esto reduce la defensa frente a credential stuffing.  
**Recomendación:** habilitar leaked-password protection cuando el plan/capacidad lo permita y mantener rate limiting/monitorización de autenticación. No fingir el control si la plataforma contratada no lo ofrece.  
**Esfuerzo:** Bajo si está disponible; de producto/plan si no.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P1 comercial / P2 para la instancia personal actual.  
**Criterio de aceptación:** contraseñas comprometidas conocidas son rechazadas y el login continúa respondiendo 429 sin revelar si existe la cuenta.

### SEC-004 — P2 · Cabeceras de endurecimiento web incompletas/no versionadas

**Área:** Navegador / XSS / clickjacking / privacidad  
**Evidencia:** HSTS está activo por Vercel, pero en la respuesta HTML auditada no aparecen CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` ni política de frame; además se expone `X-Powered-By: Next.js`. `next.config.ts` no define una política de headers de aplicación.  
**Consecuencia:** se desaprovechan defensas de navegador frente a inyección, framing y fuga de contexto; la seguridad efectiva depende más de defaults de plataforma.  
**Recomendación:** versionar headers seguros y desactivar `poweredByHeader`. Implantar CSP sólo después de inventariar scripts/workers/fuentes/OCR para no romper Next/Tesseract. Preferir `frame-ancestors 'none'` en CSP y `nosniff`, referrer y permissions policy explícitas.  
**Esfuerzo:** Medio por CSP; bajo para el resto.  
**Riesgo de regresión:** Medio si CSP se aplica sin pruebas.  
**Prioridad:** P2.  
**Criterio de aceptación:** headers verificados en Production y E2E completo sin recursos bloqueados ni regresiones OAuth/OCR.

### SEC-005 — P2 · CSRF se apoya en SameSite=Lax, sin validación explícita de origen para mutaciones

**Área:** CSRF / sesiones  
**Evidencia:** no se ha encontrado token CSRF ni comprobación `Origin`/`Sec-Fetch-Site` en proxy o rutas mutables. Las cookies sí son SameSite=Lax, Secure y host-only, lo que bloquea gran parte del CSRF cross-site estándar en navegadores modernos.  
**Consecuencia:** el riesgo actual es moderado/bajo, pero una app financiera comercial debería contar con una segunda barrera explícita para mutaciones sensibles y escenarios same-site/subdominio.  
**Recomendación:** helper central que exija origen same-origin (y opcionalmente Fetch Metadata) para POST/PATCH/PUT/DELETE autenticados, con excepciones explícitas sólo donde proceda. No introducir tokens CSRF redundantes si el control de origen cubre el modelo de amenazas.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Bajo/medio, especialmente OAuth/logout si se configura mal.  
**Prioridad:** P2.  
**Criterio de aceptación:** mutación autenticada con `Origin` externo es rechazada; navegación y callbacks legítimos continúan funcionando.

### SEC-006 — P2 · Finalización de upload confía en MIME/metadata antes de validar firma del contenido

**Área:** Upload / archivos maliciosos  
**Evidencia:** la firma de upload limita MIME y tamaño y genera un path UUID. `upload_finalize` comprueba existencia, path y `metadata.mimetype`, pero no inspecciona magic bytes. El OCR posterior sí valida firmas de imagen y el parser PDF rechaza PDFs inválidos, y el bucket es privado.  
**Consecuencia:** un archivo con contenido distinto al MIME declarado puede quedar almacenado/registrado aunque luego el OCR lo rechace. El riesgo de ejecución directa es reducido por bucket privado y URLs firmadas, pero el modelo comercial debería impedir que el documento llegue a estado confiable sin inspección.  
**Recomendación:** verificar firma real al finalizar o introducir estado `quarantined/pending_validation`; para PDF, parser/header seguro; para imágenes, reutilizar `readOcrImageMetadata`. Mantener límite 15 MiB y allowlist.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo/medio.  
**Prioridad:** P2.  
**Criterio de aceptación:** archivo renombrado o con MIME falso no puede registrarse como documento válido y no genera URL de consumo normal.

### SEC-007 — P3 · Rate limiting de login depende del proveedor

**Área:** Abuso / credential stuffing  
**Evidencia:** la aplicación propaga el 429 de Supabase y `Retry-After`, pero no tiene una capa propia de rate limiting por IP/cuenta ni telemetría de abuso versionada en el repositorio.  
**Consecuencia:** para la instancia personal el control del proveedor puede ser suficiente; a escala comercial falta una política observable y ajustable de abuso.  
**Recomendación:** definir límites/alertas a nivel edge/proveedor y registrar métricas sin almacenar contraseñas ni tokens. Evitar mensajes que permitan enumeración de cuentas.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P3 actual / P2 comercial.

## Controles que NO deben degradarse

- No ampliar scopes de Google: la fuente bancaria seguirá estrictamente en sólo lectura.
- No mover refresh tokens fuera de Vault.
- No hacer público el bucket documental.
- No abrir tablas financieras a `anon`/`authenticated` para “simplificar” RLS.
- No relajar validación exacta de proyecto/team/environment del OIDC Vercel.
- No exponer mensajes internos, secretos o tokens en errores/logs.

## Estado de fase

Seguridad: **COMPLETADA** para la primera ronda de auditoría. No se ha declarado “seguridad completa”: quedan SEC-001/002 como bloqueos de productización y SEC-003..007 como hardening previo a una salida comercial.
