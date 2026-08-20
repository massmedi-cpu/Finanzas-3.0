# Finanzas 3.0 — V2.0.0

## Objetivo

Consolidar las capacidades construidas desde V1.1 en una aplicación financiera personal coherente: control del presente, asignación del dinero y planificación futura sobre una única fuente bancaria protegida.

## Capacidades consolidadas

- Fuente Google Sheets de 22 columnas en modo solo lectura.
- Capa privada para correcciones, revisiones, presupuestos, objetivos, planificación y recurrentes.
- Movimientos editables y divisibles sin alterar el registro bancario original.
- Presupuesto por sobres con remanentes y selector mensual.
- Centro de calidad de datos y decisiones reversibles.
- Detección y validación de recurrentes.
- Calendario, previsión de liquidez y escenarios what-if.
- Informes mensuales, trimestrales, anuales y por categorías.
- Evolución de patrimonio basada en saldos realmente conocidos.
- Plan financiero mensual 360º que reúne cash flow, presupuesto, patrimonio, previsión, objetivos y calidad de datos.
- Análisis explicable con evidencia visible y sin generación de cifras ficticias.
- Interfaz instalable tipo aplicación, responsive y privada.

## Reglas de integridad

1. La hoja bancaria original no se escribe nunca.
2. Los traspasos internos no se consideran ingreso ni gasto.
3. Las divisiones contables deben sumar exactamente el importe original con tolerancia máxima de 0,01 €.
4. Un movimiento dividido sigue contando como una sola operación en los informes de volumen.
5. Las exclusiones y correcciones internas son reversibles.
6. Si una fuente o capa privada falla, la interfaz evita presentar cifras parciales como si fueran definitivas.
7. Las conclusiones automáticas deben mostrar su base cuantitativa y no inferir datos inexistentes.

## Seguridad y privacidad

- Sesión privada mediante cookie HTTP-only.
- Cabeceras anti-frame, no-sniff, no-referrer y permissions policy restrictiva.
- Indexación pública bloqueada por metadata, robots y cabecera X-Robots-Tag.
- RLS activo en las tablas privadas y sin políticas públicas directas.
- No se implementa service worker que conserve respuestas financieras en caché offline.
- Ninguna credencial o dato financiero debe entrar en el repositorio público.

## Puertas de publicación

La V2.0.0 solo puede considerarse final si:

- TypeScript termina sin errores.
- El build de producción termina correctamente.
- La preview de despliegue queda READY.
- La versión se fusiona en `main` sin saltarse CI.
- El endpoint de salud de producción devuelve `2.0.0`.
- No aparecen errores de ejecución relevantes tras el despliegue.
