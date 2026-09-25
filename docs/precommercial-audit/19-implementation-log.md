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

## PRE-025 · Matriz ampliada de edge cases

- Política determinista de importe cero añadida a los contratos de fuente y análisis; cero cuenta como fila, aporta cero y no genera ratios no finitos.
- Límite de ingesta fijado y compartido en 10.000 observaciones; 10.001 falla antes de persistencia.
- Benchmark aislado de 1/3.000/10.000 filas y contrato de rollback atómico añadidos.
- Recuperación de borrador ante sesión expirada añadida a Movimientos, Documentos y Previsión, con reautenticación en otra pestaña y reintento en el formulario original.
- Controles de texto alineados con los máximos de API y matriz visual preparada para 360/430/1.440 px.
- Smoke SQL reversible preparado para cero exacto y workspace totalmente vacío.
- Evidencia completa y limitaciones del entorno registradas en `36-pre025-expanded-edge-cases-evidence.md`.
- `main` y Production permanecen sin cambios; no se ha realizado despliegue en este bloque.

## Ampliación funcional · Comparador financiero

- Comparador de dos periodos personalizados añadido en `/compare`, con referencia anterior no solapada, límite de 366 días y fechas futuras prohibidas.
- Totales y ritmos diarios separados para hacer comparables rangos de distinta duración sin alterar los hechos financieros.
- Ingresos, gasto, neto operativo, ahorro, tasa y drivers por categoría/comercio derivados en servidor desde una única operación `financial.snapshot`.
- Reconciliación bilateral al céntimo y contrato v1 fail-closed añadidos; cero y ausencia total de actividad permanecen finitos y explícitos.
- Drill-down de ambos periodos conectado a Movimientos; `Sin categoría` usa el filtro público `uncategorized=true` también desde Análisis.
- Navegación, búsqueda global, favorito móvil, shortcut PWA y conexiones entre módulos actualizados.
- Recorrido visual preparado para 360/430/1.440 px y evidencia registrada en `37-financial-comparator-evidence.md`.
- `main` y Production permanecen sin cambios; no se ha realizado despliegue en este bloque.

## Candidato de producción · Financial App 10.0.3

- Los bloques acumulados desde Production 10.0.2 se agrupan en un único candidato 10.0.3.
- La identidad canónica se sincroniza en `package.json`, `package-lock.json` y `/api/build`.
- El commit que contiene este registro es el único candidato autorizado para Preview y promoción.
- La promoción exige CI, Preview exacto, gateway Edge alineado, Production READY y comprobación posterior de identidad, autenticación, rutas esenciales y errores 5xx.
- El workflow `Publish Verified Release` debe crear el tag inmutable `v10.0.3` sólo después de que `/api/build` vincule Production con el SHA exacto de `main`.
