# Financial App 10.0.1 · sello de promoción

Estado: candidato de release, todavía no promovido a Production.

## Base

- Checkpoint funcional: PRE-006 cerrado y validado.
- Versión canónica: 10.0.1.
- PR de promoción: #307 (`release/10.0.1` → `main`).

## Evidencia previa al sello

- Build de producción: verde.
- Regresión Playwright desktop + móvil del candidato `b1ebd8c2a5a1da7e2e92cad7da9fc7f7c789dc35`: verde, run `34325178601`.
- El gate de versión obsoleto que fijaba `10.0.0` se sustituyó por `APP_VERSION`/`TARGET_VERSION` canónicos.
- El Preview anterior ya demostró identidad de SHA exacta; su único fallo live era la aserción de versión fija, no un fallo funcional.

## Puerta final

Este commit lleva `[vercel-preview]` para ejecutar obligatoriamente el gate live contra un Vercel Preview del SHA exacto. No se fusiona #307 ni se declara Production 10.0.1 hasta que build, regresión y Preview protegido terminen verdes y la identidad `/api/build` coincida con el SHA sellado.
