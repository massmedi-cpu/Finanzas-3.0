# 28 · Comparativa antes/después

Fecha: 2026-09-10 (Europe/Madrid)

## Referencias

- Baseline de auditoría: `main` `68b5199b61b9b9f2d20a052b06705781e891dc10`, Financial App 10.0.0.
- Candidato técnico tras implementación: `3bcbfeda163f45f19e7d607dc18aaec4a01406e2`.
- Git compare: candidato **221 commits por delante y 0 por detrás** del baseline de auditoría.

El volumen de commits no se usa como métrica de calidad; sólo demuestra trazabilidad acumulativa. La mejora se evalúa por capacidades y gates.

## Cambios objetivos

| Área | Antes | Después verificado |
|---|---|---|
| Primera experiencia | Sin onboarding | `Primeros pasos` implementado y cubierto por E2E |
| Comprensión financiera | Sin Análisis | Análisis read-only con comparación, drivers y drill-down |
| Pendientes | Sin centro único | `Para revisar` agrega referencias sin duplicar fuentes de verdad |
| Navegación | Dependencia frecuente de Inicio | AppShell común con navegación persistente y estado activo |
| Móvil | Fricción/targets incompletos | 360/430/480 cubiertos, touch >=44 px donde aplica, reflow validado |
| Sistema visual | Previsión con identidad paralela | Tokens comunes y Previsión migrada al sistema visual único |
| Gráficos | Interacción/accesibilidad limitada | tabla alternativa, foco/tooltip, neto divergente, overrun y curva de saldo |
| Movimientos | Riesgo de respuesta stale | carreras replace/append reproducidas y bloqueadas por tests |
| Documentos | Riesgo de confiar en MIME | firma/contenido real validado antes de estado confiable |
| Escrituras | Huecos de idempotencia/concurrencia | create de previsión idempotente y stale write → 409 |
| Preview/Production | Riesgo de compartir frontera de escritura | mutaciones Preview→Production bloqueadas y test de cero residuo |
| Multi-tenant | Modelo inicialmente de propietario único | workspace/tenancy, RLS/constraints y smoke cross-tenant |
| Release | Procedencia ambigua | manifest/provenance y verificación SHA/deployment |
| Ciclo de datos | Sin contrato comercial explícito | estado de capacidades honesto + export/impact/intención/readiness/rehearsals técnicos, sin fingir activación comercial |

## Lo que no se declara resuelto

- Net Worth real (PRE-019) no existe y no debe anunciarse.
- Borrado self-service comercial no está activado.
- Política comercial de retención/recibo no está definida.
- Privacidad/condiciones/soporte/status no se inventan sin una salida comercial real.
- PRE-022 mantiene pendiente la separación conceptual completa de histórico/límite/objetivo en Presupuestos.
- No existe todavía medición humana de satisfacción/tiempo ni RUM/Web Vitals de usuarios reales.

## Conclusión

La mejora respecto al baseline es **objetiva y demostrable**, especialmente en navegación, comprensión, móvil, accesibilidad, integridad, aislamiento y trazabilidad. Los pendientes no se ocultan y se trasladan al veredicto comercial.