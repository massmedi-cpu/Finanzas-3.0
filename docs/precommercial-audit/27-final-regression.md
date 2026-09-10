# 27 · Regresión final

Fecha: 2026-09-10 (Europe/Madrid)

## Candidato técnico examinado

`3bcbfeda163f45f19e7d607dc18aaec4a01406e2`

## Gates

- Next.js production build: SUCCESS.
- TypeScript: SUCCESS.
- Playwright local desktop+mobile: **465 passed / 89 skipped / 0 failed** de 554 tests.
- `browser-interaction-e2e`: SUCCESS.
- `protected-preview-live`: SUCCESS.
- PRE-020 Disposable DB Smoke: SUCCESS.
- PRE-020 Storage Runtime Rehearsal: SUCCESS.
- Vercel Preview: `dpl_8urbrmSrADPku6pVj7MNnVPAc6uC`, READY, `githubCommitSha` exacto al candidato.

Los tests omitidos en el proyecto local corresponden a condiciones específicas de ejecución (por ejemplo, casos live/protected o duplicación innecesaria por proyecto); no son fallos. Los casos live necesarios se ejecutan en el job protegido correspondiente.

## Áreas de regresión cubiertas

La suite verde incluye, entre otras, cuentas, Análisis, AppShell, accesibilidad, backup/restore, presupuestos, configuración, CSP, dashboard, ciclo de borrado PRE-020, exportación, confianza de datos, firma real de documentos, OCR, lógica/visualización financiera, previsión, OAuth/Drive read-only, onboarding, aislamiento Preview/Production, autenticación, recurrentes, procedencia de release, Para revisar, reglas, fuente bancaria, recuperación de sync, tenancy, deep-links, carreras de Movimientos y sistema visual de Previsión.

## Incidencia detectada y resuelta durante el gate

El candidato anterior `f177c65a9dc07f8deecb6c4dc28f001e824c226c` tuvo cuatro fallos, todos procedentes de dos asserts históricos de PRE-020E duplicados en desktop/móvil. Esos asserts exigían que Storage continuara sin validar, contradiciendo la nueva evidencia PRE-020G. No hubo fallo funcional de producto.

El commit `3bcbfeda…` modificó exclusivamente ese test histórico para conservar las garantías de PRE-020E y aceptar la nueva evidencia de PRE-020G. La rerun completa quedó verde.

## Conclusión

**No hay regresiones conocidas dentro de la cobertura automatizada ejecutada sobre el candidato técnico.**

Esta conclusión no equivale a afirmar ausencia absoluta de defectos ni sustituye una beta humana; delimita exactamente lo que las gates demuestran.