# REC-SYNC-262–273 / REC-BANK-263–274 · sincronización confirmada

Fecha: 21/10/2026. Continuidad de PR #619, desde `626ee2323c5fb501143f7dd24aaed57fd97f301f`.
Versión declarada de la candidata: 10.0.103, **sin publicación ni cambio artificial de versión**. La futura release requiere identidad nueva conforme a su política.

## Problema y comportamiento nuevo

Las pantallas de fuente comprobaban el formato, pero el POST posterior no vinculaba la importación al contenido que se acababa de comprobar. Inicio y la preferencia automática enviaban directamente el POST. Esta última consideraba suficiente cualquier HTTP 200 para registrar una sincronización automática correcta. Un recibo internamente coherente tampoco demostraba que correspondiera al número de filas y pestañas prevalidado.

Ahora los cuatro recorridos usan `source-sync-client.ts`: preflight completo, confirmación mínima del contenido y recibo comprobado, sin reintentar una mutación de resultado incierto. El modo explícito de diagnóstico puede conservar una comprobación para un solo intento; el servidor vuelve a leer igualmente.

El preflight calcula SHA-256 del lote canónico completo, incluyendo revisión, esquema, cuentas, filas y orden. El servidor exige una confirmación JSON limitada a 2.048 bytes; verifica la sesión y el workspace, relee la fuente y compara identidad, revisión, esquema, contenido y recuento antes de persistir. Una diferencia devuelve 409 y exige comprobar de nuevo. Un recibo incoherente devuelve resultado no confirmado y no acredita éxito ni rollback. La validación de Auth, el gateway canónico y las protecciones de previews permanecen activos.

## Control de saldos y experiencia

«Comprobar sin importar» permite inspeccionar el archivo en modo solo lectura. Un único informe, compartido con diagnóstico, presenta por producto los pares de saldos comparables, coincidentes, discontinuos y no verificables. La comparación conserva el orden bancario más reciente primero, separa las cuentas aunque compartan pestaña y usa enteros/BigInt. Un saldo nulo interrumpe la cadena y nunca se sustituye por cero ni se salta para inventar continuidad.

Una discontinuidad es un aviso, no prueba de pérdida o duplicación; no se corrige el original ni se bloquea por una historia incompleta conocida. El informe aclara que una coincidencia aritmética no certifica cobertura documental completa ni conciliación contra la base de datos. No incluye un motor alternativo de ingresos/gastos ni cambia sus definiciones.

## Verificación local final

- `npm run typecheck`: PASS.
- `npm run build`, con todos los guards acumulativos de postbuild: PASS.
- Gate visual obligatorio, selector G5 sintético, revisión del diff y YAML con permisos `contents: read`: PASS. Los nuevos archivos y casos quedan incluidos en los disparadores y en el gate; no se reducen umbrales ni se retiran regresiones.
- **224/224 pruebas PASS, 0 omitidas, 0 inesperadas, 0 flaky, 0 errores globales**, duración 125.133 ms. Resultado estructurado de Playwright, con `--fail-on-flaky-tests`, sobre el build optimizado final. Incluye contratos, límites históricos, preparación de 3.000/10.000 observaciones, ambas superficies de fuente, Auth anónimo, recibos, sincronización automática, Inicio, actividad, saldos y contraste Cash Flow.
- `REC-BANK-274`: siete anchuras (360, 390, 768, 1024, 1366, 1920, 2560), ambos temas y ambos perfiles de navegador; sin desbordamiento global y sin infracciones Axe dentro del informe. Capturas sintéticas inspeccionadas. Chromium local 153.0.8010.0, Node 24.19.0; no equivale a móvil físico ni a la versión de Chromium de Actions.
- Referencias esperadas independientes para saldos, nulos, cuentas intercaladas, discontinuidades y desbordamiento numérico; fuente sintética intacta. Mocks HTTP están identificados y no certifican persistencia cloud ni un import real.

Se conserva el fallo basal de CI de `626ee232`: 85 SUCCESS, 1 FAILURE y 1 SKIPPED, con un caso de contraste intermitente en móvil. El test de contraste ahora espera la composición final y exige simultáneamente igualdad de tokens y WCAG AA 4,5:1. La espera de la matriz responsive comprueba el tamaño final tras ResizeObserver; no oculta ni recorta desbordamientos. Los dos tests antiguos de navegación ahora comprueban la navegación visible correspondiente a escritorio o móvil.

## Alcance y salida

Axioma aplicable: 17–24 (fuente e idempotencia), 27–29 (seguridad y errores), 32–34 (evidencia), 39–46 (fechas e importes), 47–48 (calidad), 51 (lectura), 61 y 67–90 (feedback, responsive y accesibilidad), 136 y 139–143 (continuidad y aceptación).

Ninguna escritura financiera productiva, sincronización real, migración, cambio ACL de Drive, original privado, dato de demostración en producción, gasto, merge ni despliegue productivo. Producción verificada mediante `/api/build`: 10.0.103, `6dad59c6c2db3575618a7c91c49c3060a93bbba1`, deployment `dpl_34WhAcvVpP6YrdbxAckDgm3TWwz5`.

AP1/AP5 mejoran en código y evidencia local. AP1–AP8 **no se cierran**: faltan OCR G5 original y persistencia privada, dos identidades cloud en entorno segregado, restore/upgrade real aislado y conciliación/sync autorizada con postflight. Las pestañas antiguas sin el contrato nuevo deben recargarse; el servidor las rechaza de forma segura. El Gantt no obtiene avance de aceptación por contar líneas o tests.

Siguiente comprobación: CI y preview del SHA remoto exacto de este bloque; documentar su resultado terminal en los lugares canónicos, conservando PR #619 y #620 en DRAFT/NO MERGE mientras sigan abiertas las puertas.

## Continuación de Chat · REC-SYNC-275–279 · integridad de cursores físicos

Este bloque se añade a la PR #619 sin alterar datos reales ni la versión
publicada. Análisis basado en el código de la rama acumulativa y en los logs
exactos de GitHub Actions, no en conjeturas sobre los movimientos bancarios.

### CI basal observada y reparación

La CI final del commit `d2ca5f0b` produjo 83 éxitos, 3 fallos y 1 omisión:
dos matrices de navegador y UX 15 quedaron en rojo por el mismo contrato
obsoleto de Inicio: `dashboard-performance-contract.spec.ts:45` buscaba un
POST directo cuando Inicio delega la operación en
`synchronizeOfficialSource()`. El contrato actualizado, REC-SYNC-275,
comprueba expresamente preflight, confirmación y recibo, así como la ausencia
del POST directo desde Inicio. Solo se corrige la prueba; NO se debilita
ningún umbral ni se permite importar sin un preflight válido.

### Hallazgo de producto REC-SYNC-276/277

1. Dos pestañas con el mismo `sourceSheetId` técnico —incluidos aliases con
   espacios laterales— representaban un único cursor persistente, aunque el
   libro tuviera los dos nombres de pestaña correctos. El preparador comprueba
   ahora que todos los IDs físicos no estén vacíos y sean únicos normalizados
   antes de consumir filas. Código `duplicate_source_sheet_identity` en
   caso de colisión. Nunca mezcla pestañas ni modifica la fuente.
2. El orden descendente de fechas se comprobaba por producto solo para cuentas
   cuyo saldo inicial se derivaba del movimiento más antiguo. En una pestaña
   con corriente y prepago intercalados, cada producto podía estar ordenado y
   la pestaña física no. El cursor se calcula por pestaña, por lo que aceptar
   esa situación era ambiguo. Ahora se valida el orden newest-first de
   **cada pestaña física completa**, también en filas de prepago archivado;
   una inversión detiene la importación con `source_order_mismatch`.
   **La igualdad de fechas se admite**; no se cambian importes, conceptos,
   saldos ni orden de los registros.

### Regresiones ejecutables y alcance

- REC-SYNC-276: IDs físicos repetidos, repetidos tras `trim`, vacíos,
  fuente sintética inmutable y caso válido.
- REC-SYNC-277: inversión cronológica oculta entre corriente y prepago
  individualmente ordenados.
- REC-SYNC-278: inversión del historial de prepago archivado.
- REC-SYNC-279: fechas iguales válidas, preservación de importes, cursores
  separados y ausencia de mutación del JSON de entrada.
- El guard `verify-recovery-visual-suite-gate` exige los cuatro casos y
  confirma que su archivo está incluido realmente en la matriz integrada.
  El workflow Source Trust se dispara también al cambiar el preparador.
- La ejecución externa CI del último SHA se consulta independientemente;
  los verdes de un SHA anterior NO acreditan uno nuevo.

### Límites de la corrección

Sin POST bancario real, sin escritura Google Sheets, sin mutaciones Supabase,
sin credenciales privadas, sin merge ni publicación. Las comprobaciones del
producto siguen condicionadas a aceptación de AP1–AP8: aislamiento de
usuarios, OCR G5 original y persistente, restauración/upgrade segregados,
preflight-sync-postflight para las 20 altas y release final verificada.

### Contraste CI REC-BANK-274 y corrección de fixture

El job [Source Trust del SHA 61b4b31d](https://github.com/massmedi-cpu/Finanzas-3.0/actions/runs/39665697962) comprobó los cuatro regresores REC-SYNC-276–279 en **desktop y móvil: 8/8 PASS**. El build y typecheck del workflow llegaron a la fase de Playwright. El resultado global del job fue FAILURE: 122 PASS y dos fallos (desktop+móvil) del visual REC-BANK-274. **Causa reproducida:** el fixture de prueba había montado 04/09, 03/09, 02/09 y después una fila prepago 03/09 en la misma pestaña; la nueva protección real lo rechaza correctamente como `source_order_mismatch`.

En [commit 85a09247](https://github.com/massmedi-cpu/Finanzas-3.0/commit/85a09247acc1d9de67e5c00d69b984bb6483e9b1) se reordenó **solo el fixture sintético** a 04/09, 03/09, 03/09, 02/09, conservando exactamente el ejemplo financiero de un enlace correcto y otro discontinuo. Se añadió aserción explícita de cursor físico de cuatro filas apuntando a `CHAIN-OLD`. El importador no suaviza ningún control, no reordena la fuente real y no escribe datos. La nueva CI requiere acreditación por SHA exacto antes de declarar completado el bloque.


## 23/10/2026 · REC-SYNC-352–355 · Bloqueo preventivo de revisiones históricas y prueba de persistencia

**Hallazgo auténtico de solo lectura:** auditoría columna a columna de los 3.188 registros
existentes contra el Google Sheet oficial (ambas pestañas, 22 columnas): **3.187
filas exactas**, y **una** cuya celda `Fecha` pasó de fecha española como
texto persistido a fecha serial numérica de Sheets; las dos representan el
**mismo día**, corroborado por `bank_date`. No existen diferencias en las
otras 21 columnas de esa fila; por eso fecha/importe/saldo coincidían en
la auditoría anterior. Fuente: **3.208 filas únicas** (3.191 corriente + 17 ahorro)
frente a 3.188 persistidas: 18+2 altas pendientes, cero huérfanos y duplicados.
Este único cambio de representación sigue siendo cambio de contenido original
para la huella contractual de fila; **no** normalizarlo a escondidas ni borrar
el registro existente. No publicar ni sincronizar hasta disponer de una
revisión controlada y respaldada.

**Implementación acumulada sin producción:** `POST /api/source/google/sync`
ahora exige, *antes de llamar a* `runtime.synchronization.synchronize`,
que `source.postflight_rows` del gateway devuelva el histórico completo
por archivo/workspace (lectura autenticada), y que su comparación exacta no
contenga huérfanos ni diferencias, incluidas las huellas. Las filas nuevas
están permitidas como `pending`. Si existen diferencias, responde HTTP 409
`google_source_existing_rows_changed` sin escribir. Un gateway obsoleto
sin la acción bloquea la importación, no omite la comprobación.

**Después del único intento de mutación autorizado**, se comprueba el recibo,
se prohíben revisiones históricas inesperadas (`rowsRevised !== 0`) y se
hace una nueva lectura del gateway. Solo si las dos instantáneas comparadas
están en estado `verified`, sin pendientes, huérfanos, diferencias de campos
o hashes, se confirma el éxito al navegador. Si falta la lectura o no es
exacta, se informa `google_source_sync_unconfirmed` HTTP 502: la escritura
**podría haberse producido** y no se repite automáticamente. La verificación
es **secuencial y no atómica entre Google y PostgreSQL**, sin garantía de
rollback tras respuesta incierta.

`REC-SYNC-352–353` garantizan las barreras antes/después del POST; pruebas
puras `REC-SYNC-354–355` verifican aceptación de 20 altas sintéticas,
rechazo de diferencias/huérfanos y rechazo de falsos éxitos. Los cuatro casos
están en el gate obligatorio desktop/móvil. Las dos interfaces explican la
revisión requerida y el bloqueo preventivo en español de España.

**Operación futura, aún bloqueada:** acreditar respaldo/restore aislado y AP1,
documentar la diferencia de representación sin mostrar la fila privada,
acordar la corrección puntual del registro persistido en una operación
reversible autorizada, comprobar la huella del histórico y solo entonces
aplicar las 20 altas con preflight + postflight. No se ha escrito nada en
Supabase, Google Sheets, Edge Function o Vercel producción desde este trabajo.
