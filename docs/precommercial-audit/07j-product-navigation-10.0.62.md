# ART-009 · Navegación de producto única · Financial App 10.0.62

## Estado auditado

El hallazgo original describía Inicio como una barra de atajos local (`quickNav`) sin ruta activa ni cobertura completa del producto, mientras los módulos recurrían a patrones como «Volver a Inicio».

Tras REL-059, `AppShell` gobierna el marco global y `navigationItems` es la fuente canónica compartida por escritorio y móvil. El patrón histórico `quickNav` ya no forma parte de Inicio y las páginas no deben reconstruir una navegación global propia.

## Contrato 10.0.62

1. Existe una sola autoridad de navegación de producto: `AppShell` + `navigationItems`.
2. La navegación desktop se construye desde `navigationItems`, tiene estado activo semántico (`aria-current=page`) y permanece fuera del contenido de cada página.
3. La navegación móvil se deriva de la misma fuente: dock persistente + un único panel «Más secciones» para destinos secundarios.
4. Inicio y el resto de `page.tsx` pueden contener enlaces/acciones contextuales, pero no una segunda barra `<nav>` de producto.
5. Quedan prohibidos los patrones históricos `quickNav` y «Volver a Inicio» como sustitutos de navegación global.
6. Los destinos financieros principales, incluidos Recurrentes, Análisis, Previsiones, Patrimonio, Presupuestos y Configuración, deben estar presentes en la fuente global.

## Evidencia automática

- `scripts/verify-product-navigation.mjs` recorre todas las `app/**/page.tsx`, evita navegación local duplicada y certifica que desktop/móvil derivan de `navigationItems` con estado activo.
- `tests/e2e/product-navigation-10.0.62.spec.ts` valida en navegador:
  - una sola navegación principal desktop;
  - ausencia de `<nav>` dentro de `#main-content`;
  - alcance de todos los destinos globales;
  - ruta activa en Inicio y Recurrentes;
  - dock móvil persistente;
  - una sola expansión «Más secciones»;
  - acceso móvil al conjunto completo de destinos.

## Cierre de ART-009

La navegación deja de depender de cada dashboard o módulo. Cambiar la lista global, la ruta activa o la estrategia responsive se realiza desde la infraestructura de navegación compartida, no editando página por página.
