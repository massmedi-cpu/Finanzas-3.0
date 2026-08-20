# Finanzas 3.0

Aplicación financiera personal privada para control, presupuesto y planificación financiera basada en datos reales.

## Principios permanentes

- Google Sheets es la fuente maestra histórica y se consulta exclusivamente en modo lectura.
- La fuente original nunca se modifica desde la aplicación.
- Datos originales y datos enriquecidos permanecen separados.
- No se inventan cifras financieras cuando falta información.
- Traspasos internos quedan fuera de ingresos, gastos y cash flow.
- Cambios, divisiones y decisiones de revisión se guardan en una capa privada reversible y auditada.
- El acceso privado es obligatorio antes de mostrar datos financieros.
- Diseño responsive mobile-first, typecheck, build de producción y control de regresiones mediante CI.

## V2.0.0

La versión 2.0 consolida el producto en torno a un plan financiero mensual completo:

- panel financiero con ingresos, gastos, cash flow, tasa de ahorro y dinero por asignar;
- presupuestos por sobres con selector de mes, remanentes y detección de sobregasto;
- edición y división reversible de movimientos entre varias categorías;
- centro de revisión de duplicados, movimientos pendientes, categorías vacías e importes atípicos;
- recibos, suscripciones e ingresos recurrentes validados por el usuario;
- calendario financiero, previsión de liquidez y simulación de escenarios;
- objetivos financieros con progreso y aportación mensual;
- informes anuales, trimestrales, mensuales y por categoría;
- evolución del patrimonio a partir de los últimos saldos conocidos por cuenta;
- análisis financiero explicable: cada conclusión muestra el dato en que se basa y no inventa información;
- manifest instalable para móvil/escritorio sin almacenar datos financieros en una caché offline;
- cabeceras de seguridad, bloqueo de indexación y protección privada de rutas.

## Integridad de los datos

Las divisiones de un movimiento deben cuadrar con el importe bancario original con una tolerancia máxima de un céntimo. Presupuestos e informes usan esas partes para repartir correctamente el gasto, pero el movimiento original permanece íntegro y recuperable.

Los informes cuentan cada operación bancaria una sola vez aunque internamente se haya dividido en varias partidas contables.

## Seguridad

Nunca deben subirse al repositorio:

- credenciales o contraseñas;
- claves privadas;
- identificadores privados de hojas;
- bases de datos personales;
- CSV/XLSX/PDF con movimientos;
- exportaciones o copias de seguridad financieras.

Las variables necesarias se documentan en `.env.example` y se configuran únicamente en el entorno privado de despliegue. Las tablas privadas utilizan RLS sin políticas públicas; el acceso de aplicación se realiza a través de servicios de servidor autenticados.
