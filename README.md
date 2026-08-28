# Financial App 6.0.0

Aplicación financiera personal privada, responsive y basada en datos reales. La fuente externa se trata siempre en modo lectura y Financial App mantiene separados los datos originales de los enriquecimientos privados.

## Baseline 6.0.0

5.0 cerró la evolución arquitectónica iniciada en 4.x y dejó una única implementación runtime por responsabilidad. 5.0.1 reforzó el OCR documental. 6.0.0 conserva esas garantías y reconstruye integralmente la experiencia visual y de navegación sin duplicar lógica financiera ni sustituir contratos canónicos.

- Navegación principal con cinco destinos exactos: Inicio, Cash Flow, Movimientos, Análisis y Archivo.
- Previsión permanece accesible desde Más y su calendario canónico se integra dentro de Cash Flow.
- Identidad de producto negro/carbón/dorado; verde, rojo, ámbar y azul se reservan para significado financiero o informativo.
- Escala de lectura de 14–16 px en las superficies reformadas y objetivos táctiles de 44 px en controles críticos.
- Inicio usa `financial_app_home_pulse` como ruta crítica ligera y carga cuentas/secciones secundarias en paralelo.
- Se retiran el dashboard monolítico y el antiguo home overview, tanto en loaders Next.js como en RPC PostgreSQL.
- El release probe valida únicamente superficies canónicas: cuentas, home pulse, movimientos, previsión, archivo, matching e inteligencia.
- El OCR de tickets conserva texto, confianza y polígonos por separado y marca contradicciones como revisión pendiente en lugar de inventar datos.
- La revisión canónica del motor OCR es `paddle_layout_v4`: usa PaddleOCR.js 0.4.2 con PP-OCRv6 en español, detecta dos bordes físicos largos para rectificar únicamente el papel cuando existe un contorno fiable, realiza una sola inferencia y no utiliza Tesseract como fallback.
- La vista reconstruida del ticket se maqueta con las coordenadas reales de las líneas OCR; las líneas no interpretadas conservan su posición en vez de desplazarse a un bloque de residuos.
- Archivo separa Nuevas/Pendientes/Archivadas y conserva un histórico reversible. Los documentos existentes en el corte 6.0.0 se archivaron mediante una migración idempotente sin alterar sus valores ni asociaciones.
- Los gates históricos siguen activos de forma forward-compatible.
- `docs/ARCHITECTURE.md` y `docs/CANONICAL_ARCHITECTURE.md` siguen describiendo la arquitectura canónica iniciada en 5.0; 6.0.0 modifica el producto y su composición visual sin crear una arquitectura runtime paralela.

## Principios permanentes

- Fuente bancaria/documental externa exclusivamente en solo lectura.
- El origen nunca se reescribe desde la aplicación.
- Datos originales y enriquecimientos privados permanecen separados.
- Traspasos internos, duplicados y ahorro se excluyen según contratos financieros validados.
- Ediciones, splits, reglas, conciliación, automatizaciones y cierres son trazables y reversibles cuando corresponde.
- Acceso privado mediante Google OAuth y allowlist de servidor.
- Responsive mobile-first, modo claro/oscuro, accesibilidad y pruebas de regresión.
- Una corrección sustituye la causa raíz; no se acumulan capas runtime para mantener compatibilidad.

Los axiomas completos están en `docs/PROJECT_AXIOMS.md`.

## Arquitectura actual

`Google Drive / fuente externa` → `financial-app-sync` → PostgreSQL privado `financial_app` → RPC canónicos → loaders de servidor Next.js → UI privada en Vercel.

### Inicio

- Pulso crítico: `lib/financial/home-pulse.ts` → `financial_app_home_pulse`.
- Cuentas: `lib/financial/accounts.ts` → `financial_app_accounts`.
- Secciones no críticas: streaming/paralelo.
- Sin sincronización automática disruptiva al montar Inicio.
- Navegación privada con precalentamiento por intención/touch.

### Cash Flow y Previsión

- Cash Flow combina datos reales con el calendario de próximos movimientos sin duplicar la lógica de previsión.
- Previsión usa `getForecastCalendar` y el mismo `ForecastClient` canónico que se monta en Cash Flow.
- Calendario mensual de movimientos esperados.
- Matching automático 1↔1 con movimientos reales.
- Ingresos, gastos y cash flow proyectados calculados en servidor.
- Seguros e impuestos anuales reforzados.
- Descartes reversibles que no modifican el movimiento bancario real.

### Movimientos

- Paginación y filtros en servidor.
- Edición individual y masiva por IDs seleccionados.
- Deshacer/historial en operaciones compatibles.
- Splits, reglas deterministas, conciliación y automatizaciones auditables.
- Vinculación de documentos y facturas al movimiento.

### Documentos y Google Drive

- Sincronización incremental.
- Originales de Drive preservados.
- Deduplicación y matching conservador.
- Autoenlace únicamente en coincidencias inequívocas; casos ambiguos a revisión.
- OCR de imagen ejecutado en el navegador con PP-OCRv6; la imagen no se envía a un servicio OCR externo.
- Ciclo de Archivo: Nuevas/Pendientes/Archivadas, con archivado y desarchivado reversible.

### Análisis, Inteligencia y Control

- Análisis conserva 24 visualizaciones canónicas y drill-down.
- Anomalías, recurrencias, incrementos de gasto y oportunidades de ahorro derivadas de señales canónicas.
- Observabilidad de matching sin persistir valores financieros derivados.
- Centro de Control para integridad, calidad, sincronización y cierre.

## Seguridad

- El navegador nunca recibe `SUPABASE_SERVICE_ROLE_KEY` ni secretos Google.
- RLS y privilegios mantienen las superficies privadas cerradas por defecto.
- Preview autenticada mediante token one-time y deshabilitada en producción.
- Las funciones privilegiadas se revisan mediante gates y advisors antes de release.

## Release

Una versión solo llega a `main` después de superar:

1. AXIOMA y arquitectura canónica.
2. Gates históricos de regresión.
3. Gate de la versión actual.
4. Auditoría de dependencias.
5. Lint, TypeScript y build reproducible.
6. Preview del mismo SHA validado.
7. Migración Supabase verificada.
8. Smoke de producción tras el merge.

## Versionado

- Producto visible: `lib/app-version.ts` → **6.0.0**.
- Paquete npm técnico: **3.4.8**.

Ambos versionados son deliberadamente independientes.

## Producción

- Dominio: `financialapp-home.vercel.app`.
- Vercel región `cdg1`.
- Node 22.
- Las ramas de desarrollo no deben consumir previews innecesarios; la publicación se concentra en el HEAD final validado.

## Documentación vigente

- `docs/CANONICAL_ARCHITECTURE.md`
- `docs/ARCHITECTURE.md`
- `docs/PROJECT_AXIOMS.md`
- `docs/PROJECT_CHANGELOG.md`
- `docs/TEST_MATRIX.md`
- `docs/releases/6.0.0.md`

Las migraciones y documentos de releases anteriores se conservan como registro histórico. No deben interpretarse como una arquitectura runtime paralela.

No se deben subir al repositorio credenciales, claves privadas, extractos bancarios, CSV/XLSX/PDF personales, backups financieros reales ni binarios generados del motor documental.
