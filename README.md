# Finanzas 3.0

Aplicación financiera personal privada para control, presupuesto y planificación financiera basada en datos reales.

## Principios permanentes

- La fuente bancaria histórica se consulta exclusivamente en modo lectura.
- La fuente original nunca se modifica desde la aplicación.
- Datos originales y datos enriquecidos permanecen separados.
- No se inventan cifras financieras cuando falta información.
- Si falta una capa que puede cambiar una cifra, ese cálculo se bloquea antes de mostrar un resultado parcial.
- Traspasos internos quedan fuera de ingresos, gastos y cash flow.
- Cambios, divisiones y decisiones de revisión se guardan en una capa privada reversible y auditada.
- El acceso privado es obligatorio antes de mostrar datos financieros.
- Diseño responsive mobile-first, pruebas de regresión, typecheck y build de producción mediante CI.

Los axiomas completos están en `docs/PROJECT_AXIOMS.md`.

## V2.0.1

V2.0.1 consolida la auditoría de rendimiento, exactitud y regresiones sobre V2.0.0:

- validación de `modifiedTime` de Drive antes de volver a descargar/procesar la fuente;
- deduplicación y caché corta de lecturas de fuente;
- ejecución Vercel próxima a Supabase;
- eliminación de prefetch y recargas de servidor innecesarias;
- lecturas independientes paralelizadas;
- renderizado progresivo del histórico de movimientos;
- alertas y calidad calculadas sobre la vista efectiva con correcciones privadas;
- bloqueo de cálculos financieros si falta una capa necesaria;
- protección de sesión y login reforzada;
- versiones de framework fijadas y `package-lock.json` reproducible;
- Edge Functions exclusivas V3 y esquema actual versionados;
- documentación canónica y gate de release.

Consulta `docs/PROJECT_CHANGELOG.md` y `docs/AUDIT_FINDINGS_V2.0.1.md` para el detalle.

## Producto V2

- panel financiero con ingresos, gastos, cash flow, tasa de ahorro y dinero por asignar;
- presupuestos por sobres con selector de mes, remanentes y detección de sobregasto;
- edición y división reversible de movimientos entre varias categorías;
- centro de revisión de duplicados, movimientos pendientes, categorías vacías e importes atípicos;
- recibos, suscripciones e ingresos recurrentes validados por el usuario;
- calendario financiero, previsión de liquidez y simulación de escenarios;
- objetivos financieros con progreso y aportación mensual;
- informes anuales, trimestrales, mensuales y por categoría;
- evolución del patrimonio a partir de los últimos saldos conocidos por cuenta;
- análisis financiero explicable;
- manifest instalable para móvil/escritorio sin almacenar datos financieros en una caché offline;
- cabeceras de seguridad, bloqueo de indexación y protección privada de rutas.

## Integridad de los datos

Las divisiones de un movimiento deben cuadrar con el importe bancario original con una tolerancia máxima de un céntimo. Presupuestos e informes usan esas partes para repartir correctamente el gasto, pero el movimiento original permanece íntegro y recuperable.

Los informes cuentan cada operación bancaria una sola vez aunque internamente se haya dividido en varias partidas contables.

## Seguridad

Nunca deben subirse al repositorio credenciales, contraseñas, claves privadas, identificadores privados, bases de datos personales, CSV/XLSX/PDF con movimientos, exportaciones o copias de seguridad financieras.

Las tablas privadas V3 utilizan RLS sin políticas públicas; el acceso de aplicación se realiza mediante Edge Functions autenticadas que usan credenciales de servidor almacenadas fuera del repositorio.

## Documentación canónica

- `docs/PROJECT_AXIOMS.md`
- `docs/ARCHITECTURE.md`
- `docs/REQUIREMENTS_TRACEABILITY.md`
- `docs/PROJECT_CHANGELOG.md`
- `docs/DESIGN_SYSTEM.md`
- `docs/TEST_MATRIX.md`
- `docs/RELEASE_GATE_V2.0.1.md`
- `database/schema-v2.0.1.sql`
- `supabase/README.md`
