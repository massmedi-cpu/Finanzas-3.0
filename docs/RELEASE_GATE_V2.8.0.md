# Release gate — Financial App 2.8.0

Estado: CANDIDATA ACUMULADA 2.6 → 2.8 sobre la base estable 2.5.0.

## Base protegida
- La rama `develop/v2.8.0-integrity-rebuild` tiene Vercel desactivado.
- La fuente bancaria original sigue siendo exclusivamente de lectura.
- Se preservan todas las garantías 1.7 → 2.5 antes de promocionar 2.8.
- Las ramas antiguas `develop/v2.8.0-control-center*` pertenecen a la arquitectura obsoleta y no se usan para esta release.

## 2.6 — reglas
- [x] Preview read-only obligatorio.
- [x] Prioridad determinista y precedencia de overrides manuales/splits.
- [x] Pausar, reactivar y eliminar reglas es reversible y auditado.
- [x] Sin regex arbitraria ni escritura sobre la fuente.
- [x] Horario Europe/Madrid centralizado y probado.

## 2.7 — explicabilidad
- [x] Procedencia fuente/regla/manual/split definida y probada.
- [x] Sugerencias conservadoras y sin escritura automática.
- [x] Preview 2.6 obligatorio antes de convertir sugerencias en regla.
- [x] Superficie privada `/explicabilidad`.
- [x] Backend privilegiado fail-closed y service-role only.

## 2.8 — integridad y Centro de Control
- [x] Centro de Control ampliado con snapshot técnico read-only.
- [x] Auditoría profunda sólo bajo acción explícita.
- [x] Checksum de fuente y fingerprint estructural.
- [x] Comprobaciones de IDs, cuentas, sincronización, continuidad, calidad y archivo privado.
- [x] Historial persistente de auditorías protegido por RLS.
- [x] La auditoría no modifica movimientos ni la fuente bancaria.

## Regresiones obligatorias
- [ ] Auditoría estructural/Axioma.
- [ ] Arquitectura 1.7.
- [ ] Recuperación 1.8.
- [ ] Motor documental 1.9.
- [ ] Plan 2.0 y estabilización 2.0.1.
- [ ] Evolución 2.1.
- [ ] Analítica 2.2 + tests.
- [ ] Inteligencia 2.3 + tests.
- [ ] Horizonte 2.4 + tests.
- [ ] Formato/cierre 2.5 + tests.
- [ ] Reglas 2.6 + tests de tiempo.
- [ ] Explicabilidad 2.7 + tests.
- [ ] Integridad 2.8 + tests.
- [ ] Backup/recovery.
- [ ] Accesibilidad.
- [ ] TypeScript.
- [ ] Build de producción reproducible.

## Versionado
- [x] `package.json` = 2.8.0.
- [ ] `package-lock.json` raíz = 2.8.0.
- [x] `lib/app-version.ts` = 2.8.0.
- [x] README alineado con 2.8.0.

## Promoción
- [ ] CI final del HEAD exacto en verde.
- [ ] PR mergeable contra `main` 2.5.0.
- [ ] Merge a `main` únicamente tras el gate final verde.
- [ ] Único despliegue de producción READY.
- [ ] `financialapp-home.vercel.app` sirve 2.8.0.
- [ ] Sin errores runtime tras la publicación.
