# Financial App 6.4.0

Aplicación financiera personal privada, responsive y basada en datos reales. La fuente externa se trata siempre en modo lectura y Financial App mantiene separados los datos originales de los enriquecimientos privados.

## Baseline 6.4.0

5.0 cerró la evolución arquitectónica iniciada en 4.x y dejó una única implementación runtime por responsabilidad. 5.0.1 reforzó el OCR documental. 6.0.0 reconstruyó integralmente la experiencia visual y de navegación. 6.0.1 endureció Archivo y amplió los gates. 6.1.0 añadió matching documental explicable y calibración anónima. 6.2.0 convirtió esa calibración en una política supervisada versionada y reversible. 6.3.0 amplió la revisión documental a un triage universal y 6.3.1–6.3.2 cerraron la reconstrucción real de documentos comerciales. 6.4.0 convierte ese triage en un Centro de operaciones documentales: identifica qué acciones son seguras, permite resolver varias a la vez, vuelve a validarlas en servidor al confirmar y conserva los casos ambiguos como decisiones manuales.

- Navegación principal con cinco destinos exactos: Inicio, Cash Flow, Movimientos, Análisis y Archivo.
- Previsión permanece accesible desde Más y su calendario canónico se integra dentro de Cash Flow.
- Identidad de producto negro/carbón/dorado; verde, rojo, ámbar y azul se reservan para significado financiero o informativo.
- Escala de lectura de 14–16 px en las superficies reformadas y objetivos táctiles de 44 px en controles críticos.
- Las superficies activas quedan protegidas por auditoría contra microtexto, `!important` y aliases visuales heredados.
- Archivo pagina en servidor los estados Nuevas/Pendientes/Archivadas y calcula búsqueda y conteos con el mismo filtro.
- `Centro de operaciones documentales` evoluciona la antigua Atención documental sin crear un segundo triage: `document_triage_core` sigue determinando prioridades.
- El orden de atención prioriza OCR fallido, metadatos incompletos, asociación segura, matching manual, ausencia de candidato y archivado.
- Cada prioridad incluye razones explícitas; los documentos sin candidato siguen visibles y no desaparecen de la revisión.
- Las operaciones seguras se limitan a asociación autoelegible y archivado de documentos ya asociados; cualquier otro caso permanece manual.
- El usuario selecciona y confirma las operaciones; no existe ejecución automática de la cola.
- Justo antes de escribir, el servidor vuelve a consultar el mejor candidato y su `auto_eligible`; una coincidencia que haya cambiado se rechaza.
- Los lotes aceptan como máximo 50 acciones y aíslan cada elemento: un rechazo no revierte las operaciones seguras restantes.
- La asociación segura reutiliza `archive_link_calibrated_core`, conservando el aprendizaje supervisado y el histórico de calibración existente.
- El archivado seguro registra `document_history` y puede restaurarse; las asociaciones pueden deshacerse mediante unlink.
- La última tanda segura aplicada puede revertirse desde el propio centro de operaciones.
- `anon` no puede ejecutar operaciones 6.4. Los wrappers `public` son `SECURITY INVOKER`; los cores `SECURITY DEFINER` quedan fuera del API público, requieren rol autenticado y vuelven a comprobar la allowlist mediante `authorized_email()`.
- Archivo y Centro de control comparten el mismo motor server-side de matching documental; no existe una segunda fórmula de scoring en React/Node.
- El matching expone score, confianza, margen frente al segundo candidato, coincidencia de comercio, razones y autoelegibilidad.
- Los casos ambiguos nunca se consideran autoenlace seguro ni pueden incorporarse a un lote.
- El histórico de calidad almacena únicamente métricas agregadas diarias de cobertura, autoelegibilidad y ambigüedad.
- La calibración registra únicamente señales anónimas de decisión y no almacena IDs, importes, comercios ni conceptos.
- La política supervisada parte de score 93, margen 8 y comercio obligatorio; cualquier propuesta necesita evidencia mínima, aprobación autenticada y queda versionada.
- Las propuestas pueden endurecer la política, nunca relajarla automáticamente. Aplicar, rechazar y rollback son acciones explícitas.
- El motor consulta la política activa para determinar autoelegibilidad; los umbrales ya no están hardcodeados en la lógica de matching.
- Inicio usa `financial_app_home_pulse` como ruta crítica ligera y carga cuentas/secciones secundarias en paralelo.
- El OCR conserva texto, confianza y polígonos por separado; los tickets usan su parser específico y los albaranes/facturas reconstruyen tablas Cantidad/Código/Artículo/Precio/IVA/Subtotal mediante evidencia textual y aritmética verificable.
- La revisión canónica del motor OCR es `paddle_layout_v6`, con PaddleOCR.js 0.4.2 y PP-OCRv6 en español, una sola inferencia y fallback seguro al original si no hay contorno fiable.
- La regresión OCR incluye la evidencia literal del albarán real que permanecía pendiente tras 6.3.1.
- Archivo conserva un histórico reversible y los documentos del corte 6.0.0 permanecen archivados sin alterar sus valores ni asociaciones.
- Los gates históricos siguen activos de forma forward-compatible.
- `docs/ARCHITECTURE.md` y `docs/CANONICAL_ARCHITECTURE.md` siguen describiendo la arquitectura canónica iniciada en 5.0; 6.x mejora el producto sin crear una arquitectura runtime paralela.

## Principios permanentes

- Fuente bancaria/documental externa exclusivamente en solo lectura.
- El origen nunca se reescribe desde la aplicación.
- Datos originales y enriquecimientos privados permanecen separados.
- Traspasos internos, duplicados y ahorro se excluyen según contratos financieros validados.
- Ediciones, splits, reglas, conciliación, automatizaciones y cierres son trazables y reversibles cuando corresponde.
- Acceso privado mediante Google OAuth y allowlist de servidor.
