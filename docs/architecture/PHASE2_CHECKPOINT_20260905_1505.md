# Fase 2 — checkpoint real antes del cierre

Fecha: 05/09/2026

Este checkpoint es acumulativo y no sustituye el Axioma ni la validación de Fase 1. Se crea para registrar evidencia real ya comprobada y activar el gate explícito `[live-sync]` sobre el mismo estado funcional de la rama, sin commit vacío.

## Estado real comprobado

- Rama activa: `rebuild/phase-2-data-quality`.
- PR: #287 Draft; `main` permanece intacto.
- Fuente oficial Google Sheet estrictamente de solo lectura.
- Autenticación operativa mediante la cuenta de servicio gestionada `Financial App Reader`, con scopes de lectura.
- Preflight real contra Google: `drive-version:97`, 3.172 filas autoritativas, 3 productos lógicos y 2 cursores.
- Primera importación persistente real: 3.172 filas vistas, 3.172 insertadas, 0 revisadas, 0 omitidas, 0 fallidas y 0 warnings.
- PostgreSQL después de la importación: 3.172 `transactions`, 3.172 `transaction_source_records`, 3 mappings, 2 cursores, 0 `sync_issues`, 0 overrides.
- Cursores persistidos: `CC-02963` y `AH-00010`.
- Cuenta corriente y ahorro activas; prepago conservada como ledger técnico `other/archived`; saldos iniciales 0.

## Incidencia de segunda lectura y corrección

La primera segunda lectura real encontró un límite de recursos de Supabase Edge (546) durante el replay fila a fila. La operación quedó revertida de forma atómica y no alteró el dataset persistido.

La Edge Function `financial-app-db-gateway` se actualizó a v15 con una ruta de replay de revisión estable. Solo se activa cuando coinciden exactamente revisión, fingerprint de esquema, todas las identidades + fingerprints persistidos, mappings y cursores. Si cualquiera de esas comprobaciones falla, el flujo vuelve al motor completo. El objetivo es demostrar idempotencia real sin degradar el contrato ni convertir el gate en una simulación.

## Regresiones antes del gate final

Sobre el commit funcional inmediatamente anterior a este checkpoint:

- preview protegido exacto accesible mediante Trusted Source GitHub OIDC;
- Playwright live reejecutado: 126/126 tests verdes en desktop y móvil;
- preflight Google real nuevamente verde: 3.172 filas, 3 cuentas, 2 cursores, `drive-version:97`;
- `financial-app-db-gateway` v15 responde correctamente en las validaciones live.

## Gate que activa este checkpoint

El mensaje de commit contiene `[live-sync]` de forma deliberada para que GitHub Actions ejecute las dos sincronizaciones reales consecutivas definidas por el workflow. El cierre de Fase 2 exige que la segunda lectura resulte exactamente idempotente: 0 insertadas, 0 revisadas, todas omitidas, sin filas desaparecidas ni warnings, y que PostgreSQL conserve exactamente el dataset autorizado.

No se declara Fase 2 al 100% ni se modifica `main` antes de comprobar ese resultado.