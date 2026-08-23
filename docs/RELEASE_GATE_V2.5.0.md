# Release gate — Financial App 2.5.0

Estado: CANDIDATA DE RELEASE sobre Financial App 2.4.0.

## Base protegida

- `main` permanece en 2.4.0 hasta que este gate termine en verde.
- La rama `develop/v2.5.0-month-close` no genera Preview de Vercel.
- Se preservan todas las garantías y auditorías 1.7 → 2.4.
- La fuente bancaria original continúa siendo exclusivamente de lectura.

## Alcance activo 2.5

- Formato numérico español de España obligatorio y centralizado.
- Miles con punto y decimales con coma: `1.234.567,89`.
- Euros, enteros, porcentajes y valores con signo reutilizan `lib/format/es-es.ts`.
- Se eliminan formateadores financieros locales repetidos de las superficies principales.
- El cambio de formato no altera importes, cálculos, filtros, reglas ni persistencia.
- El cierre mensual existente y sus bloqueos permanecen protegidos dentro del Centro de Control; esta release no introduce una segunda fuente de verdad de cierre.

## Regresiones obligatorias

- [x] Auditoría estructural/Axioma.
- [x] Arquitectura y rendimiento 1.7.
- [x] Recuperación 1.8.
- [x] Motor documental 1.9.
- [x] Plan unificado 2.0.
- [x] Estabilización 2.0.1.
- [x] Evolución 2.1.
- [x] Analítica 2.2 + pruebas de cálculo.
- [x] Inteligencia 2.3 + pruebas de decisión.
- [x] Horizonte 2.4 + pruebas de cálculo.
- [x] Auditoría `audit:v250`.
- [x] Pruebas `test:format`.
- [x] Backup/recovery.
- [x] Accesibilidad.
- [x] TypeScript.
- [x] Build de producción reproducible.

## Versionado

- [x] `package.json` = 2.5.0.
- [x] `package-lock.json` raíz = 2.5.0.
- [x] `lib/app-version.ts` = 2.5.0.
- [x] README alineado con 2.5.0.

## Cierre de release

- [ ] CI final del HEAD limpio en verde después de retirar helpers temporales.
- [ ] PR marcada lista para revisión y mergeable contra `main`.
- [ ] Merge a `main` únicamente tras CI final verde.
- [ ] Verificación posterior de producción en `financialapp-home.vercel.app`.
