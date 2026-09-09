# 09 · Auditoría móvil y responsive

## Dictamen

Financial App 10.0.0 no parte de un responsive improvisado. Existe una gate Playwright explícita que recorre seis viewports y nueve rutas, y varias pantallas transforman su arquitectura al reducir ancho. Sin embargo, la gate actual demuestra principalmente **“no se rompe/no desborda”**, no todavía **“se siente diseñada para móvil”**.

## Evidencia positiva

`tests/e2e/axiom-final-gates.spec.ts` recorre:

- 360×800 · móvil pequeño.
- 480×900 · móvil grande.
- 768×1024 · tablet vertical.
- 1024×768 · tablet horizontal.
- 1280×800 · portátil.
- 1440×900 · escritorio.

En cada viewport comprueba `/login`, `/`, `/transactions`, `/accounts`, `/budgets`, `/forecast`, `/recurrences`, `/documents` y `/configuration` y exige:

- sin 5xx;
- `lang=es`;
- fin de `aria-busy`;
- controles visibles con nombre accesible;
- imágenes con alt;
- sin overflow horizontal global;
- focus visible por teclado.

Fortalezas de CSS verificadas:

- Movimientos cambia de tabla a presentación adaptada en móvil.
- Dashboard colapsa paneles a una columna y simplifica métricas.
- Previsión pasa `mainGrid` a una columna, elimina sticky lateral, apila cards, candidatos y formularios.
- Presupuestos y Configuración utilizan controles alrededor de 44–46 px en muchas acciones principales.

## Hallazgos

### MOB-001 — P1 · La gate responsive no valida targets táctiles mínimos

**Área:** Touch / usabilidad  
**Evidencia:** `axiom-final-gates.spec.ts` verifica nombre/foco/overflow, pero no mide `getBoundingClientRect()` de controles interactivos. En `forecast.module.css`, `.textButton` usa `padding: 4px 7px`, `.primarySmall` `8px 11px`, `.ghostButton` `9px 12px` y `.reasonInput` redefine `min-height: 38px`; no existe mínimo común de 44 px para esos controles.  
**Consecuencia:** una pantalla puede superar la matriz y seguir presentando acciones pequeñas o difíciles de tocar, especialmente dentro de candidatos/conciliación.  
**Recomendación:** gate específica de target táctil en <=480 px: controles esenciales >=44×44 CSS px o alternativa con área clicable equivalente. Corregir primero Previsión y después auditar todos los icon/text buttons.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Bajo funcional; medio de layout.  
**Prioridad:** P1 móvil.  
**Criterio de aceptación:** ningún control esencial visible en 360/430/480 tiene hit area inferior a 44×44.

### MOB-002 — P1/P2 · La navegación móvil sigue siendo web, no app-like

**Área:** Navegación  
**Evidencia:** Inicio usa `quickNav` horizontal con overflow-x; al entrar en módulos predomina el patrón de “Volver a Inicio”/links locales. No existe AppShell persistente con destino activo.  
**Consecuencia:** técnicamente navegable, pero obliga a volver al hub para cambiar de área y no construye memoria espacial propia de una app instalada.  
**Recomendación:** resolver junto con ART-006/009: navegación primaria móvil persistente (bottom bar o rail/drawer según jerarquía), dejando acciones secundarias dentro de cada módulo. No meter ocho iconos en una barra inferior: agrupar secundarios.  
**Esfuerzo:** Medio/alto.  
**Riesgo de regresión:** Medio.  
**Prioridad:** P1 de percepción móvil / P2 técnico.  
**Criterio de aceptación:** desde cualquier módulo se accede a los destinos principales en un gesto sin volver primero a Inicio.

### MOB-003 — P1 · Microtexto pequeño se agrava en móvil

**Área:** Lectura  
**Evidencia:** múltiples módulos usan 0.70–0.80rem para metadata, pills, ayudas, fechas, confianza y estados; Previsión usa 0.74/0.75/0.78rem en contenidos que sí influyen en decisiones.  
**Consecuencia:** en 360–430 px la densidad y la distancia física reducen legibilidad aunque el layout no desborde.  
**Recomendación:** aplicar ART-002 con snapshots/medición móvil; priorizar confianza, estado, fecha, origen y saldos.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Medio visual.  
**Prioridad:** P1.

### MOB-004 — P2 · El viewport “móvil grande” no cubre 430 px explícitos

**Área:** QA responsive  
**Evidencia:** la matriz prueba 360 y 480; el brief precomercial pide aproximadamente 430–480. Existen reglas CSS relevantes alrededor de 420/440 px.  
**Consecuencia:** una regresión situada entre 420 y 479 puede pasar si 360 y 480 se ven bien por reglas diferentes.  
**Recomendación:** añadir 430×932 o 430×900 como gate estable, manteniendo 480.  
**Esfuerzo:** Muy bajo.  
**Riesgo de regresión:** Ninguno.  
**Prioridad:** P2.  
**Criterio de aceptación:** matriz incluye 360, 430 y 480 o justifica técnicamente la eliminación de uno.

### MOB-005 — P2 · `/configuration/source` no forma parte de la matriz principal

**Área:** Cobertura  
**Evidencia:** `ROUTES` incluye `/configuration` pero no `/configuration/source`, una pantalla compleja con conexión, estado, preflight y sincronización.  
**Consecuencia:** uno de los flujos más críticos para entrada de datos no recibe automáticamente la misma verificación responsive básica.  
**Recomendación:** incorporarla a la gate y añadir estados mocked: desconectada, conectada, preflight, sync success/error.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Ninguno.  
**Prioridad:** P2.

### MOB-006 — P2 · Gráficas dependen de interacción de escritorio

**Área:** Touch / charts  
**Evidencia:** valores exactos de barras usan `title`; Dashboard permite scroll horizontal de chart en móvil, pero no selección táctil de un mes.  
**Consecuencia:** la tendencia cabe, pero la consulta exacta no es equivalente al escritorio.  
**Recomendación:** resolver con VIZ-001: tap/focus/hover unificados y tooltip persistente.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.

### MOB-007 — P2 · Teclado virtual y viewport reducido no están probados

**Área:** Formularios  
**Evidencia:** la gate cambia viewport estático, pero no simula teclado virtual, `visualViewport`, inputs enfocados ni reducción de altura. Previsión, Configuración, Presupuestos y editores de Movimientos contienen formularios largos.  
**Consecuencia:** botones de guardar/cancelar o campos inferiores pueden quedar incómodos de alcanzar con teclado abierto aunque no exista overflow horizontal.  
**Recomendación:** test móvil de formulario con viewport bajo y foco en último input; asegurar scroll into view y ausencia de overlays/sticky que oculten controles.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.

### MOB-008 — P3 · No hay tratamiento explícito de safe-area para modo instalado/fullscreen

**Área:** Futuro PWA/app  
**Evidencia:** no se ha identificado uso de `env(safe-area-inset-*)`.  
**Consecuencia actual:** baja para web normal en navegador. Puede importar si se convierte en PWA o wrapper móvil con navegación fija.  
**Recomendación:** no parchear ahora. Incorporar safe areas al diseñar AppShell móvil persistente/PWA.  
**Esfuerzo:** Bajo cuando exista shell.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P3.

## Gates móviles recomendadas

La gate futura debe distinguir cuatro preguntas:

1. **¿Cabe?** — overflow y responsive.
2. **¿Se puede tocar?** — 44×44, spacing, estados disabled.
3. **¿Se puede leer?** — mínimos tipográficos y contraste efectivo.
4. **¿Se puede completar una tarea?** — teclado, scroll, modales/drawers, navegación y feedback.

## Estado de fase

Móvil/responsive: **COMPLETADA** para la primera ronda.

Estado comercial: **NO APTA**.
