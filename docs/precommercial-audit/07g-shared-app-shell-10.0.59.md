# ART-006 · AppShell realmente compartido · Financial App 10.0.59

## Objetivo

Cerrar ART-006 haciendo que la navegación y el marco global dependan del layout raíz, no de la disciplina de cada página. La migración no modifica reglas financieras, loaders, persistencia, OCR, autenticación ni la fuente bancaria.

## Problema verificado antes de REL-059

`app/app-shell.tsx` ya existía y contenía navegación principal, buscador global, estado de fuente, banner offline, PWA y navegación móvil. Sin embargo `app/layout.tsx` no lo montaba. Las páginas decidían individualmente si envolver su contenido con `AppShell`.

Esto producía dos clases de ruta:

- páginas como Inicio, Movimientos, Cash Flow, Análisis, Comparador, Cuentas, Patrimonio, Presupuestos, Recurrentes, Previsión o Documentos montaban `AppShell` localmente;
- Configuración no lo montaba en su `page.tsx`, de modo que el marco global no estaba garantizado por arquitectura.

La navegación compartida existía como componente, pero no como infraestructura obligatoria.

## Contrato REL-059

1. `RootLayout` monta exactamente un `AppShell` alrededor de todas las páginas de producto.
2. `AppShell` permanece dentro de `PwaRuntimeProvider`, ya que consume ese contexto.
3. Las páginas no importan ni montan `AppShell` por su cuenta.
4. El shell sigue siendo propietario de:
   - marca y versión;
   - buscador global;
   - navegación primaria de escritorio;
   - navegación móvil;
   - instalación PWA;
   - estado offline;
   - confianza de fuente;
   - enlace de salto y región `main-content`.
5. `AppShell` es idempotente durante la transición: un wrapper heredado accidental dentro del shell raíz no puede duplicar navegación. El guard, no obstante, prohíbe dejar wrappers locales en `page.tsx`.
6. Los módulos siguen siendo propietarios de su contenido y navegación contextual interna; ART-006 no mezcla reglas de negocio con el shell global.

## Resultado estructural

Cambiar navegación global, marca, ancho global, buscador, estado de fuente, PWA o navegación móvil ya no requiere editar cada módulo. Una nueva `page.tsx` queda dentro del AppShell por defecto, incluso si su autor no importa ningún componente de navegación.

Configuración queda corregida por la propia arquitectura raíz sin añadir un wrapper especial a esa página.

## Guard automático

`scripts/verify-shared-app-shell.mjs` comprueba que:

- `app/layout.tsx` importa y monta `AppShell`;
- el shell queda dentro de `PwaRuntimeProvider`;
- `app/app-shell.tsx` conserva los elementos globales protegidos;
- todas las `app/**/page.tsx` (excluyendo API) carecen de imports o montajes locales de `AppShell`;
- esta documentación permanece presente.

El guard se ejecuta como parte de `postbuild` y mediante `npm run verify:app-shell`.

## Responsive y accesibilidad

La migración conserva el único shell existente, por lo que no sustituye la navegación ya certificada. Mantiene el enlace de salto, `main-content`, navegación móvil, estado activo, botones de desplazamiento de navegación y comportamiento offline existentes.

## Criterio de aceptación ART-006

ART-006 se considera cerrado cuando:

- todas las páginas reciben el shell desde `RootLayout`;
- no quedan wrappers `AppShell` en `page.tsx`;
- Configuración recibe la misma navegación global que las demás rutas;
- una página nueva queda en el marco global sin código adicional;
- `verify:app-shell`, TypeScript, build, responsive y regresiones de navegación pasan sobre el candidato exacto 10.0.59.
