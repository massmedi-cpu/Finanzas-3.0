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
