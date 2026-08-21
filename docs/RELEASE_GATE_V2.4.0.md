# Release gate — V2.4.0

## Estado

**Desarrollo funcional: PASS**

**Release/producción: PENDIENTE** hasta cerrar la cadena V2.2 → V2.3 → V2.4 y recuperar el único preview final de Vercel.

## Gates completados

- [x] Motor de horizonte 1–60 meses.
- [x] Escenario de 60 meses no truncado a 24 recurrencias.
- [x] Eventos mensuales planificados cubren 60 meses.
- [x] Ventanas de 12 meses sin IDs duplicados.
- [x] Ningún movimiento fuera del horizonte solicitado.
- [x] Capacidad mensual de objetivos alineada con el horizonte real del escenario.
- [x] Calendario financiero mensual con arrastre de saldo.
- [x] Detección de primera fecha negativa.
- [x] Resumen anual para horizontes superiores a 12 meses.
- [x] Regresiones financieras existentes en verde.
- [x] Regresiones específicas long-horizon en verde.
- [x] TypeScript en verde.
- [x] Build de producción en verde.
- [x] Smoke del build real en verde.
- [x] Invariantes de arquitectura en verde.
- [x] Rama de desarrollo sin preview automático de Vercel.

## Última evidencia CI del bloque

HEAD validado durante el cierre de arquitectura: `8e3d19bab60d2e25102a5abb232b4555776d77ee`.

Workflow `Finanzas 3.0 CI`, run #457:
- Project invariants: success
- Finance regression tests: success
- Long-horizon regression tests: success
- Typecheck: success
- Production build: success
- Built app smoke test: success

GitHub no recibió estado de Vercel para ese HEAD, confirmando que la rama de desarrollo no solicitó preview automático.

## Pendiente para release final

- [ ] Retarget tras fusionar versiones apiladas anteriores.
- [ ] Bump coordinado `package.json` + `package-lock.json` + `src/version.ts` a 2.4.0.
- [ ] Un único preview Vercel del HEAD exacto de release.
- [ ] Recorrido autenticado de Previsión: 12/24/36/60 meses.
- [ ] Verificar calendario mensual y anual en móvil/escritorio.
- [ ] Verificar cero errores runtime.
- [ ] Merge protegido por SHA.
- [ ] Producción READY en `cdg1`.
- [ ] `/api/health` = 2.4.0.
- [ ] Smoke post-deploy y rollback confirmado.

## Rollback

V2.4 es aditiva sobre los motores V2.2/V2.3. No modifica la fuente bancaria, no elimina el snapshot de compatibilidad y no introduce nuevas escrituras. La promoción final no se realizará hasta que el preview exacto del release pase todos los gates.
