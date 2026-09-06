# Fase 7 — Recurrentes

Base protegida: `main` / `7e8590be62a022f4d4b046c79fc27776b4bddccb`.

## Objetivo

Construir un motor único de recurrencias que detecte patrones en el histórico efectivo, permita confirmarlos, ignorarlos, archivarlos y recalcularlos sin convertir coincidencias débiles en certezas.

## Reglas

- Fuente bancaria estrictamente de solo lectura.
- Los cálculos consumen hechos financieros efectivos ya validados en F5.
- Ninguna detección automática se persiste como recurrencia confirmada sin una acción explícita o un umbral de confianza claramente representado.
- Estados diferenciados: candidato, confirmado/activo, ignorado y archivado.
- La confianza debe ser explícita y auditable.
- Tolerancias de fecha e importe se modelan y validan; no se infieren de forma opaca en cliente.
- El siguiente vencimiento se deriva en el motor central y debe poder recalcularse.
- F7 no modifica movimientos ni registros bancarios de origen.

## Gate de cierre

1. Migraciones y motor central aplicados y versionados.
2. API/gateway y UX responsive escritorio+móvil.
3. Detección, confirmación, ignorado, archivado y recalculado cubiertos por pruebas.
4. Preview exacto del HEAD final con suite live acumulativa verde.
5. Baseline sin residuos y Security Advisor sin regresiones.
6. Merge protegido a main y Production exacta verificada antes de declarar F7 al 100%.
