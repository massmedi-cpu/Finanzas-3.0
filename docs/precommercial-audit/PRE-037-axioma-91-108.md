# PRE-037 · Axioma §§91–108

Fecha: 2026-10-02
Base auditada: Financial App 10.0.51 · `main` `c64753dca49d6f6577c4a945759f58357bc1495c`

## Hallazgos reales

La aplicación ya disponía de matriz responsive, safe areas, targets táctiles, `prefers-reduced-motion`, navegación adaptativa, estados accesibles y un gate de navegación/rendimiento. La auditoría contra el texto exacto del Axioma detectó tres gaps objetivos:

1. §92 exigía configuración **CÓMODA / COMPACTA** con efecto real y sin reducir tipografía. No existía preferencia seleccionable.
2. §104 exigía, además de `prefers-reduced-motion`, una opción interna **REDUCIR MOVIMIENTO**. No existía.
3. §103 pedía escenarios relevantes en Edge escritorio y Safari/iOS. El repositorio no tenía pruebas WebKit ni Edge.

## Corrección

- Nuevo sistema global `VisualPreferencesProvider`.
- Preferencia `Cómoda / Compacta` persistida en el dispositivo como configuración visual no financiera.
- Compacta modifica tokens de espaciado y separación; no redefine tokens `--font-*` ni reduce áreas táctiles.
- Preferencia interna `Reducir movimiento` con efecto global y persistencia; complementa `prefers-reduced-motion`.
- Nueva ruta `Configuración > Apariencia` con controles semánticos, feedback `aria-live`, ayuda y vista previa.
- Prueba de persistencia tras recarga y restauración de preferencias.
- Matriz específica de 320×700, 430×932, 768×1024, 1024×768, 1366×768 y 1600×900.
- Prueba de escalado tipográfico al 125 % sin scroll horizontal global.
- Smoke aislado WebKit/iPhone y Microsoft Edge escritorio.
- Presupuesto automático del JavaScript de cliente tras `npm run build`, con techo total y de chunk individual.
- Reutilización del gate de navegación/rendimiento existente dentro de PRE-037.

## Cobertura §§91–108

- §91: la nueva UI usa Grid/Flex; no introduce `position:absolute` como sistema de maquetación.
- §92: automatizada con cambio real de tokens, persistencia y comparación de tamaño tipográfico antes/después.
- §93: E2E con escalado de texto al 125 % y comprobación de overflow global.
- §94–95: tablet vertical/horizontal y matriz completa de anchos en Playwright.
- §96: el contrato estático impide que Compacta redefina tipografía y el E2E compara el tamaño computado.
- §97–98: una única capa global de preferencias/tokens; no se añaden cadenas de media queries por pantalla.
- §99–101: se renderizan estados normal, Compacta, movimiento reducido y persistido en navegador real.
- §102: Playwright conserva screenshot en fallo; la comparación visual humana sigue siendo complementaria cuando exista un cambio gráfico de mayor alcance.
- §103: Chromium escritorio/móvil, WebKit/iOS y Edge escritorio.
- §104: opción interna + preferencia del sistema, con controles accesibles y feedback `aria-live`.
- §105–106: reducción de movimiento no elimina feedback; densidad se implementa como sistema global, no por módulo.
- §107–108: navegación medida por gate existente y nuevo presupuesto de bundle tras build.

## Invariantes

PRE-037 no toca cálculos, movimientos, categorías bancarias, sincronización, OCR, Supabase ni Google Drive. La fuente bancaria continúa siendo solo lectura. Las únicas preferencias persistidas son visuales (`density`, `reduceMotion`) y no contienen datos financieros ni personales.

## Estado de release

Este bloque no cambia la versión ni abre Vercel. Financial App 10.0.51 continúa como Producción hasta que PRE-037 esté certificado y se decida abrir un candidato posterior de forma controlada.
