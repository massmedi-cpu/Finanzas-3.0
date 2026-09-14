# 33 — Revalidación beta simulada + comité de diseño

Fecha de corte: 2026-09-12

## Alcance

Esta revalidación continúa CR-006 sobre el checkpoint técnico certificado `4fbbeab69cb0274d9603579593df5043fe68bab7` y el run `34694027518`.

Se cruzan dos perspectivas de revisión:

- ocho perfiles de beta tester simulados/técnicos;
- comité de diseño de producto: dirección de arte, UI/UX senior, responsive, accesibilidad visual y calidad percibida premium.

**Esta evidencia es simulada/técnica. No sustituye beta humana, no completa filas humanas B/H/A y no modifica por sí misma el readiness humano oficial de CR-006 (62,5 %).**

## Evidencia técnica del checkpoint

- Preview protegido exacto del SHA certificado: PASS.
- Suite local completa Chromium desktop + mobile: PASS.
- B01–B08 técnicos del harness CR-006: PASS en el entorno protegido correspondiente.
- Identidad regional: `lang="es-ES"` protegida por pruebas.
- Vercel Preview asociado al SHA certificado: READY.
- Production: no modificada.

## Revalidación por perfiles simulados

| Perfil | Foco | Resultado técnico actual | Observación |
| --- | --- | --- | --- |
| 1. Usuario no técnico | Comprensión, navegación y lenguaje | PASS técnico | La jerarquía de Presupuestos ya separa histórico, recomendación y límite del usuario. |
| 2. Usuario habitual de banca | Movimientos, saldos y lectura financiera | PASS técnico | No se detecta regresión funcional en el gate certificado. |
| 3. Usuario financiero avanzado | Coherencia, comparación y trazabilidad | PASS técnico | Análisis consolida comparación, diferencia, variación y reconciliación sin el panel redundante anterior. |
| 4. Usuario móvil | Responsive, tactilidad y overflow | PASS técnico | La matriz del Axioma cubre viewports móviles y no admite overflow horizontal global. |
| 5. Usuario de escritorio | Densidad, navegación y lectura | PASS técnico | Forecast y las superficies principales superan el gate desktop del checkpoint. |
| 6. Necesidades de accesibilidad | Nombres accesibles, foco, contraste base y tactilidad | PASS técnico | La antigua ambigüedad de Presupuestos que dejó la segunda beta en 15/16 está resuelta en el producto actual. |
| 7. Breaker | Límites, estados y rutas problemáticas | PASS técnico | El gate conserva comprobaciones de boundary protegido, estados globales y 404 propia. |
| 8. Usuario nuevo sin contexto | Orientación y modelo mental | PASS técnico con deuda UX menor | Configuración aún expone algunos nombres internos de icono/color; no bloquea el uso, pero reduce calidad comercial percibida. |

## Resolución del hallazgo histórico de Presupuestos

La segunda beta documentada en `30-second-beta.md` dejó un criterio parcial por mezclar conceptualmente gasto histórico/referencia con el límite manual del usuario.

En el producto actual:

1. se muestra la media histórica como origen;
2. se presenta la recomendación de la app como paso intermedio;
3. se diferencia el límite actual del usuario, indicando si es manual o automático.

Por tanto, ese hallazgo histórico se considera **resuelto en la implementación actual**. El documento histórico no se reescribe ni se convierte retroactivamente en 16/16.

## Comité de diseño — resultado actual

### Mejoras consolidadas

- Presupuestos: modelo mental más claro y jerarquía semántica.
- Análisis: eliminación de comparación redundante y lectura financiera más directa.
- Recurrentes ↔ Previsión: navegación contextual bidireccional mejorada.
- Identidad regional: `es-ES` explícito.
- Responsive/accesibilidad: matriz de viewports y foco/táctil protegidos por gate.

### Deudas no bloqueantes detectadas

#### D-01 — Tipografía no completamente determinista

`globals.css` declara `Inter`, pero `app/layout.tsx` no carga esa fuente. Un equipo sin Inter instalada cae en el stack del sistema, por lo que las métricas tipográficas pueden variar entre plataformas.

**Decisión actual:** no añadir una webfont externa ni modificar la tipografía global sin una prueba visual/regresiva específica. Evitar un cambio transversal por una deuda no bloqueante.

#### D-02 — Configuración expone vocabulario interno

El editor de categorías todavía muestra valores técnicos de icono/color (`wallet`, `home`, `cart`, `blue`, `cyan`, etc.). Es funcional, pero no alcanza el nivel de microcopy esperado en un producto comercial dirigido a usuario final.

**Siguiente tratamiento recomendado:** catálogo de etiquetas localizadas y descriptivas, preservando las claves internas y toda la lógica de persistencia.

#### D-03 — Formato monetario duplicado en dos superficies

`Documentos` y `Movimientos` mantienen formateadores locales de EUR mientras existe una fuente central que fuerza el agrupado `es-ES`.

**Siguiente tratamiento recomendado:** migración quirúrgica al formateador central cuando pueda hacerse con un cambio acotado y revisable; no reescribir componentes grandes solo para resolver esta deuda.

## Decisión del comité

El checkpoint certificado mantiene aptitud técnica para continuar CR-006. No se detecta una nueva regresión que justifique tocar Production o reabrir motores financieros/OCR.

Las tres deudas anteriores son de **pulido precomercial no bloqueante**. Deben resolverse de forma incremental, con prueba específica y sin sacrificar estabilidad por estética.

## Regla de interpretación

- PASS técnico/simulado ≠ PASS humano.
- Ningún perfil simulado completa evidencia B/H/A humana.
- El gate comercial sigue condicionado por sesiones humanas reales y evidencia de dispositivo/persona/fecha/observaciones.
- Readiness humano oficial tras esta revalidación: **62,5 %**, sin cambios.
