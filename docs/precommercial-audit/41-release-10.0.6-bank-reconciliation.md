# Financial App 10.0.6 · trazabilidad bancaria y RLS de control

## Estado del bloque (26/09/2026)

La implementación está fusionada en `main` por [PR #372](https://github.com/massmedi-cpu/Finanzas-3.0/pull/372), merge `9ee8cbfca14a0df26d6368246faa0534bddc9a30`. El árbol del merge `3b8e6161838c919000c0e355603622d6d50dcf15` coincide con el candidato `38dd9f9efc360150d6021f0ca437afc87aab61c4` validado por CI.

**Production continúa en 10.0.5** (`023c92d498a0b7ad5e57d613ff264578e3bddb36`, `dpl_EAQtCBxTVBq4sRBdwcsZ2YwDaaLP`). El commit de despliegue de `main` `6f08e38c7a3eea9b6eb1f1e6115f52e31fe3b44b` recibió el estado Vercel `failure` con enlace `upgradeToPro=build-rate-limit`. No se declara 10.0.6 publicada hasta que un deployment Production READY y `/api/build` coincidan en versión y SHA. No se propone pago ni se rebaja el gate.

## Cambios y pruebas

- Cuentas conserva el saldo bancario explícito como fuente de verdad y permite examinar los días en que cambia la diferencia frente a la reconstrucción. Cada fecha enlaza a Movimientos con cuenta y periodo filtrados. El desglose es de solo lectura y no deduce una transacción ausente.
- La función `financial_account_reconciliation` reutiliza el saldo del motor central, aplica el mismo alcance de workspace y limita la respuesta a 12 cambios de mayor magnitud. También distingue movimientos posteriores al último saldo bancario.
- Migración Supabase `20260926053059_account_reconciliation_control_rls` aplicada. Cinco tablas de control tienen RLS; la política global de borrado mantiene SELECT para `financial_app_gateway` y ninguna capacidad de UPDATE/DELETE. Las cuatro tablas de infraestructura sin políticas quedan denegadas a roles sin bypass; el asesor informa `rls_enabled_no_policy` como INFO de esta configuración restrictiva.
- La prueba SQL con datos sintéticos validó cambios de +650 y −250 céntimos, saldo sin ancla posterior, política de lectura y reversión completa (`BEGIN`/`ROLLBACK`). Un ensayo con `SET ROLE financial_app_gateway` validó −57.900 céntimos y 13 días con cambios en la cuenta real, denegación cross-workspace y borrado todavía desactivado.
- Los contadores de Production tras las pruebas siguen en 3.183 movimientos, dos overrides, un workspace y cero filas sintéticas persistidas. No hubo ajustes inventados para cuadrar la diferencia.
- `npm run typecheck`, `npm run build` y UX 15 [#250](https://github.com/massmedi-cpu/Finanzas-3.0/actions/runs/36221177558) verdes: 150 pruebas aprobadas y 8 omitidas; la regresión nueva pasa en Chromium escritorio y móvil.
- Preview `dpl_EJi75KG6ZEShzNWevM7LCorDgNsw` READY; `/api/build` devuelve 10.0.6, entorno `preview` y SHA `38dd9f9efc360150d6021f0ca437afc87aab61c4`. Edge Gateway v73 referencia esa SHA. No aparecieron errores recientes de runtime en las rutas consultadas.
- El Gantt canónico de Drive muestra 10.0.5 como Production real y 10.0.6 como candidata bloqueada por cuota. La prueba HTTP con sesión interna real no se hizo: sin sesión `/api/health/persistence` responde 401. El objeto de etiqueta/GitHub Release formal tampoco está publicado.

## Gate restante

Cuando Vercel libere la cuota: generar Production desde `main`, esperar READY, exigir `/api/build` 10.0.6 y SHA exacta del deployment, verificar autenticación y las consultas esenciales con sesión legítima, revisar errores de runtime, actualizar el Gantt y publicar la etiqueta/manifest mediante `publish-verified-release.yml`. No convertir `releaseTag` calculada por el build en evidencia de una etiqueta Git existente.
