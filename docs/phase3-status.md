# Financial App 0.0.1 — Fase 3 · Estado de validación

Fecha de actualización: 05/09/2026

## Regla de continuidad

Este documento es un checkpoint técnico acumulativo de la Fase 3. No sustituye el Prompt Maestro Axioma Definitivo ni los cierres validados de Fases 1 y 2. La fuente bancaria oficial permanece estrictamente en solo lectura.

## Estado porcentual oficial

- Fase 1 — Fundamentos: 100% completada.
- Fase 2 — Lectura e importación: 100% completada.
- Fase 3 — Reglas, normalización y categorización: 0% oficial, en curso.
- Progreso global validado: 18,0%.
- OCR permanece reservado para Fase 11, tramo global 93%–97%.

El porcentaje no aumenta por commits, despliegues o configuración. Solo por trabajo funcional validado end-to-end.

## Base y rama

- `main` validado tras Fase 2: `0f4a6427537b7cc8256418f421a1bbf1d8ac2d02`.
- Rama activa: `rebuild/phase-3-rules-categorization`.

## Bloque 9 — Comercios y alias

Implementado acumulativamente sobre las entidades ya existentes, sin duplicar fuentes de verdad:

- normalización canónica de nombres;
- equivalencias mediante alias;
- resolución determinista de comercio;
- categoría por defecto;
- lifecycle activo/archivado;
- protección de colisiones entre nombres canónicos y alias;
- funciones centrales de alta/actualización/resolución/borrado de alias;
- API gateway para `merchant.list`, `merchant.save`, `merchant_alias.list`, `merchant_alias.save`, `merchant_alias.delete` y `merchant.resolve`.

Migración `20260905152000_phase3_merchant_alias_engine` aplicada en Supabase y esquema elevado a v8. Regresión SQL real ejecutada con rollback limpio. Baseline posterior: 0 comercios, 0 alias y 0 categorías sintéticas; se preservan 3.172 movimientos y 3.172 registros fuente.

## Runtime real

`financial-app-db-gateway` está ACTIVE en Edge v17. El build Vercel del commit `ef6e2e114cf477d98974da3bc5d7c6e71cbc0a07` superó el postbuild por Vercel OIDC con:

`plain=ok · gzip=ok · health=ok · invariants+ingestion+vault+merchant-alias=ok · contract=2 · region=eu-west-3`.

Este gate demuestra acceso real Vercel → Edge → PostgreSQL y rollback limpio del motor de comercios/alias, sin retirar las comprobaciones previas de Fundamentos e Ingesta.

## Gate pendiente

El workflow `Preview E2E` ya admite la rama de Fase 3 y conserva intactas las ramas de Fases 1 y 2. Run inicial: `33970719910`.

Falta cerrar el acceso protegido GitHub Actions → Vercel para esta rama mediante una Trusted Source específica de Fase 3 y completar después la superficie funcional/UX de gestión de comercios y alias. Hasta entonces el bloque 9 sigue En curso y Fase 3 permanece oficialmente en 0%.
