# Recuperación Financial App · regresiones navegador 18/10/2026

Base comprobada: PR #619 DRAFT, HEAD `8326e5ba08516545ca6a30fa0e5cecd9a9f50758`. Las dos ejecuciones de `Product recovery browser matrix` (39070041376 y 39070040976) terminan en FAILURE, 80/83 workflows SUCCESS, 1 SKIPPED (backup productivo). La PR #620 sigue siendo auxiliar «NO MERGE». Producción sigue en 10.0.103; no se publica en este bloque.

## Diagnóstico y correcciones de la candidata

1. `REC-UI` · Preferencias, tema claro: el select heredaba texto claro/oscuro de tema y forzaba fondo `#0d1628` por fallback de `--surface`, ocasionando contraste 1,14:1. El control usa ahora `--surface-control-strong`/`--surface-card` y `--color-text`; la prueba Axe de las 21 rutas × 11 anchuras y dos temas sigue obligatoria. Debe verificarse el estilo compuesto y foco/selección en el SHA nuevo.
2. `REC-OCR-UX-031/032`: `DriveAutoSync` realiza un POST automático independiente al montar `/documents`. Ambas suites OCR lo registraban por su interceptor de rutas, pero contaban únicamente los POST OCR. Se añade manejo explícito de `POST /api/documents/drive-sync` con respuesta mock 409 `preview_drive_sync_read_only`, como en preview protegida, y se exige exactamente esa llamada bloqueada más los POST OCR previstos. Se mantiene la prohibición de PATCH/PUT/DELETE, los errores PDF y el rechazo de páginas/geometría inválidas. Nunca alcanza backend financiero o documental real.
3. `REC-HOME-SYNC-015`: el mock con comprobación bancaria de 15/09 es antiguo para el reloj del runner. El producto presenta correctamente «La fecha de los movimientos aún no está verificada» en lugar de un día certificado. Se afirma el aviso honesto y la ausencia de «Movimientos registrados hasta» / «Datos bancarios actualizados», sin alterar lógica.
4. `REC-HOME-022`: la respuesta de fuente verificada mostraba un sync terminado el 11/10 mientras el propio test generaba fechas de movimientos actuales. Ambos endpoints ahora usan un mismo `recentSync` reciente para ese escenario, dejando distinta la fecha del movimiento. Los escenarios sin fuente y con fechas discrepantes se conservan.

## Alcance y criterios de salida

Cambios: estilos de Preferencias y tres ficheros de pruebas navegador. Sin edición de originales, credenciales, políticas RLS, sincronización de producción, cambios SQL ni despliegue final.

**Pendiente de nueva ejecución:** suites focalizadas y matrices completas de CI sobre el SHA resultante; inspección de capturas y verificaciones de AP-1 a AP-8. Este documento describe el arreglo planteado por revisión de código/logs y **no declara PASS de la nueva candidata**.

Evidencia base:
- https://github.com/massmedi-cpu/Finanzas-3.0/actions/runs/39070041376
- https://github.com/massmedi-cpu/Finanzas-3.0/actions/runs/39070040976
- https://github.com/massmedi-cpu/Finanzas-3.0/pull/619
