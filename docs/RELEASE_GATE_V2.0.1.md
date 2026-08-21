# Release gate — V2.0.1

Baseline protegida: V2.0.0 / `a3b55fa2dfeb99e2be2a180f64fac6e55cbb9d63`.
Rama: `audit/v2.0.1`.
PR: #11.

## Gates previos a merge

- [x] Regresiones financieras automatizadas.
- [x] TypeScript estricto.
- [x] Build de producción.
- [x] Dependencias directas fijadas.
- [x] `package-lock.json` reproducible.
- [x] CI con `npm ci` e invariantes permanentes.
- [x] Auditoría de RLS/RPC.
- [x] Edge Functions exclusivas V3 versionadas sin secretos.
- [x] Esquema V3 actual documentado.
- [x] Documentación canónica del Prompt Maestro.
- [x] Checkpoint V2.0.0 disponible.
- [x] Preview del HEAD de código final READY en Vercel.
- [x] Runtime confirmado en `cdg1`.
- [x] Validación autenticada de navegación.
- [x] Benchmark A/B V2.0.0 vs V2.0.1.
- [x] Prueba específica después de >60 s de inactividad.
- [x] Sin errores de runtime en la validación final.

## Gates de publicación

- [ ] Merge a `main`.
- [ ] Deployment de producción READY.
- [ ] Verificación posterior de producción y versión 2.0.1.

Los tres gates de publicación se ejecutan después de este documento y deben quedar respaldados por el estado final del PR y de Vercel. El benchmark completo está en `docs/BENCHMARK_V2.0.0_V2.0.1.md`.
