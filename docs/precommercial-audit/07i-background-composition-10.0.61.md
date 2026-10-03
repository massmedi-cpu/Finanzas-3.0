# ART-008 · Composición ambiental única · Financial App 10.0.61

## Hallazgo revalidado

La auditoría original detectó competencia entre el fondo global y un fondo específico de Inicio. El estado actual ya no conserva un fondo de página propio en `Inicio`, pero sí mantiene dos composiciones globales distintas: una en `globals.css` y otra posterior en `premium-theme.css`.

REL-061 cierra esa ambigüedad estableciendo una última capa canónica de aplicación.

## Contrato visual

`app/app-background.css` es la autoridad final del lienzo de Financial App y debe importarse como última hoja global desde `RootLayout`.

El lienzo usa deliberadamente:

- dos luces radiales sutiles, azul y cian;
- una base lineal oscura;
- cero rejillas repetitivas;
- cero dorado ambiental: el dorado queda reservado a acentos, estados y marca;
- `background-attachment: fixed` para que la composición no se reinicie por módulo.

`AppShell`, `#main-content` y el `main` de cada página conservan fondo transparente. Las superficies funcionales —hero, paneles, tarjetas, estados— sí pueden usar fondos propios porque expresan jerarquía local y no crean un segundo paisaje de página.

## Protección automática

`scripts/verify-background-composition.mjs` exige:

- `app-background.css` como última hoja global;
- una sola definición canónica de `--gradient-app-canvas`;
- exactamente dos `radial-gradient` y una base `linear-gradient`;
- ausencia de patrones `repeating-*` y dorado ambiental;
- transparencia del marco compartido;
- ausencia de un fondo de página en `.shell` de Inicio.

`tests/e2e/background-composition-10.0.61.spec.ts` verifica en móvil y escritorio la composición efectiva calculada por el navegador, la transparencia de AppShell/Inicio y la ausencia de overflow horizontal.

## Criterio de cierre

ART-008 queda cerrable cuando Release 10.0.61 y los gates transversales pasen sobre el mismo SHA exacto y la versión pueda publicarse con el procedimiento habitual de backup restaurable, deployment controlado y Production Postflight.
