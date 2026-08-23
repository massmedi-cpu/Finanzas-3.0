# Release gate — Financial App 3.0.0

Estado: CANDIDATA DE RELEASE sobre Financial App 2.8.1.

Este documento sustituye como especificación activa al antiguo gate 3.0 de la arquitectura previa. Ningún requisito obsoleto de aquella rama puede forzar regresiones sobre la arquitectura actual.

## Objetivo

Consolidar Financial App como producto profesional sin duplicar motores financieros ni introducir nuevas fuentes de verdad. 3.0.0 mejora jerarquía, consistencia visual, gráficos, navegación percibida y carga, preservando íntegramente la lógica financiera validada.

## Sistema visual y dashboard

- [x] Capa visual común `app/visual-v300.css` cargada al final de las hojas globales.
- [x] Tokens comunes para ingresos, gastos, serie principal, comparación, grid y relleno auxiliar.
- [x] Temas claro y oscuro definidos explícitamente.
- [x] Inicio usa una jerarquía 3+3 a ancho completo: métricas financieras principales primero y estados operativos después.
- [x] Tarjetas y paneles conservan responsive real y no introducen datos duplicados.

## Gráficos

- [x] Cash Flow conserva barras de ingresos/gastos y acumulado como línea sin relleno.
- [x] Cash Flow conserva doble escala/eje independiente de 2.8.1.
- [x] Análisis usa la semántica visual común para gasto actual/anterior y neto.
- [x] Histórico de saldo usa la semántica común para línea, área auxiliar y puntos.
- [x] Patrimonio usa la semántica común para línea, área, puntos y grid.
- [x] Las reglas de presentación no modifican cálculos, importes ni origen de datos.

## Navegación y carga

- [x] `AppChrome` mantiene el sidebar fuera de la ruta cambiante.
- [x] `app/loading.tsx` ya no sustituye la interfaz por una pantalla global de estado.
- [x] La carga se representa mediante skeleton local dentro de la ruta.
- [x] El skeleton tiene estado accesible y respeta `prefers-reduced-motion`.

## Seguridad, datos y compatibilidad

- [x] Fuente bancaria externa sigue siendo exclusivamente read-only.
- [x] Sin cambios en reglas de Cash Flow, presupuesto, previsión, objetivos, patrimonio, reglas, cierres o recuperación.
- [x] Sin nuevas dependencias de producción para la capa visual.
- [x] Rama `develop/v3.0.0-foundation` con Preview Vercel deshabilitado.
- [x] `audit:v300` protege la base 3.0 y la corrección 2.8.1.

## Gate final obligatorio

- [x] `package.json` = 3.0.0.
- [ ] `package-lock.json` raíz = 3.0.0.
- [x] `lib/app-version.ts` = 3.0.0.
- [x] README alineado con 3.0.0.
- [ ] CI final del HEAD exacto completamente verde.
- [ ] Seguridad de dependencias verde.
- [ ] Auditorías 1.7 → 2.8.1 + `audit:v300` verdes.
- [ ] Pruebas de analítica, inteligencia, horizonte, formato, Europe/Madrid, explicabilidad, integridad y backup verdes.
- [ ] Accesibilidad y TypeScript verdes.
- [ ] Build de producción reproducible verde.
- [ ] PR mergeable y promocionada a `main` sólo después del gate anterior.
- [ ] Un único despliegue final de producción READY sin `aliasError`.
- [ ] `https://financialapp-home.vercel.app` responde HTTP 200 y muestra 3.0.0.
- [ ] Sin errores runtime posteriores al despliegue.

No se realizarán previews de desarrollo ni se modificará `main` antes de que el HEAD candidato supere todos los controles.
