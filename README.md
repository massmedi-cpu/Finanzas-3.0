# Financial App 6.0.1

Aplicación financiera personal privada, responsive y basada en datos reales. La fuente externa se trata siempre en modo lectura y Financial App mantiene separados los datos originales de los enriquecimientos privados.

## Baseline 6.0.1

5.0 cerró la evolución arquitectónica iniciada en 4.x y dejó una única implementación runtime por responsabilidad. 5.0.1 reforzó el OCR documental. 6.0.0 reconstruyó integralmente la experiencia visual y de navegación. 6.0.1 endurece ese sistema sin crear capas paralelas: corrige la paginación y búsqueda de Archivo, completa la retirada de aliases visuales heredados y amplía los gates de calidad a todas las superficies activas.

- Navegación principal con cinco destinos exactos: Inicio, Cash Flow, Movimientos, Análisis y Archivo.
- Previsión permanece accesible desde Más y su calendario canónico se integra dentro de Cash Flow.
- Identidad de producto negro/carbón/dorado; verde, rojo, ámbar y azul se reservan para significado financiero o informativo.
- Escala de lectura de 14–16 px en las superficies reformadas y objetivos táctiles de 44 px en controles críticos.
- Las 37 hojas CSS activas quedan protegidas por auditoría contra microtexto, `!important` y aliases visuales heredados.
- Archivo pagina en servidor los estados Nuevas/Pendientes/Archivadas y calcula búsqueda y conteos con el mismo filtro.
- Inicio usa `financial_app_home_pulse` como ruta crítica ligera y carga cuentas/secciones secundarias en paralelo.
- Se retiran el dashboard monolítico y el antiguo home overview, tanto en loaders Next.js como en RPC PostgreSQL.
- El release probe valida únicamente superficies canónicas: cuentas, home pulse, movimientos, previsión, archivo, matching e inteligencia.
- El OCR de tickets conserva texto, confianza y polígonos por separado y marca contradicciones como revisión pendiente en lugar de inventar datos.
- La revisión canónica del motor OCR es `paddle_layout_v4`: usa PaddleOCR.js 0.4.2 con PP-OCRv6 en español, detecta dos bordes físicos largos para rectificar únicamente el papel cuando existe un contorno fiable, realiza una sola inferencia y no utiliza Tesseract como fallback.
- La vista reconstruida del ticket se maqueta con las coordenadas reales de las líneas OCR; las líneas no interpretadas conservan su posición en vez de desplazarse a un bloque de residuos.
- Archivo conserva un histórico reversible. Los documentos existentes en el corte 6.0.0 se archivaron mediante una migración idempotente sin alterar sus valores ni asociaciones.
- Los gates históricos siguen activos de forma forward-compatible.
- `docs/ARCHITECTURE.md` y `docs/CANONICAL_ARCHITECTURE.md` siguen describiendo la arquitectura canónica iniciada en 5.0; 6.x mejora el producto sin crear una arquitectura runtime paralela.

## Principios permanentes

- Fuente bancaria/documental externa exclusivamente en solo lectura.
- El origen nunca se reescribe desde la aplicación.
- Datos originales y enriquecimientos privados permanecen separados.
- Traspasos internos, duplicados y ahorro se excluyen según contratos financieros validados.
- Ediciones, splits, reglas, conciliación, automatizaciones y cierres son trazables y reversibles cuando corresponde.
- Acceso privado mediante Google OAuth y allowlist de servidor.
