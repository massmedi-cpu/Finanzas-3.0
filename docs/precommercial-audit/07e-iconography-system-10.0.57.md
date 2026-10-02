# ART-004 · Sistema de iconografía · Financial App 10.0.57

## Objetivo

Cerrar ART-004 sin introducir una segunda biblioteca ni alterar reglas financieras. El contrato de producto permanece en `src/design/product-icons.tsx` y pasa a gobernar las acciones e ideas visuales repetidas de las superficies compartidas.

## Contrato

- Un único `viewBox` de 24 × 24 para iconos de producto.
- Trazo por defecto centralizado en `PRODUCT_ICON_STROKE_WIDTH = 1.8`.
- Tamaño por defecto centralizado en `PRODUCT_ICON_DEFAULT_SIZE = "1em"`; las superficies pueden ampliar el icono cuando su control lo requiera, pero no redefinir su geometría.
- `currentColor` gobierna el color para heredar estados hover, active, disabled y forced-colors desde el control contenedor.
- Los iconos son decorativos por defecto. Cuando un icono sea la única fuente de significado debe declararse `decorative={false}` y aportar `label`; el tipo de TypeScript obliga a suministrar ese nombre accesible.
- Los controles con texto o `aria-label` mantienen el icono como decorativo para evitar nombres accesibles duplicados.
- Cada SVG emitido por `ProductIcon` expone `data-product-icon` para pruebas e inspección de runtime.

## Semántica consolidada en REL-057

| Acción/concepto | Icono canónico | Superficies normalizadas |
| --- | --- | --- |
| Buscar | `search` | disparador y campo del buscador global |
| Cerrar | `close` | panel móvil y diálogo de instalación PWA |
| Más opciones/secciones | `more` | dock de navegación móvil |
| Retroceder en navegación horizontal | `chevron-left` | AppShell escritorio/tablet |
| Avanzar en navegación horizontal | `chevron-right` | AppShell escritorio/tablet |
| Destinos de navegación | catálogo existente por `ProductIconName` | AppShell y navegación móvil |

## Inconsistencias retiradas

- SVG de lupa duplicado dentro de `app/global-search.tsx`.
- Glifo `×` usado como cierre en navegación móvil y diálogo PWA.
- Glifo `•••` usado como icono de Más en el dock móvil.
- Glifos `‹` y `›` usados como controles de desplazamiento de la navegación principal.

## Guard automático

`scripts/verify-product-icon-system.mjs` protege este contrato durante build:

1. comprueba que el catálogo mantiene stroke, tamaño, `data-product-icon` y la bifurcación accesible/decorativa;
2. exige que las acciones normalizadas usen sus nombres canónicos;
3. prohíbe SVG inline y los glifos antiguos en las superficies compartidas cubiertas por ART-004;
4. exige que esta documentación siga presente;
5. se ejecuta desde `postbuild` y también mediante `npm run verify:product-icons`.

El guard se limita deliberadamente a las superficies compartidas cerradas en esta release. No convierte gráficas u otros SVG de datos en iconos ni fuerza iconografía donde el texto ya es la representación correcta.

## Certificación del candidato

El candidato REL-057 mantiene identidad exacta `10.0.57` en `package.json` y `package-lock.json`. El gate `Release 10.0.57` debe validar, sobre el SHA exacto que vaya a integrarse: identidad de paquete, sistema de iconografía, breakpoints responsive gobernados, tokens semánticos, diseño premium, TypeScript, build de producción, matriz responsive y regresión del buscador global en escritorio y móvil.

No se considera certificada la release por el mero hecho de que el PR sea mergeable: el gate debe ejecutarse sobre el candidato exacto y terminar correctamente antes de integrar.

## Riesgo y alcance

- Sin cambios en importes, categorías, previsiones, persistencia, OCR, autenticación o fuente bancaria.
- Sin escritura en Google Drive/Sheets.
- El cambio afecta sólo a representación y accesibilidad de iconos compartidos.
- No se añade dependencia externa de iconos; el catálogo sigue siendo propiedad del producto y queda versionado con el código.

## Criterio de aceptación ART-004

ART-004 se considera cerrado cuando TypeScript, build y `verify:product-icons` pasan y las superficies compartidas ya no contienen las implementaciones duplicadas descritas arriba. Las acciones/conceptos repetidos quedan gobernados por el mismo icono y semántica en escritorio y móvil.
