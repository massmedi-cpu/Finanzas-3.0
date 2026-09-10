# 31 · QA final — protocolo y evidencia previa al sello documental

Fecha: 2026-09-10 (Europe/Madrid)

## Evidencia previa

Candidato técnico `3bcbfeda163f45f19e7d607dc18aaec4a01406e2`:

- build + TypeScript: SUCCESS;
- Playwright desktop+mobile: 465 passed, 89 skipped, 0 failed;
- browser-interaction-e2e: SUCCESS;
- protected-preview-live: SUCCESS;
- PRE-020 Disposable DB Smoke: SUCCESS;
- PRE-020 Storage Runtime Rehearsal: SUCCESS;
- Vercel `dpl_8urbrmSrADPku6pVj7MNnVPAc6uC`: READY y SHA exacto.

## Regla de cierre

El commit que incorpore los informes 26–32 es documentación de auditoría, pero debe pasar igualmente las gates del mismo SHA. No se considerará completado el hito QA únicamente porque su padre técnico esté verde.

Criterio externo de aceptación del SHA de cierre documental:

1. PRE-020 Disposable DB Smoke SUCCESS.
2. PRE-020 Storage Runtime Rehearsal SUCCESS.
3. `browser-interaction-e2e` SUCCESS.
4. `protected-preview-live` SUCCESS.
5. Vercel Preview READY con `githubCommitSha` exactamente igual al SHA auditado.

La evidencia del SHA final se registra en el Gantt/Plan detallado canónico de Google Sheets, evitando el problema circular de escribir el hash de un commit dentro del propio commit.

## Production

Este QA no autoriza promoción. `main`/Production continúan fuera de alcance hasta aprobación expresa.

## Estado del documento

**PROTOCOLO QA FINAL DEFINIDO. El hito se sella sólo cuando las gates del SHA documental terminen verdes.**