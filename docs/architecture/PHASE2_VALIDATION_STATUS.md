# Financial App 0.0.1 — Fase 2 · Estado de validación

Fecha de actualización: 05/09/2026

## Regla de continuidad

Este documento es el checkpoint técnico canónico y acumulativo de la Fase 2. No sustituye el Prompt Maestro Axioma Definitivo ni la Fase 1 validada. Ante cualquier corte de chat o sesión, la reanudación debe partir del último estado real de GitHub, Supabase, Vercel y del Gantt oficial, nunca de un resumen incompleto de conversación.

## Estado porcentual oficial

- Fase 1 — Fundamentos: **100% completada**; peso 8%; aporte global 8,0%.
- Fase 2 — Lectura e importación de datos: **88% validado**; peso 10%; aporte global 8,8%.
- Progreso global validado: **16,8%**.
- OCR permanece previsto para Fase 11, tramo global 93%–97%.

El porcentaje no aumenta por commits, tiempo ni volumen de código. Solo aumenta por trabajo real validado. Mientras permanezcan abiertos los gates externos de OAuth/importación real y preview protegido, el 88% queda congelado.

## Rama y protección acumulativa

- Base cerrada: `main` con Fase 1 validada al 100%.
- Rama activa: `rebuild/phase-2-data-quality`.
- Pull request de continuidad: #287, Draft, sin fusionar mientras Fase 2 siga abierta.
- HEAD actual validado por CI: `ee68f4ea3f1c00f2e9e96ea0e71a46f9a99f7265`.
- Último SHA con código de aplicación/runtime: `7bbe489bf18f68c77f00beb72cccc55f492caa76`.
- GitHub Actions Preview E2E run `33930592739`: build de producción + TypeScript + Playwright/core-health **verdes**.
- Playwright: **94 tests totales · 82 passed · 12 live skipped · 0 failed** en desktop y móvil.
- Los 12 omitidos corresponden exclusivamente a los 6 gates live de preview protegido ejecutados en ambos perfiles.
- El commit `ee68f4ea…` solo endurece el test del contrato de configuración; no modifica runtime de la aplicación.
- Vercel no generó deployment propio para `ee68f4ea…` por límite diario de despliegues. GitHub registra `Deployment rate limited — retry in 24 hours.`
- El deployment READY más reciente del código ejecutable `7bbe489b…` es `dpl_GJ16p8dGqChS1weBKEeZ1G8fPKFK`.
- No se contabiliza como gate live del HEAD actual ningún 302, SSO, share URL ni deployment de SHA distinto.

## Supabase / runtime real

Comprobado directamente el 04–05/09/2026:

- proyecto dedicado: `financial-app` (`btzukbfesxdratqnxuoj`);
- Edge Function `financial-app-db-gateway`: **ACTIVE v12**;
- contrato runtime: `contractVersion=2`;
- `sourceAccountLifecycle=true`;
- `canonicalProductSelection=true`;
- Security Advisor: **0 lints** tras el último DDL;
- las regresiones PostgreSQL de la política Google terminan con rollback limpio y sin residuos sintéticos.

La v12 conserva la autenticación personalizada Vercel OIDC dentro del gateway antes de abrir PostgreSQL. `verify_jwt=false` se mantiene deliberadamente porque el gateway no usa el JWT estándar de Supabase: verifica issuer, audience, owner, project, environment y subject de Vercel de forma explícita.

## Política privada de cuenta Google autorizada

La cuenta Google autorizada ya no es una variable de entorno de Vercel ni un dato que deba viajar por el navegador.

Se ha centralizado en Supabase mediante:

- migración `20260904231301_google_source_private_policy`;
- tabla privada `financial_app.google_source_policy`;
- lectura de política mediante gateway server-only;
- verificación fail-closed en PostgreSQL antes de almacenar la conexión OAuth/refresh token;
- rechazo de política ausente o cuenta distinta;
- regresión SQL con rollback y residuos finales `connections=0`, `mappings=0`, `transactions=0`;
- política RLS restrictiva explícita mediante `20260904233200_google_source_policy_explicit_deny` para `anon` y `authenticated`.

El Security Advisor volvió a **0 lints** después de instalar la política deny-all explícita.

El contrato de interfaz está blindado por Playwright: cuando falta configuración externa, solo pueden aparecer como pendientes `clientId` y `clientSecret`; `allowedEmail` no puede volver a tratarse como una variable externa.

## Evidencias ya validadas

### Fuente oficial

Google Sheet oficial comprobado exclusivamente en lectura:

- título: `Movimientos bancarios - fuente`;
- locale: `es_ES`;
- zona horaria: `Europe/Madrid`;
- contrato físico: exactamente 22 columnas;
- pestañas físicas:
  - `Cuenta corriente · 3967`;
  - `Cuenta ahorro · 2504`.

### Reconciliación integral del dataset real

Se exportó una copia temporal solo para análisis, sin modificar el Google Sheet oficial, y se contrastó la fuente completa.

Resultado autoritativo esperado para una primera importación correcta:

- **3.172 movimientos autoritativos**;
- **3.172 IDs origen únicos**;
- **3.024** movimientos lógicos de `Cuenta corriente Openbank · 3967`;
- **15** movimientos canónicos de `Cuenta ahorro Openbank · 2504`;
- **133** movimientos de `Tarjeta prepago Openbank · 8403` como ledger técnico archivado;
- **10 copias históricas de ahorro** incrustadas en la pestaña corriente (`AH-00001`…`AH-00010`) que deben descartarse al existir su copia canónica en `Cuenta ahorro · 2504`.

Las diez copias históricas coinciden con las canónicas en fecha, importe y saldo, pero las filas canónicas conservan evidencia fuente más rica. La selección canónica evita duplicación y degradación de evidencia.

Todas las filas autoritativas tienen importe numérico válido y fecha admitida por el contrato. No se encontraron colisiones de `ID origen` entre los 3.172 movimientos autoritativos.

### Valores de aceptación de primera importación

- saldo inicial derivado de cuenta corriente: **0,00 €**;
- saldo inicial derivado de cuenta ahorro: **0,00 €**;
- saldo inicial de prepago técnica archivada: **0,00 €**;
- último saldo observado de cuenta corriente en la fuente comprobada: **1.888,27 €**;
- último saldo observado de cuenta ahorro en la fuente comprobada: **186.957,72 €**;
- cursor esperado de la pestaña corriente tras primera importación completa: `CC-02963`;
- cursor esperado de la pestaña ahorro: `AH-00010`.

Estos valores son criterios de aceptación. Una futura primera sincronización OAuth real no se considerará válida si los recuentos, productos, saldos iniciales o cursores se desvían sin una revisión posterior demostrada de la fuente.

### Caso real `TP-00134`: ID físico no equivale a producto lógico

La fuente contiene una excepción de negocio comprobada:

- `ID origen`: `TP-00134`;
- fecha: `21/08/2026`;
- `Producto o cuenta`: `Cuenta corriente Openbank · 3967`;
- importe: `-21,00 €`;
- saldo: nulo;
- tipo: gasto;
- canal: tarjeta prepago.

La propia fuente indica que es una compra real realizada mediante prepago y conciliada con la recarga interna `CC-02996`, pero reasignada lógicamente a cuenta corriente para contabilizar el gasto una sola vez. La recarga queda como traspaso interno y la prepago se mantiene solo como ledger técnico.

Conclusión contractual: **el prefijo del ID nunca decide el producto financiero**. La cuenta se determina por el contrato verificado de `Producto o cuenta`, institución, identificador y tipo de producto. Existe una regresión específica para impedir heurísticas por prefijo.

### Orden y fechas

- Orden autoritativo: `newest-first` por fecha bancaria.
- No se impone continuidad estricta fila-a-fila del saldo porque la fuente no garantiza una secuencia intradía suficiente para deducirla sin falsos errores.
- El saldo inicial se deriva únicamente del movimiento autoritativo más antiguo cuando el contrato lo permite.
- El parser admite fecha serial de Google Sheets, ISO `YYYY-MM-DD` y española `DD/MM/YYYY`.
- El lector aplica una valla de revisión: si Drive cambia durante la lectura, el snapshot completo se rechaza y no se mezcla evidencia de dos revisiones.

### Productos lógicos históricos

Contratos lógicos verificados:

- `Cuenta corriente Openbank · 3967` — activa, `checking`;
- `Cuenta ahorro Openbank · 2504` — activa, `savings`;
- `Tarjeta prepago Openbank · 8403` — archivada, ledger técnico `other`.

El motor separa pestañas físicas de productos lógicos y prefiere la fila de la pestaña canónica cuando un mismo ID aparece también en una copia histórica incrustada.

### Sincronización incremental y persistencia

Validado mediante regresiones reales contra PostgreSQL con `BEGIN/ROLLBACK`, sin residuos:

- inserción inicial;
- idempotencia;
- revisiones inmutables de fuente;
- preservación de overrides manuales;
- auditoría de cambios de fuente;
- duplicados reversibles y recomputación tras revisiones;
- preservación de duplicados confirmados manualmente;
- auditoría no destructiva de filas desaparecidas;
- reaparición sin falsos positivos;
- cursores independientes por pestaña;
- orden físico de cada pestaña preservado al persistir varios productos lógicos;
- guardia de orden newest-first;
- fuente original inmutable;
- creación de prepago como `archived` + `other` mediante la firma lifecycle;
- compatibilidad controlada entre la firma legacy de 7 argumentos y la firma lifecycle de 8 argumentos de `ensure_source_account_mapping(...)`.

La ambigüedad entre ambas firmas fue corregida mediante `20260904222622_disambiguate_source_account_mapping_overloads` y cuenta con regresión específica.

También se ejecutó previamente una simulación equivalente al volumen completo reconciliado:

- primera pasada: **3.172 inserciones**;
- segunda pasada: **3.172 skips**;
- sin crecimiento espurio;
- overrides preservados;
- dos cuentas activas + prepago `other/archived`;
- final sin residuos.

El bloque funcional **Sincronización incremental** del Gantt permanece completado.

### Preflight y guardia histórica

La primera importación Google queda bloqueada hasta superar una prevalidación completa de solo lectura. El preflight:

- lee y valida el workbook completo;
- no persiste movimientos;
- no modifica Google Drive ni Google Sheets;
- resume productos, tipos/lifecycle, recuentos, saldos iniciales y cursores;
- solo después habilita la primera escritura;
- las sincronizaciones posteriores vuelven a validar el snapshot completo antes de persistir.

`assertOfficialSourceHistoricalBaseline(...)` está centralizado en preflight y sincronización real. Permite crecimiento por movimientos nuevos y bloquea regresiones del histórico conocido: pérdida de filas, desaparición/reclasificación de productos, cambios de lifecycle/tipo/saldo inicial y pérdida de pestañas o extremos históricos verificados.

### OAuth / Vault

El flujo implementado mantiene:

- `state` en cookie HttpOnly + Secure + SameSite=Lax;
- scopes de identidad `openid email` solo para verificar identidad;
- scopes de recurso estrictamente `spreadsheets.readonly` y `drive.metadata.readonly`;
- correo Google verificado frente a política privada de Supabase;
- lectura y validación completa del Sheet antes de almacenar refresh token;
- refresh token en Supabase Vault, nunca en navegador ni Git;
- rotación/desconexión sin residuos;
- pérdida concurrente de la conexión convertida en `409 google_oauth_not_connected`, sin falso éxito;
- refresh token revocado diferenciado de indisponibilidad temporal;
- indisponibilidad temporal preserva la conexión y obliga a reintentar;
- desconexión confirmada conserva movimientos e histórico previamente persistidos.

Las funciones OAuth sensibles comprobadas no conceden `EXECUTE` a `anon`, `authenticated` ni `PUBLIC`.

### Configuración · Fuente bancaria

Implementada y validada en CI para escritorio y móvil:

- navegación desde Configuración;
- estado OAuth/runtime visible;
- garantía explícita de solo lectura;
- bloqueo claro mientras falten credenciales;
- preflight obligatorio antes de primera importación;
- sincronización iniciada únicamente mediante POST real;
- no muestra éxito hasta recibir confirmación real;
- relectura del estado persistido tras sincronizar;
- último sync y cursores visibles;
- errores de retorno OAuth convertidos en mensajes comprensibles;
- query de retorno OAuth limpiada de la URL;
- desconexión segura que conserva el histórico;
- conexión perdida durante sync presentada como necesidad de reautorizar;
- caída temporal durante refresh presentada como error recuperable;
- responsive sin scroll horizontal en el viewport móvil validado.

## Diagnóstico OAuth y preview protegido

La configuración manual externa se ha reducido a las credenciales reales del OAuth Client Web de Google:

- `GOOGLE_OAUTH_CLIENT_ID`;
- `GOOGLE_OAUTH_CLIENT_SECRET`.

La URI de retorno se deriva del entorno de Vercel. El Google Sheet oficial se descubre/verifica mediante Drive y el `source_file_id` se persiste tras la autorización. La cuenta permitida procede de la política privada de Supabase.

No se inventarán ni sustituirán `CLIENT_ID` ni `CLIENT_SECRET` por valores ficticios.

El gate protegido continúa bloqueado por Vercel Deployment Protection:

- GitHub Actions genera correctamente un token OIDC efímero;
- `VERCEL_AUTOMATION_BYPASS_SECRET` no está configurado;
- el header documentado `x-vercel-trusted-oidc-idp-token` es rechazado por el branch preview durante 24 intentos;
- por tanto `protected-preview-live` se omite deliberadamente;
- los intentos vía SSO/share URL devuelven 302 y no se contabilizan como éxito;
- el workflow incorpora diagnóstico seguro de claims OIDC y del HTTP final sin imprimir el token, para poder ajustar la Trusted Source con evidencia exacta.

## Gates restantes para cerrar Fase 2

1. Configurar/verificar `GOOGLE_OAUTH_CLIENT_ID` y `GOOGLE_OAUTH_CLIENT_SECRET` reales de un OAuth Client Web de Google Cloud.
2. Autorizar la cuenta permitida y ejecutar el preflight real desde Financial App contra la fuente oficial.
3. Ejecutar la primera importación persistente real y contrastarla con los criterios de aceptación de 3.172 movimientos, tres productos, saldos iniciales y cursores, salvo crecimiento posterior demostrado de la fuente.
4. Ejecutar una segunda sincronización real y demostrar idempotencia end-to-end Google → Financial App → PostgreSQL.
5. Verificar en persistencia real trazabilidad, revisiones, overrides y prepago archivada tras esa segunda lectura.
6. Autorizar correctamente la Trusted Source OIDC de Vercel para esta rama/repositorio o configurar un Automation Bypass seguro; ejecutar después todos los gates live sobre un deployment cuyo SHA ejecutable coincida exactamente.
7. Reejecutar las regresiones de Fase 1 sobre el esquema final de Fase 2.
8. Actualizar Gantt final, sacar PR #287 de Draft y fusionar únicamente cuando toda la Fase 2 quede verde.

## Regla de cierre

No se debe fusionar Fase 2 ni declarar 100% mientras falte OAuth/importación real o el gate live protegido no haya sido ejecutado realmente. Un bloqueo externo se documenta y no se maquilla como éxito. OCR permanece aislado para Fase 11.
