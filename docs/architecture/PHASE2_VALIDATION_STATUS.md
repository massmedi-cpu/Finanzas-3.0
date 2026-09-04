# Financial App 0.0.1 — Fase 2 · Estado de validación

Fecha de actualización: 04/09/2026

## Regla de continuidad

Este documento es un checkpoint técnico acumulativo. No sustituye el Prompt Maestro Axioma Definitivo ni la Fase 1 validada. Ante cualquier corte de chat o sesión, la reanudación debe partir del último estado real de GitHub, Supabase, Vercel y del Gantt oficial, nunca de un resumen incompleto de conversación.

## Estado porcentual oficial

- Fase 1 — Fundamentos: 100% completada; peso 8%; aporte global 8,0%.
- Fase 2 — Lectura e importación de datos: 80% validado; peso 10%; aporte global 8,0%.
- Progreso global validado: 16,0%.
- OCR permanece previsto para Fase 11, tramo global 93%–97%.

El porcentaje no aumenta por commits, tiempo ni volumen de código. Solo aumenta por trabajo real validado.

## Rama y protección acumulativa

- Base cerrada: `main` con Fase 1 validada al 100%.
- Rama activa: `rebuild/phase-2-data-quality`.
- Pull request de continuidad: #287, Draft, sin fusionar mientras Fase 2 siga abierta.
- HEAD funcional validado antes de este checkpoint documental: `cf13109fe36e1c91c509d3460487f3deda839482`.
- CI Preview E2E run `33916117682`: `success`.
- Build Next.js + Playwright desktop/móvil: **60 pruebas pasadas; 12 live omitidas; 0 fallos**.
- Configuración → Fuente bancaria está implementada y validada en CI: estado OAuth/runtime, garantía read-only, actualización solo tras POST confirmado, último sync persistido, cursores, retorno OAuth comprensible y recuperación explícita ante pérdida/revocación/fallo temporal de OAuth.
- Vercel ha vuelto a generar previews. El último READY comprobado corresponde al commit inmediatamente anterior `1a13ea90210d0e7d3514abbc5d9b3de89ca25618`; el HEAD `cf13109f…` todavía no dispone de deployment exacto, por lo que los gates live protegidos del HEAD no se contabilizan.
- `/api/source/google/status` se comprobó en vivo sobre ese preview READY y respondió `200`, confirmando que siguen ausentes exactamente `clientId`, `clientSecret`, `redirectUri`, `spreadsheetId` y `allowedEmail`.

## Supabase / runtime real

Comprobado directamente el 04/09/2026:

- proyecto dedicado: `financial-app` (`btzukbfesxdratqnxuoj`);
- Edge Function `financial-app-db-gateway`: `ACTIVE`;
- versión desplegada: **11**;
- contrato runtime: `contractVersion=2`;
- `sourceAccountLifecycle=true`;
- `canonicalProductSelection=true`.

La versión 11 propaga `lifecycle` en `source.sync_batch` hasta `financial_app.ensure_source_account_mapping(...)`. PostgreSQL conserva tanto la firma legacy de 7 argumentos como la firma lifecycle de 8 argumentos; por tanto el endpoint sintético antiguo sigue siendo compatible y la sincronización real utiliza explícitamente la firma nueva.

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

Las diez copias históricas coinciden con las canónicas en fecha, importe y saldo, pero las filas canónicas conservan una evidencia fuente más rica —incluido concepto bancario original y referencia documental—. La selección canónica evita tanto duplicación como degradación de la evidencia.

Todas las filas autoritativas tienen importe numérico válido y fecha admitida por el contrato. No se han encontrado colisiones de `ID origen` entre los 3.172 movimientos autoritativos.

### Valores de aceptación de primera importación

- saldo inicial derivado de cuenta corriente: **0,00 €**;
- saldo inicial derivado de cuenta ahorro: **0,00 €**;
- saldo inicial de prepago técnica archivada: **0,00 €**;
- último saldo observado de cuenta corriente en la fuente comprobada: **1.888,27 €**;
- último saldo observado de cuenta ahorro en la fuente comprobada: **186.957,72 €**;
- cursor esperado de la pestaña corriente tras primera importación completa: `CC-02963`;
- cursor esperado de la pestaña ahorro: `AH-00010`.

Estos valores son criterios de aceptación: la primera sincronización OAuth real no se considerará válida si los recuentos, productos, saldos iniciales o cursores se desvían sin una explicación demostrable de una revisión posterior de la fuente.

### Caso real `TP-00134`: ID físico no equivale a producto lógico

La fuente contiene una excepción de negocio comprobada:

- `ID origen`: `TP-00134`;
- fecha: `21/08/2026` en formato español;
- `Producto o cuenta`: `Cuenta corriente Openbank · 3967`;
- importe: `-21,00 €`;
- saldo: nulo;
- tipo: gasto;
- canal: tarjeta prepago.

La propia fuente indica que es una compra real realizada mediante la prepago, conciliada con la recarga interna `CC-02996`, pero reasignada lógicamente a cuenta corriente para contabilizar el gasto una sola vez. La recarga queda como traspaso interno y la prepago se mantiene solo como ledger técnico.

Conclusión contractual: **el prefijo del ID nunca decide el producto financiero**. La cuenta se determina por el contrato verificado de `Producto o cuenta`, institución, identificador y tipo de producto. Se añade una regresión específica para impedir que una refactorización futura vuelva a clasificar `TP-00134` como cuenta prepago por heurística.

### Orden y saldos

El gate de orden permanece deliberadamente definido como `newest-first` por fecha bancaria. No se añade una regla de continuidad estricta fila-a-fila del saldo porque la fuente no garantiza una secuencia intradía que permita deducir el saldo por simple adyacencia en todos los casos. Imponer esa regla produciría falsos errores. El saldo inicial se deriva únicamente del movimiento autoritativo más antiguo del producto cuando el contrato lo permite.

### Productos lógicos históricos

Contratos lógicos verificados:

- `Cuenta corriente Openbank · 3967` — activa, `checking`;
- `Cuenta ahorro Openbank · 2504` — activa, `savings`;
- `Tarjeta prepago Openbank · 8403` — archivada, ledger técnico `other`.

El motor separa pestañas físicas de productos lógicos y prefiere la fila de la pestaña canónica cuando un mismo ID aparece también en una copia histórica incrustada.

### Sincronización incremental

Validado mediante regresiones reales contra PostgreSQL con `BEGIN/ROLLBACK`, sin residuos:

- inserción inicial;
- idempotencia;
- revisiones inmutables de fuente;
- preservación de overrides manuales;
- auditoría de cambios de fuente;
- duplicados reversibles;
- preservación de duplicados confirmados manualmente;
- auditoría no destructiva de filas desaparecidas;
- reaparición sin falsos positivos;
- cursores independientes por pestaña;
- orden físico de cada pestaña preservado al persistir varios productos lógicos;
- guardia de orden newest-first;
- fuente original inmutable;
- creación de prepago como `archived` + `other` mediante la firma lifecycle.

El bloque funcional **Sincronización incremental** del Gantt permanece completado.

### OAuth / Vault

El flujo implementado mantiene:

- `state` en cookie HttpOnly + Secure + SameSite=Lax;
- scopes de identidad `openid email` solo para verificar identidad;
- scopes de recurso estrictamente `spreadsheets.readonly` y `drive.metadata.readonly`;
- correo Google verificado y allowlist explícita;
- lectura y validación completa del Sheet antes de almacenar refresh token;
- refresh token en Supabase Vault, nunca en navegador ni Git;
- rotación/desconexión sin residuos;
- pérdida concurrente de la conexión convertida en `409 google_oauth_not_connected`, sin falso éxito;
- refresh token revocado diferenciado de una indisponibilidad temporal de Google;
- indisponibilidad temporal de refresh preserva la conexión y obliga a reintentar, sin fingir desconexión;
- desconexión confirmada conserva movimientos e histórico previamente persistidos.

La regresión de Vault con `BEGIN/ROLLBACK` terminó previamente con `connection_residue=0` y `vault_residue=0`; `anon` y `authenticated` no tienen permiso para leer el refresh token.

La función PostgreSQL `financial_app.disconnect_google_oauth_connection()` fue inspeccionada directamente: solo elimina la fila de `google_oauth_connections` y su secreto de Vault. No toca `transactions` ni `transaction_source_records`. Las cinco funciones OAuth sensibles comprobadas no conceden `EXECUTE` a `anon`, `authenticated` ni `PUBLIC`.

### Configuración Fuente bancaria

Implementada y validada en CI para escritorio y móvil:

- navegación desde Configuración;
- estado OAuth/runtime visible;
- garantía explícita de solo lectura;
- bloqueo claro mientras falten credenciales;
- sincronización iniciada únicamente mediante POST real;
- no muestra éxito hasta recibir confirmación real;
- relectura del estado persistido tras sincronizar;
- último sync y cursores visibles;
- errores de retorno OAuth convertidos en mensajes comprensibles;
- query de retorno OAuth limpiada de la URL;
- desconexión segura que conserva el histórico;
- conexión perdida durante sync presentada como necesidad de reautorizar;
- caída temporal durante refresh presentada como error recuperable de reintento sin ocultar la conexión.

## Diagnóstico OAuth real pendiente

Comprobación live más reciente del entorno preview READY:

- endpoint: `/api/source/google/status`;
- respuesta HTTP: `200`;
- `configured=false`;
- ausentes exactamente:
  - `GOOGLE_OAUTH_CLIENT_ID`;
  - `GOOGLE_OAUTH_CLIENT_SECRET`;
  - `GOOGLE_OAUTH_REDIRECT_URI`;
  - `GOOGLE_BANK_SOURCE_SPREADSHEET_ID`;
  - `GOOGLE_OAUTH_ALLOWED_EMAIL`.

No se inventarán ni sustituirán por valores ficticios. Hasta configurar credenciales reales no puede ejecutarse desde la propia aplicación la primera importación Google controlada.

## Gates restantes para cerrar Fase 2

- Configurar/verificar las cinco variables OAuth Google reales con scopes estrictamente read-only.
- Ejecutar lectura real desde Financial App contra el Google Sheet oficial.
- Ejecutar primera importación real controlada y exigir los criterios de aceptación de 3.172 filas autoritativas, 3 productos, saldos iniciales y cursores esperados, salvo revisión posterior demostrada del origen.
- Repetir sincronización y demostrar idempotencia real sin duplicados.
- Verificar trazabilidad y ausencia de pérdida de modificaciones manuales tras una repetición real.
- Confirmar en persistencia real que la prepago queda archivada y no aparece como cuenta activa ordinaria.
- Ejecutar los gates live de preview sobre el deployment exacto del HEAD.
- Reejecutar gates de Fase 1 para demostrar ausencia de regresión.
- Actualizar Gantt final de Fase 2 y cerrar PR #287 solo con todas las evidencias verdes.

## Regla de cierre

No se debe fusionar Fase 2 ni declarar 100% mientras falte OAuth/importación real o el gate live del HEAD no haya sido ejecutado. Si un bloqueo externo impide un gate, se continúa avanzando en trabajo verificable independiente, pero el porcentaje permanece congelado hasta obtener evidencia real.
