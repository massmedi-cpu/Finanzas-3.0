# 05a · Cierre de gaps de producto hasta REL-053

Fecha: 2026-10-02  
Base certificada en producción al iniciar el bloque: 10.0.52  
Candidato de trabajo: REL-053 / PR #469

## Propósito

Este addendum no reescribe la auditoría histórica `05-product.md`. Contrasta sus hallazgos PROD-001…PROD-008 con el producto actual para evitar reabrir trabajo ya resuelto y dejar trazabilidad de los dos gaps que sí seguían vigentes al comenzar REL-053.

## Estado actual de los hallazgos

| Hallazgo | Estado actual | Evidencia |
|---|---|---|
| PROD-001 · Falta Análisis | CERRADO | Existe `/analysis` como superficie propia de comprensión y está integrada en Inicio/navegación. |
| PROD-002 · Falta onboarding | CERRADO | Existe `/onboarding` y aparece como `Primeros pasos` en navegación. |
| PROD-003 · Recurrentes huérfano | CERRADO | `/recurrences` está en navegación principal y conectado conceptualmente con Previsión. |
| PROD-004 · “Disponible total” ambiguo | CERRADO | Inicio utiliza `Saldo total en cuentas`, sin prometer disponibilidad para gasto. |
| PROD-005 · Falta patrimonio/net worth | CANDIDATO REL-053 | Nuevo motor conservador `buildNetWorthSnapshot` y ruta `/net-worth`. La cifra se denomina `Patrimonio financiero conocido`: activos financieros clasificables menos pasivos conocidos. Crédito con signo ambiguo y tipos no clasificables se excluyen en vez de inventar semántica. No incluye aún activos manuales no bancarios. |
| PROD-006 · Falta centro unificado de atención | CERRADO | Existe `/review` (`Para revisar`) y está integrado en navegación/PWA. |
| PROD-007 · Presupuesto histórico presentado como recomendación | CERRADO | Presupuestos distingue `Referencia histórica · media de 3 meses` de `Límite elegido por ti` y añade contexto de ingresos/ahorro. |
| PROD-008 · Configuración de fuente demasiado técnica | CANDIDATO REL-053 | `/configuration/source` pasa a ser una vista simple de conexión, última actualización, cambios, avisos y acción. La superficie técnica madura se conserva en `/configuration/source/diagnostics`. |

## Límites deliberados de Patrimonio en REL-053

REL-053 no debe fabricar un patrimonio completo cuando Financial App sólo conoce cuentas financieras.

Reglas del primer contrato:

- `Patrimonio financiero conocido = activos incluidos - pasivos incluidos`.
- cuentas `checking`, `savings`, `cash` e `investment` con saldo no negativo se consideran activos financieros;
- saldo negativo en una cuenta de activo se trata como pasivo por descubierto;
- una cuenta `credit` sólo se trata como pasivo cuando su saldo negativo hace inequívoca la deuda dentro del contrato actual;
- un saldo de crédito positivo se excluye hasta disponer de semántica contractual que permita distinguir deuda positiva de saldo a favor;
- `other`, cuentas archivadas y saldos inválidos se excluyen explícitamente;
- no se incluyen inmuebles, vehículos ni activos/pasivos manuales inexistentes en el modelo;
- la fuente bancaria sigue siendo de solo lectura.

Esta política favorece una cifra incompleta pero auditable antes que una cifra más grande y potencialmente falsa.

## Criterios de salida REL-053 para estos gaps

1. `/configuration/source` no expone por defecto `PREVALIDACIÓN READ-ONLY`, cursores, revisión de fuente ni pestañas físicas.
2. La primera importación sigue ejecutando el preflight antes de sincronizar.
3. Una acción explícita de actualizar provoca una única sincronización.
4. `/configuration/source/diagnostics` conserva la trazabilidad técnica existente.
5. `/net-worth` muestra activos, pasivos, resultado y exclusiones con explicación.
6. El motor de patrimonio no usa `activeBalanceCents` como sustituto opaco de net worth.
7. La vista móvil no introduce overflow horizontal.
8. TypeScript, build y regresiones específicas REL-053 deben quedar verdes sobre el SHA exacto candidato.
9. El bump a `10.0.53`, merge, deployment y postflight de Production sólo se realizan después de la certificación del candidato.

## Estado de certificación

El workflow `Release 10.0.53` se creó específicamente para este bloque y ejecuta typecheck, build y las regresiones `source-overview-10.0.53.spec.ts` + `net-worth-10.0.53.spec.ts`.

El candidato funcional `117afe805485c0e657ed1ddbd9f4cb65280f0b85` quedó certificado antes del bump, incluidos `Release 10.0.53`, UX15, Responsive, PRE-039 y gates transversales. Después se materializó la identidad `10.0.53` de forma consistente en `package.json` y `package-lock.json`; el commit generado automáticamente fue `454fba347fc5d4a65f8423596894ba1e3f54d1a1`.

GitHub dejó los workflows asociados directamente a ese commit automatizado en estado `action_required`, no `failure`. Este commit documental posterior sirve exclusivamente para producir un SHA versionado normal sobre la misma lógica y disparar la recertificación exacta sin relajar ningún gate. La publicación sigue bloqueada hasta que la recertificación del nuevo HEAD, el merge, el deployment y el Production Postflight estén completados.
