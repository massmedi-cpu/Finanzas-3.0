# AUD-003 · Axioma §§1–59 · cierre de escenarios de Previsión

Fecha: 2026-10-06  
Release candidata: Financial App 10.0.82  
Base de Producción al iniciar: 10.0.81

## Fuente normativa

La auditoría se realiza contra el Prompt Maestro Axioma original de Financial App, recuperado de la biblioteca del proyecto. No se reconstruyen requisitos de memoria.

## Gap reproducible

El §42 exige tres escenarios de Previsión —Esperado, Conservador y Optimista— con hipótesis visibles y modificables.

Antes de este bloque, Previsión ya disponía de:

- calendario financiero;
- recurrencias y regeneración explícita;
- confianza y origen de cada previsión;
- conciliación con movimientos reales;
- exclusiones y previsiones manuales;
- horizontes temporales;
- snapshot financiero canónico y saldo proyectado.

Sin embargo, no existía contrato, motor ni interfaz de escenarios y tampoco hipótesis editables.

## Implementación 10.0.82

- El escenario **Esperado** replica exactamente el resumen canónico del snapshot de Previsión.
- **Conservador** y **Optimista** ajustan únicamente ingresos y gastos agregados con porcentajes editables.
- Los cálculos se realizan en céntimos enteros.
- Las hipótesis se limitan a un rango seguro de -100 % a +100 %.
- Solo se guardan los porcentajes en `localStorage`; no se persisten cifras financieras.
- La simulación no crea movimientos, no modifica recurrencias, no escribe en `/api/forecast` y no altera la fuente bancaria.
- Se incorpora un gate estático permanente en `postbuild`.
- El workflow oficial de integridad de Previsión ejecuta la regresión específica de §42 en desktop y móvil.

## Guardrails

- Fuente bancaria: estrictamente solo lectura.
- Google Drive/Sheets: sin escrituras.
- Sin migraciones de base de datos.
- Sin nuevos endpoints financieros.
- El snapshot canónico sigue siendo la única base del escenario Esperado.
- Las preferencias de simulación son locales, reversibles y no sensibles.

## Evidencia de regresión

`tests/e2e/forecast-scenarios-10.0.82.spec.ts` comprueba:

1. resultados exactos de los tres escenarios;
2. que el escenario Esperado no altera la base canónica;
3. normalización segura de hipótesis;
4. presencia de hipótesis editables;
5. persistencia tras recarga;
6. ausencia de escrituras financieras al modificar escenarios.

## Estado

Pendiente de certificación final del HEAD versionado 10.0.82, merge a `main`, deployment de Producción y postflight.
