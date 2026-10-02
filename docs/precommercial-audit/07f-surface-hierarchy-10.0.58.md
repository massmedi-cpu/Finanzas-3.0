# ART-005 · Jerarquía de superficies · Financial App 10.0.58

## Objetivo

Cerrar ART-005 reduciendo el patrón visual de «cajas dentro de cajas» en las tres superficies prioritarias de la auditoría: Inicio, Movimientos y Configuración. La intervención es exclusivamente de presentación; no cambia lógica financiera, datos, persistencia, OCR, autenticación ni fuente bancaria.

## Contrato visual

Financial App limita las pantallas densas a 2–3 niveles reconocibles:

1. **Superficie estructural**: hero, panel principal, filtros o barra contextual. Puede usar fondo, borde completo, radio y sombra cuando realmente separa una región de la pantalla.
2. **Agrupación interna**: filas, bloques KPI, trazabilidad, edición o revisión. Se expresa preferentemente mediante espaciado, tipografía y divisores; no debe convertirse por defecto en otra tarjeta completa.
3. **Estado o interacción**: botones, campos, chips, alertas, selección y controles. Pueden conservar forma propia porque comunican acción o estado, no jerarquía estructural.

## Inicio

- `attention` continúa como superficie estructural.
- `attentionItem` deja de ser una tarjeta con borde completo, radio y fondo propio.
- En escritorio cada aviso se distingue por un acento lateral; en disposición vertical se usan divisores.
- Los estados warning/danger/info siguen visibles mediante el color del acento, sin añadir otra caja.

## Movimientos

- Los KPI de `summary` viven directamente dentro del hero y se separan con divisores.
- La trazabilidad `trace dl` deja de crear una mini-tarjeta y usa un acento lateral.
- `editor` y `reviewPanel` dejan de ser paneles completos dentro de la tabla: el propio row contextual es el nivel intermedio y editor/revisión se delimitan con un divisor superior.
- `reviewCard` pasa a ser una fila separada por divisor.
- En móvil, cada movimiento deja de ser una tarjeta redondeada dentro del panel y se convierte en una fila vertical separada por divisor.
- Alertas, chips, selección y campos mantienen sus affordances porque representan estado o interacción.

## Configuración

- Los KPI de `configuration-summary` viven directamente dentro del hero y se separan con divisores.
- `config-panel` sigue siendo la superficie estructural.
- `entity-card` pasa a ser una fila plana dentro del panel, separada por divisores; desaparecen su fondo, radio, borde completo y desplazamiento hover.
- Iconos, estados de ciclo de vida y botones conservan su forma porque representan identidad, estado o acción.

## Responsive

- La jerarquía se mantiene en escritorio, tablet y móvil.
- Cuando los KPI pasan a una sola columna, los separadores laterales se convierten en separadores superiores.
- Las filas móviles de Movimientos no reintroducen borde completo, fondo y radio.
- Las entidades de Configuración pueden apilar contenido y acciones, pero siguen siendo filas dentro del panel.

## Guard automático

`scripts/verify-surface-hierarchy.mjs` comprueba durante build que las superficies internas protegidas no recuperen simultáneamente los patrones de tarjeta retirados. Protege:

- Inicio: `attentionItem`.
- Movimientos: `summary > div`, `trace dl`, `editor/reviewPanel`, `reviewCard` y filas móviles.
- Configuración: `configuration-summary > div`, `entity-list` y `entity-card`.

El guard no prohíbe tarjetas en todo el producto. Su propósito es impedir que agrupaciones internas ya normalizadas vuelvan a adquirir borde completo + fondo + radio sin una nueva decisión de diseño explícita.

## Criterio de aceptación ART-005

ART-005 se considera cerrado cuando:

- Inicio, Movimientos y Configuración presentan 2–3 niveles visuales claros;
- las agrupaciones internas descritas arriba se resuelven con divisores/espaciado en lugar de nuevas tarjetas;
- la adaptación móvil conserva esta reducción de superficies;
- `verify:surface-hierarchy`, los guards de diseño existentes, TypeScript, build y la matriz responsive terminan correctamente sobre el candidato exacto 10.0.58.
