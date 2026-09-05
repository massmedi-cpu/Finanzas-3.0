# Fase 2 — Checkpoint acumulativo 04/09/2026 22:12 UTC

Este documento añade evidencia al checkpoint canónico `PHASE2_VALIDATION_STATUS.md`; no lo sustituye ni invalida ninguna validación anterior.

## Estado validado

- Fase 2: **80% validado**.
- Progreso global validado: **16,0%**.
- Base estable: `main` con Fase 1 cerrada al 100%.
- Rama activa: `rebuild/phase-2-data-quality`.
- PR #287 permanece Draft y no debe fusionarse hasta cierre real.
- HEAD de código validado antes de este checkpoint: `9074cbdfa7af9dc72a4e8539c6394c57a1912840`.
- GitHub Actions run `33923855698`: build Next.js y TypeScript verdes.
- Playwright: **94 tests totales, 82 passed, 12 live skipped, 0 failed**.
- Los 12 tests omitidos corresponden exclusivamente a gates de preview protegido que requieren un deployment exacto accesible.

## Preflight de primera importación

La primera importación Google queda bloqueada hasta superar una prevalidación completa de solo lectura. El preflight:

- lee y valida el workbook completo;
- no persiste movimientos;
- no modifica Google Drive ni Google Sheets;
- muestra productos, tipos/lifecycle, recuentos, saldos iniciales, saldo reciente y cursores previstos;
- solo después habilita la primera escritura;
- las sincronizaciones posteriores vuelven a validar el snapshot completo antes de persistir.

## Guardia histórica central

Se ha incorporado `assertOfficialSourceHistoricalBaseline(...)` tanto al endpoint de preflight como al POST real de sincronización, por lo que una llamada directa al API tampoco puede saltarse la protección.

Baseline mínimo reconciliado directamente contra el Google Sheet oficial:

- total autoritativo mínimo: **3.172**;
- cuenta corriente: mínimo **3.024**, `checking`, `active`, saldo inicial 0;
- cuenta ahorro: mínimo **15**, `savings`, `active`, saldo inicial 0;
- prepago técnica: mínimo **133**, `other`, `archived`, saldo inicial 0;
- pestaña corriente: mínimo **3.157** filas autoritativas y fila histórica más antigua `CC-02963`;
- pestaña ahorro: mínimo **15** filas autoritativas y fila histórica más antigua `AH-00010`.

La guardia permite crecimiento por movimientos nuevos y cambios de saldos recientes. Bloquea únicamente regresiones del histórico ya validado: pérdida de filas, desaparición de productos, cambio de contrato/lifecycle, alteración de saldo inicial o sustitución del extremo histórico conocido.

Se añadieron 10 regresiones específicas y dos checks adicionales a `/api/health/data-quality`: crecimiento permitido y pérdida histórica rechazada.

## Supabase verificado en vivo

Proyecto `financial-app` (`btzukbfesxdratqnxuoj`):

- Edge Function `financial-app-db-gateway`: **ACTIVE v11**;
- contrato `source.capabilities`: v2, lifecycle y selección canónica;
- las 6 migraciones de Fase 2 presentes en GitHub están instaladas en Supabase;
- Security Advisor: **0 lints**;
- Performance Advisor: únicamente avisos INFO de índices todavía sin uso, esperables con base vacía; no se eliminan prematuramente;
- datos actuales: **0 cuentas, 0 mappings, 0 movimientos, 0 source records, 0 sync runs, 0 sync issues y 0 cursores**;
- residuos de `__phase2_gateway_test__`: **0** en todas las tablas comprobadas;
- funciones privadas de ingesta con `search_path=''`, sin `SECURITY DEFINER` y sin `EXECUTE` para `public`, `anon` o `authenticated`.

El gateway v11 incorpora OAuth/Vault, `source.capabilities`, batch atómico, revisiones, duplicados, detección no destructiva de filas desaparecidas y cursores por pestaña física. La autenticación se realiza mediante OIDC de Vercel dentro del gateway antes de abrir la conexión PostgreSQL.

## Vercel

Durante este bloque GitHub informó para los HEAD recientes: `Deployment rate limited — retry in 24 hours.`

Posteriormente Vercel volvió a producir un deployment READY, pero correspondía al commit anterior `e97cb93131af1825384ad7457d321f22739f9ef4`, no al HEAD validado `9074cbdf...`; por tanto **no se contabiliza como gate live del HEAD actual**.

Este checkpoint genera un único commit legítimo posterior al levantamiento parcial de la cola. Solo se aceptará como evidencia live un deployment cuyo `githubCommitSha` coincida exactamente con el nuevo HEAD de esta rama.

## Bloqueos reales restantes

1. Obtener un deployment Vercel exacto del HEAD vigente y ejecutar todos los gates protegidos live.
2. Disponer de las credenciales OAuth Google reales requeridas por Financial App.
3. Autorizar la cuenta permitida y ejecutar el preflight real desde la aplicación.
4. Ejecutar la primera importación controlada y contrastar 3.172 movimientos, tres productos, saldos iniciales, lifecycle y cursores.
5. Repetir sincronización y demostrar idempotencia real.
6. Verificar revisiones/trazabilidad y preservación de modificaciones manuales en persistencia real.
7. Confirmar que la prepago persiste archivada y fuera de cuentas activas ordinarias.
8. Reejecutar gates de Fase 1 y cerrar Gantt/PR solo cuando todo quede verde.

OCR permanece aislado para Fase 11.
