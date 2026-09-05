# Financial App 0.0.1 — Fase 2 · Estado de validación

Fecha de actualización: 05/09/2026

## Regla de continuidad

Este documento es el checkpoint técnico canónico y acumulativo de la Fase 2. No sustituye el **Prompt Maestro Axioma Definitivo** ni la Fase 1 ya validada. Ante cualquier corte de chat o sesión, la reanudación debe partir del último estado comprobado de GitHub, Supabase, Vercel y del Gantt oficial; nunca de una suposición ni de un resumen desactualizado.

## Estado porcentual oficial

- Fase 1 — Fundamentos: **100% completada**; peso 8%; aporte global 8,0%.
- Fase 2 — Lectura e importación de datos: **100% completada**; peso 10%; aporte global 10,0%.
- Progreso global validado: **18,0%**.
- Fases completadas: **2 de 13**.
- Fase 3 permanece **0% / Pendiente** hasta completar la transición de rama a `main`.
- OCR permanece deliberadamente en Fase 11, tramo global 93%–97%.

El porcentaje no aumenta por commits, tiempo ni cantidad de código. El salto de Fase 2 desde 88% a 100% se produce exclusivamente porque se han cerrado con evidencia real los gates que quedaban: lector Google operativo, preflight real, primera importación persistente, doble relectura idempotente, persistencia final, preview protegido y regresiones end-to-end.

## Rama y punto de cierre

- Repositorio: `massmedi-cpu/Finanzas-3.0`.
- Base cerrada de Fase 1: `main` en `fedbf83098abbfa9835806fe384f3a0a7c02a0fb`.
- Rama de Fase 2: `rebuild/phase-2-data-quality`.
- Pull request: **#287**, todavía sin fusionar en el momento de redactar este checkpoint.
- Checkpoint funcional exacto de cierre: `519f52eca75deefba57e95be1f9bfaeba4e9a810`.
- GitHub Actions de cierre funcional: **Preview E2E run `33967849635`**.
- Este documento es una actualización documental posterior al checkpoint funcional. No modifica el runtime ni sustituye la evidencia ejecutada sobre `519f52e…`.

## Resultado del gate final exacto

El run `33967849635`, ejecutado contra el preview protegido del SHA exacto `519f52eca75deefba57e95be1f9bfaeba4e9a810`, terminó completamente verde:

- `browser-interaction-e2e`: **SUCCESS**;
- `protected-preview-access`: **SUCCESS** mediante Trusted Source GitHub OIDC;
- `protected-preview-live`: **SUCCESS**;
- preview Vercel comprobado contra el mismo `GITHUB_SHA` antes de ejecutar el gate;
- `VERCEL_AUTOMATION_BYPASS_SECRET` vacío: el acceso no depende de desproteger el preview ni de un bypass artificial;
- Playwright live: **126/126 pruebas superadas** en desktop y móvil;
- preflight Google real: **SUCCESS**;
- doble sincronización real consecutiva: **SUCCESS** e idempotente.

Evidencia resumida emitida por el workflow:

```text
GOOGLE_SOURCE_PREFLIGHT|status=ok|revision=drive-version:97|rows=3172|accounts=3|cursors=2
GOOGLE_SOURCE_SYNC|status=ok|revision=drive-version:97|rows=3172|first_inserted=0|first_skipped=3172|second_inserted=0|second_skipped=3172|duplicates=984|cursors=2
```

Los 984 registros marcados como `suspected` son candidatos de duplicidad funcional detectados por el motor; no representan errores de importación ni filas duplicadas añadidas por la segunda lectura.

## Fuente bancaria oficial

La única fuente bancaria oficial permanece estrictamente de **solo lectura**:

- Google Sheet: `Movimientos bancarios - fuente`;
- ID: `1OT4QFeRDAchLkznnQvmAe3SslDVXDm1JXU_kIGIhtV8`;
- revisión usada por el gate final: `drive-version:97`;
- locale: `es_ES`;
- zona horaria: `Europe/Madrid`;
- contrato físico: exactamente 22 columnas;
- pestañas GRID:
  - `Cuenta corriente · 3967`;
  - `Cuenta ahorro · 2504`.

La aplicación no selecciona manualmente otro archivo, no escribe en Drive/Sheets y no utiliza la fuente como almacenamiento de estado de Financial App.

## Reconciliación real del histórico

Snapshot autoritativo validado:

- **3.172 movimientos**;
- **3.172 identidades origen autoritativas**;
- **3.024** movimientos lógicos de `Cuenta corriente Openbank · 3967`;
- **15** movimientos canónicos de `Cuenta ahorro Openbank · 2504`;
- **133** movimientos de `Tarjeta prepago Openbank · 8403` como ledger técnico archivado;
- **10** copias históricas `AH-00001`…`AH-00010` incrustadas en la pestaña corriente correctamente excluidas al existir su versión canónica en la pestaña de ahorro.

Productos resultantes:

- cuenta corriente — `checking`, activa;
- cuenta ahorro — `savings`, activa;
- tarjeta prepago — `other`, archivada.

Saldos iniciales derivados y validados: **0,00 €** para los tres productos. Cursores históricos preservados: `CC-02963` y `AH-00010`.

El contrato mantiene expresamente que el prefijo del ID físico no decide el producto lógico. El caso real `TP-00134` continúa protegido por regresión específica.

## Lector Google operativo

La ruta operativa de producción para la fuente es la cuenta de servicio de mínimo privilegio **Financial App Reader** dentro del proyecto Google Cloud `financial-app-507709`.

Se ha validado realmente que:

- Google Sheets API y Google Drive API son accesibles desde Financial App;
- la fuente está compartida con la identidad de servicio únicamente como **Lector**;
- el runtime reconoce `authMode=service-account`;
- la credencial está anclada al proyecto esperado y a la identidad esperada;
- el JWT solicita únicamente `spreadsheets.readonly` y `drive.metadata.readonly`;
- no existe selección manual del fichero oficial;
- el secreto `GOOGLE_SERVICE_ACCOUNT_JSON` permanece en Vercel y su contenido no se registra en Git, documentación ni navegador;
- la UI trata esta conexión como gestionada y no ofrece conectar/desconectar OAuth cuando está activo el modo de cuenta de servicio.

La implementación OAuth Web permanece como fallback/histórico y conserva sus protecciones, pero ya no es un requisito operativo para cerrar Fase 2.

## Primera importación persistente real

La primera sincronización real contra la fuente oficial se completó correctamente con el run persistido:

- `sync_run`: `7e9f7c38-0c79-40d4-a5a9-3d13777fa8e9`;
- revisión: `drive-version:97`;
- estado: `success`;
- filas vistas: **3.172**;
- insertadas: **3.172**;
- revisadas: **0**;
- omitidas: **0**;
- fallidas: **0**;
- warnings: **0**;
- cursores: **2**.

Después de esta primera importación PostgreSQL contenía exactamente 3.172 movimientos y 3.172 registros fuente, sin crecimiento espurio.

## Incidencia 546 y corrección acumulativa

La primera tentativa de segunda lectura completa encontró un `WORKER_RESOURCE_LIMIT` de Supabase Edge (HTTP 546) porque la revisión ya persistida se estaba recorriendo nuevamente fila por fila dentro de la Edge Function. La transacción se revirtió atómicamente y no dañó ni duplicó el dataset.

La corrección instalada en `financial-app-db-gateway` **v15** no desactiva validaciones ni convierte la sincronización en un falso éxito. Introduce una ruta set-based para una revisión estrictamente inmutable ya conocida. Solo se acepta como replay estable cuando coinciden simultáneamente:

- `source_revision`;
- fingerprint del esquema;
- todas las identidades de fila;
- todos los fingerprints de fuente;
- mappings de productos;
- cursores por pestaña.

La comparación se ejecuta dentro de una transacción con advisory lock por fuente. Si cualquiera de esos contratos no coincide, la operación vuelve al motor de ingesta completo. Existe regresión permanente para impedir que esta optimización relaje el contrato.

## Idempotencia end-to-end real

Después de instalar v15, el gate final ejecutó **dos sincronizaciones reales consecutivas** contra la misma revisión `drive-version:97`.

Resultado de ambas:

- filas vistas: **3.172**;
- insertadas: **0**;
- revisadas: **0**;
- omitidas: **3.172**;
- filas desaparecidas: **0**;
- warnings: **0**;
- cursores avanzados/verificados: **2**.

Runs persistidos de comprobación:

- `d82fc8d9-0e02-4396-b95b-02d38a4e784c` — success, 3.172 skips;
- `dc2effe4-6148-444f-b835-1b48ea914bce` — success, 3.172 skips.

Por tanto queda demostrada la idempotencia completa **Google → Financial App → PostgreSQL** sin depender de una simulación.

## Persistencia final comprobada

Consulta directa posterior al gate final:

- `financial_app.transactions`: **3.172**;
- `financial_app.transaction_source_records`: **3.172**;
- `financial_app.account_source_mappings`: **3**;
- `financial_app.sync_cursors`: **2**;
- `financial_app.sync_issues`: **0**;
- `financial_app.transaction_overrides`: **0**;
- cuentas activas: **2**;
- cuentas archivadas: **1**.

La doble relectura no creó movimientos, source records ni mappings adicionales. La prepago permanece archivada y las dos cuentas operativas permanecen activas.

## Sincronización incremental y calidad

Quedan validados acumulativamente:

- inserción inicial;
- idempotencia;
- revisiones inmutables de fuente;
- preservación de overrides manuales;
- auditoría de revisiones de fuente;
- detección y recomputación de duplicados;
- preservación de duplicados confirmados manualmente;
- auditoría no destructiva de filas desaparecidas;
- reaparición sin falsos positivos;
- cursores independientes por pestaña;
- orden `newest-first`;
- valla de revisión cuando Drive cambia durante una lectura;
- fuente original inmutable;
- producto prepago `other/archived`;
- transporte JSON/gzip con límites defensivos;
- contrato runtime v2 y colocación `eu-west-3`;
- rollback atómico ante fallos.

Los bloques `Lector de fuente bancaria`, `Sincronización incremental` y `Calidad de entrada` están marcados **Completada** en el Plan detallado oficial.

## Seguridad y protección

Se mantienen las protecciones validadas:

- preview Vercel protegido;
- Trusted Source independiente para Fase 1 y Fase 2;
- autenticación GitHub OIDC comprobada en el gate final;
- Edge Function con autenticación Vercel OIDC propia antes de abrir PostgreSQL;
- `verify_jwt=false` es deliberado porque el gateway no confía en el JWT estándar de Supabase: verifica issuer, audience, owner, project, environment y subject de Vercel;
- política Google privada y RLS deny-all para accesos cliente donde corresponde;
- funciones sensibles de OAuth/Vault sin `EXECUTE` para `PUBLIC`, `anon` o `authenticated`;
- refresh tokens OAuth, cuando se use el fallback, permanecen en Vault;
- secretos de Google nunca se registran en este documento.

## Regresión de Fase 1

El gate protegido final incluye las pruebas de Fundamentos y estas permanecen verdes dentro de las **126/126** pruebas live superadas. La Fase 2 no sustituye ni degrada la base validada de Fase 1.

## Criterios de cierre

Los criterios que mantenían Fase 2 en 88% han quedado satisfechos con evidencia real:

1. lector Google real y read-only — **cerrado**;
2. preflight contra la fuente oficial — **cerrado**;
3. primera importación persistente — **cerrado**;
4. segunda lectura idempotente — **cerrado**;
5. repetición consecutiva de idempotencia — **cerrado**;
6. trazabilidad y persistencia final exacta — **cerrado**;
7. Trusted Source y preview protegido — **cerrado**;
8. regresiones desktop/móvil y Fase 1 — **cerrado**.

**Conclusión técnica: Fase 2 = 100% validada. Progreso global = 18,0%.**

## Transición a Fase 3

No se considera iniciado ningún trabajo de Fase 3 mientras la rama de Fase 2 no complete su transición controlada a `main`. El siguiente paso es cerrar la evidencia del PR #287, validar el commit documental final sin alterar el runtime y, solo entonces, realizar la fusión de la Fase 2. Fase 3 parte después desde el 18% global, respetando íntegramente los avances validados de Fases 1 y 2.
