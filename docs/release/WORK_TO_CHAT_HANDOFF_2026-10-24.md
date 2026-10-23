# Relevo Work → Chat para el objetivo 24/10/2026

Creado el 23/10/2026, Europe/Madrid. **NO-GO de publicación.** Continúa desde el commit que contiene este archivo y las entradas posteriores de Notion/Trello; no reinicies la auditoría.

## Rama y base

PR #619 DRAFT, `chat/integrated-b-e-c-visual-20261010`, base de este bloque `a6d19737ec38b1d6a03060e15d0e11103e242f28`. Sin merge ni force. El SHA resultante se registra en Notion/Trello y puede obtenerse del historial de este archivo. PR #620 no se fusiona.

## Cambio ejecutado

Se implementa el cierre COMPLETO de Documentos mediante `NEXT_PUBLIC_FINANCIAL_APP_LAUNCH_DOCUMENTS=deferred` durante el build, subordinando OCR y Drive. Desaparece de navegación/favoritos/búsqueda/Alertas/Para revisar y de los filtros documentales/OCR de Movimientos. El favorito previo vuelve a Para revisar. La página no se monta y las APIs documentales deniegan operaciones antes de datos o proveedores; OCR-review conserva primero la verificación de sesión/workspace. `/api/build.releaseFeatures` acredita los tres flags efectivos. No basta cambiar env tras compilar.

Inventario completo de 24 páginas físicas y 43 handlers/métodos, decisiones y acciones documentales: [RELEASE_SCOPE_2026-10-23.md](./RELEASE_SCOPE_2026-10-23.md). No se considera aceptado todo el producto por elaborar ese inventario.

Se corrige una omisión real: REC-REL-371–375 existían pero no estaban en la matriz principal. Ahora se ejecutan, junto a 379–382, y el guard exige su selección. El nuevo job `deferred-document-release` compila el corte y ejecuta 383–385; no se eliminan pruebas ni se rebajan umbrales.

## Pruebas locales observadas

- TypeScript de aplicación y de las dos suites nuevas: PASS. No existe script de lint separado en package.json.
- Build estándar + guards postbuild: PASS.
- 9 contratos de cierre: PASS (repetición final 9/9).
- Regresión estándar de 152 casos: INTERUMPIDA tras 100 resultados (99 PASS, un timeout móvil REC-ALT-007); 52 sin resultado. Hubo desconexión del entorno; no es una matriz verde.
- Repetición aislada de REC-ALT-007 y Para revisar en escritorio/móvil: 6/6 PASS. No borra el resultado anterior ni sustituye la matriz completa.
- Primer build reducido falló por caché Turbopack ilegible tras la desconexión. Se conservó la caché aparte y se recompiló limpiamente: build reducido + postbuild PASS.
- Build optimizado reducido: 10/10 PASS, sin reintentos, incluyendo denegación de 12 accesos API, dos accesos anónimos OCR-review, página profunda, favoritos antiguos, respuesta de búsqueda antigua y ausencia de lecturas documentales.
- 360/390/768/1440, claro/oscuro: 24 capturas sintéticas. Se inspeccionaron manualmente cuatro capturas representativas de los cuatro anchos. Estados de error deliberados; NO certifican datos reales ni QA completa del núcleo.
- Diff/check de secretos por patrones: sin coincidencias. Producción y fuentes no se escribieron.

La CI del NUEVO SHA y su preview deben verificarse independientemente. No heredar el verde de 9728a9c3 ni considerar CI anterior como aprobación del bloque. La CI de la base a6d19737 tenía un fallo Protected Preview, aún sin preview exacta, y otras ejecuciones pendientes.

## Estado real de producción y datos

`https://financialapp-home.vercel.app/api/build` devuelve 10.0.103, SHA `6dad59c6c2db3575618a7c91c49c3060a93bbba1`, deployment `dpl_34WhAcvVpP6YrdbxAckDgm3TWwz5`, production. Sin sustitución de producción.

Fuente oficial leída por ID, exclusivamente lectura: 3.208 IDs (3.191 corriente + 17 ahorro), cero IDs duplicados por pestaña. DB read-only: 3.188 movimientos y 3.188 fuentes, 32/32 tablas financieras con RLS, cero buckets públicos. Gateway Edge real ACTIVE v86. Persisten diferencia de 20 filas y la Fecha representacional ya diagnosticada; NO se sincronizó ni se reescribieron originales.

AP1 sigue sin certificación; el módulo documental queda aplazado en el perfil reducido. Su reactivación exige original inmutable y Storage probados, no solo cambiar un flag. AP2 cloud no acreditada. OCR G5 17+8 sin GOLD final, diferido. No se crearon proyectos ni costes. No se renovó backup: evidencia histórica no es respaldo fresco de un release nuevo.

## Primera acción siguiente

Consultar SHA HEAD real de #619, la entrada superior de Notion y comentarios Trello. Verificar preview exacta y tres releaseFeatures=false, resultado terminal de la CI y del nuevo job. Después cerrar AP5: comparación estricta de las 22 columnas para la Fecha, sin ignorar hashes genéricamente ni reescribir 3.188 originales; gateway v3 compatible, backup fresco y prueba aislada antes de importar las 20 altas y postflight independiente. Resolver AP2 cloud, QA final autenticada y backup/restore/rollback antes de integrar/publicar. Ningún GO mientras quede un bloqueo P0/P1/P2 expuesto.
