# 07k · ART-010 · Tema visual adaptable · Financial App 10.0.63

## Objetivo

Cerrar `ART-010 · modo visual exclusivamente oscuro` sin añadir un tema claro como parche local. El tema pasa a formar parte de las preferencias visuales existentes y reutiliza el sistema semántico consolidado en ART-001.

## Contrato de producto

Financial App admite tres preferencias locales de tema:

- `Sistema`: sigue `prefers-color-scheme` y reacciona en vivo cuando cambia el sistema operativo.
- `Claro`: fuerza el contrato visual claro con independencia del sistema.
- `Oscuro`: conserva la dirección visual oscura con independencia del sistema.

La preferencia se almacena únicamente en el dispositivo junto con densidad y reducción de movimiento. No modifica datos financieros ni escribe en la fuente bancaria.

## Runtime

`VisualPreferencesProvider` publica en `<html>`:

- `data-theme-preference="system|light|dark"`
- `data-theme="light|dark"`
- `color-scheme` resuelto para controles nativos.

El valor `system` escucha `(prefers-color-scheme: dark)` y actualiza el tema efectivo sin recargar la aplicación.

## Sistema visual

`app/theme-system.css` se carga al final de las capas globales de tema y gobierna:

- fondo global y composición ambiental;
- color, superficies y bordes semánticos;
- navegación desktop y móvil;
- sombras y estados interactivos;
- superficies globales de Inicio y Configuración;
- controles nativos mediante `color-scheme`.

La variante clara no elimina la identidad azul/cian/dorada: reduce profundidad y contraste de superficies manteniendo la semántica financiera de estados.

## Apariencia y accesibilidad

`/configuration/appearance` incorpora un selector accesible Sistema / Claro / Oscuro, muestra la preferencia guardada y el tema efectivo y conserva los controles existentes de densidad y movimiento.

## Certificación

- guard estático: `npm run verify:theme-system`;
- navegador: `npm run test:theme-system` en desktop y móvil;
- persistencia tras recarga;
- seguimiento en vivo del sistema;
- compatibilidad entre tema, densidad y reducción de movimiento;
- TypeScript, build de producción y gates transversales sin cambios de lógica financiera.

## Regla de no regresión

No se puede volver a declarar la aplicación como exclusivamente oscura en `RootLayout`, ni eliminar los tres modos de preferencia, ni dejar el tema efectivo sin reflejarse en `data-theme` y `color-scheme` sin que falle la certificación ART-010.
