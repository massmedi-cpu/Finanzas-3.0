# 16 · Índice de informes individuales

## Cobertura

La primera ronda precomercial ha generado informes separados por disciplina, manteniendo los hallazgos originales antes de deduplicar. Esto es deliberado: permite ver cuándo una misma causa afecta simultáneamente a seguridad, producto, UX, móvil o marketing.

### Informes

| Informe | Disciplina principal | Hallazgos brutos |
|---|---|---:|
| 00-baseline.md | Release / checkpoint / estado inicial | 6 iniciales |
| 01-architecture.md | Arquitectura senior | 5 |
| 02-frontend.md | Frontend senior | 6 |
| 03-backend-database.md | Backend + PostgreSQL/Supabase | 5 |
| 04-security.md | Seguridad | 7 |
| 05-product.md | Producto + producto financiero | 8 |
| 06-marketing.md | Marketing / posicionamiento | 7 |
| 07-art-direction-design.md | Dirección de arte / UI / gráfico | 10 |
| 07a-design-addendum-forecast-theme.md | Coherencia visual | 1 |
| 08-data-visualization.md | Visualización de datos | 8 |
| 09-mobile-responsive.md | Mobile / responsive | 8 |
| 10-ux.md | UX / usabilidad | 9 |
| 11-accessibility.md | Accesibilidad | 9 |
| 12-performance.md | Rendimiento | 8 |
| 13-beta-initial.md | 8 beta testers ficticios | hallazgos cruzados |
| 14-edge-cases.md | Edge cases / resiliencia | 9 |
| 15-copy-microcopy.md | Copy / microcopy | 10 |

**Total bruto disciplinar (sin contar baseline/beta como nuevos IDs): 110 hallazgos.**

No se interpreta como 110 trabajos distintos. El Comité conjunto debe fusionarlos por causa raíz.

## Roles cubiertos

- Arquitecto senior: 01.
- Frontend senior: 02.
- Backend senior: 03.
- Base de datos: 03.
- Seguridad: 04.
- Rendimiento: 12.
- Director de producto: 05.
- Especialista de producto financiero: 05 + 08 + 15.
- Marketing: 06.
- Dirección de arte: 07/07a.
- Diseño gráfico/UI: 07/07a.
- UX/usabilidad: 10.
- Mobile/responsive: 09.
- Accesibilidad: 11.
- Visualización: 08.
- Beta testers: 13.
- QA/release: baseline + gates existentes + fases 20/24 posteriores.

## Criterio de calidad aplicado a los informes

Cada recomendación accionable se ha formulado con:

- hallazgo concreto;
- área/archivo o evidencia viva;
- consecuencia;
- solución propuesta;
- esfuerzo aproximado;
- riesgo de regresión;
- prioridad;
- criterio verificable de aceptación.

Las recomendaciones como “mejorar diseño” o “optimizar rendimiento” sin mecanismo concreto se han descartado.

## Hallazgos con convergencia multidisciplinar fuerte

Los siguientes aparecen desde varias disciplinas y son candidatos claros a causas raíz del Comité:

1. **Single-owner / ausencia de tenancy** — Arquitectura, Backend, Seguridad, Producto comercial.
2. **Preview y Production comparten persistencia** — Backend, Seguridad, Release.
3. **No existe AppShell/navegación persistente** — Producto, Diseño, Móvil, UX.
4. **No existe Análisis** — Producto, Visualización, Beta, UX.
5. **No existe onboarding** — Producto, Marketing, UX, Beta.
6. **No existe “Para revisar”** — Producto, UX, Beta.
7. **Sistema visual fragmentado** — Diseño, Móvil, Accesibilidad, Marketing.
8. **Previsión visualmente pertenece a otro tema** — Diseño, Marketing, Móvil.
9. **Microtexto/targets pequeños** — Diseño, Móvil, Accesibilidad.
10. **Charts estáticos/no accesibles** — Visualización, Móvil, Accesibilidad, Beta.
11. **Fases/lenguaje interno visibles** — Marketing, UX, Copy.
12. **“Disponible/Patrimonio” semánticamente incorrectos** — Producto, Copy, Marketing.
13. **Movimientos con respuesta stale potencial** — Frontend, Edge cases, Beta.
14. **Carga Inicio fan-out/bloqueo total** — Frontend, UX, Rendimiento, Edge cases.
15. **Uploads sin magic-byte validation en finalize** — Seguridad, Edge cases.
16. **Falta control optimista/idempotencia en algunas escrituras** — Backend/Edge cases/UX.
17. **Falta medición Web Vitals/QA perceptual** — Rendimiento, Mobile, QA.
18. **Trazabilidad exacta del release** — Baseline, Arquitectura/Release.

## Estado

Informes individuales: **COMPLETADOS** para primera ronda.

Siguiente fase: Comité conjunto y matriz P0–P4.

Estado comercial: **NO APTA**.
