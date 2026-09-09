# Fase 19 · Registro de implementación precomercial

## PRE-003 · Aislamiento Preview / Production

Checkpoint previo al gate protegido final.

- Candidato local validado inicial: `75ef540ae9237d07273565cfbc9e34d53445b65d`.
- GitHub Actions local inicial: run `34344876462`, build y TypeScript verdes, `393 passed / 85 skipped / 0 failed`.
- Supabase Edge `financial-app-db-gateway` actualizado inicialmente de v56 a v57 sin migraciones ni cambios de datos.
- El primer Preview protegido (`5f291d61de555efd9e84ccd11fb2365e664df032`) demostró correctamente el aislamiento de escritura: `account.create` válido desde Preview recibió `403 preview_production_write_forbidden` y dejó cero residuo tanto en desktop como en móvil.
- Ese primer gate detectó además una regresión read-only independiente: 16 fallos porque la allowlist contenía los aliases obsoletos `financial.accounts` / `financial.account` en lugar de las acciones reales `financial.balances` / `financial.snapshot`.
- Corrección mínima aplicada en `f0a6cd9971c93d38d234bd77c6b508e30e2140ed`; test de contrato reforzado en `976ae5afcf66cff85791abb76c099d3813a2e5ca` para exigir `financial.period`, `financial.monthly`, `financial.balances` y `financial.snapshot`, manteniendo prohibidas las acciones de escritura y diagnósticos mutantes.
- HEAD corregido `976ae5afcf66cff85791abb76c099d3813a2e5ca` validado por GitHub Actions run `34358067050`: build, TypeScript y E2E local completos en SUCCESS.
- Supabase Edge `financial-app-db-gateway` actualizado de v57 a v58 sin migraciones ni cambios de datos, anclado exactamente a `976ae5afcf66cff85791abb76c099d3813a2e5ca`.
- Production conserva su despliegue `main`; no se modifica código de Production ni se amplían permisos de escritura.
- El segundo Preview final debe demostrar simultáneamente: SHA exacto desplegado, postbuild read-only verde, escritura normal bloqueada con 403 y cero residuo, y recuperación de todas las lecturas financieras protegidas.

Este archivo es un sello documental; no modifica lógica funcional.
