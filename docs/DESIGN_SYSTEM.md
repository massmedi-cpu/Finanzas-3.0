# Design system — Finanzas 3.0 V2.0.1

## Principios

Interfaz financiera profesional, sobria, legible y mobile-first. La jerarquía visual debe priorizar comprensión y comparación de cifras, no decoración.

## Tokens base

Los tokens canónicos viven en `app/globals.css`:
- fondo: `--bg`
- superficies: `--surface`, `--surface-soft`
- texto: `--text`, `--muted`
- divisores: `--line`
- acción/acento: `--accent`, `--accent-soft`
- estados: `--success`, `--warning`, `--danger` y variantes suaves
- radio base: `--radius: 14px`

## Tipografía

- Fuente: Inter con fallback system UI.
- Base: 16px / line-height 1.5.
- H1: `clamp(30px, 4vw, 44px)`.
- Métrica principal: 28px escritorio, 25px móvil.
- Texto auxiliar nunca debe hacerse ilegible para ganar densidad.
- Importes usan numerales tabulares cuando corresponde.

## Layout

- ancho máximo principal: 1280px;
- grid de 4/3/2 columnas en escritorio;
- a 900px, grids grandes pasan a 2 columnas;
- a 620px, todos los grids principales pasan a 1 columna;
- tablas anchas usan scroll horizontal en lugar de comprimir columnas ilegiblemente.

## Componentes semánticos

- `card`: unidad de información estable.
- `status-panel`: estado OK/advertencia/error.
- `badge`: metadato corto, nunca sustituto de un título.
- `amount-positive` / `amount-negative`: semántica de signo financiero.
- `empty`: estado vacío explícito.
- `loading`: debe aparecer en navegaciones dinámicas antes de que el usuario interprete la app como bloqueada.

## Reglas de cambio visual

1. No introducir tamaños aislados fuera de la escala existente sin justificarlo.
2. Comprobar móvil y escritorio.
3. No ocultar información financiera esencial por motivos estéticos.
4. Mantener contraste de estados; no depender solo del color para explicar errores.
5. Antes de fusionar un rediseño, comprobar que no cambió lógica, filtros, cifras, acciones ni navegación.
