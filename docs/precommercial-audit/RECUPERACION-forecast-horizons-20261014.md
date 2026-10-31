# Previsión: horizontes, contexto y verificación · 14/10/2026

Continúa [RECUPERACION-PRODUCTO-20261009](https://trello.com/c/g8rebZin) en la [PR #619](https://github.com/massmedi-cpu/Finanzas-3.0/pull/619), rama `chat/integrated-b-e-c-visual-20261010`. Es una corrección acumulativa en candidata; no una publicación ni el cierre de AP1–AP8.

## Base comprobada

La sesión parte de `cd4a01902bac6d16db7c9c263c0f06597b28231a`. Su CI terminó con 70 workflows SUCCESS, cinco FAILURE y uno SKIPPED. Las cinco ejecuciones fallidas corresponden a dos certificaciones de Previsión, UX 15 y dos matrices de recuperación; se revisaron sus logs, sin trasladar éxitos entre commits.

El dominio productivo `/api/build`, leído sin sesión financiera, confirma 10.0.103, commit `6dad59c6c2db3575618a7c91c49c3060a93bbba1`, deployment `dpl_34WhAcvVpP6YrdbxAckDgm3TWwz5`, `main`, `production` y `releaseDeployable=true`. Este bloque no modifica producción, base de datos, fuentes bancarias ni originales documentales.

## Cambios de producto y referencias

| Requisito del Axioma / recuperación | Problema reproducido | Comportamiento de la candidata | Evidencia |
| --- | --- | --- | --- |
| §§23, 54, 119, 129; AP1/AP5 | Los cuatro horizontes aceptaban un HTTP 200 de otra cuenta o estructura dañada. | Se valida el contrato, las fechas y la cuenta antes de mostrar dinero. La previsión detallada sigue disponible si falla únicamente la lectura anual. | REC-HORIZON-001/005/007; REC-FCAST-060/061 |
| §§54, 57, 129; AP1/AP2 | Cambiar fechas o guardar un pago podía dejar los horizontes con cifras antiguas. | Los horizontes pertenecen al estado vigente del calendario; un guardado verificado invalida la lectura anterior. Las respuestas obsoletas se abortan. | REC-HORIZON-002/003 |
| §§39, 54, 61; AP2 | Fechas cambiadas en pantalla no sobrevivían a recarga; los enlaces de contexto seguían usando el mes anterior. | URL, controles y enlaces compatibles conservan el periodo elegido. Se conserva la cuenta al ir a Movimientos y el horizonte completo al volver desde Recurrentes. | REC-HORIZON-008; falla sobre la build anterior y pasa en la candidata |
| §§29, 61; AP2 | Un contrato dañado dejaba una instrucción de reintento sin acción de lectura disponible. | «Reintentar lectura» y «Reintentar horizontes» ejecutan GET; no regeneran recurrencias ni crean pagos. | REC-HORIZON-001/007 |
| §§38, 107, 108; AP6 | Un periodo de doce meses solicitaba dos veces la misma previsión. | Se reutiliza la instantánea verificada cuando ya cubre los cuatro horizontes. | REC-HORIZON-004: dos GET antes, uno después, mismo caso sintético |
| §§62–71, 77–83, 95–106; AP3 | Etiquetas de confianza sobresalían de las tarjetas y comprimían fechas; oscuro heredaba fondos blancos con texto blanco. | Cabecera y confianza se apilan; columnas según espacio del contenedor; superficies, textos y estados usan tokens de ambos temas. La lectura principal precede a la navegación secundaria. | REC-HORIZON-006; capturas y axe sobre renderizado real |
| §§40–44; AP4 | «1 previsiones», «1 manuales», «1 previstos» y porcentajes sin formato compartido. | Plurales coherentes y contadores/porcentajes regionales compartidos. Dinero conserva sus dos decimales. | Inspección de capturas y regresión de tipografía existente |

Los importes de referencia de estas pruebas son sintéticos: 1.000,00 € de partida, 200,00 € previstos y saldo de 800,00 €. Tras añadir un pago de 25,00 €, detalle y horizonte anual muestran 775,00 €. No representan finanzas del propietario ni acreditan persistencia real en Supabase.

## Correcciones de certificación

- El fixture del regreso desde Recurrentes mantenía un pago sin cuenta dentro de una consulta filtrada por cuenta. Se corrige el universo simulado; la protección contra mezclar cuentas permanece activa.
- Dos fixtures antiguos omitían `updatedAt`, necesario para la edición concurrente; ahora aportan metadatos válidos. No se relajan las comprobaciones del contrato.
- La prueba de previsión vacía responde al periodo realmente solicitado, también en la consulta anual.
- Playwright serializaba una cadena de texto enviada con `data` como un valor JSON. La prueba de sintaxis dañada ahora envía bytes UTF-8, manteniendo la exigencia HTTP 400/`invalid_json`. Los casos de Comercio y Reglas usan el código preciso del lector JSON compartido y siguen comprobando que errores internos sean privados.
- La prueba de discrepancia de Cash Flow separa una envolvente aritméticamente válida que discrepa de sus partidas y otra que contradice sus propias sumas. En ambos casos el dinero previsto permanece oculto y el real verificado se conserva.
- Los validadores antiguos de diseño exigían Patrimonio, excluido por PRE-019. Protegen ahora los horizontes de Previsión, conservan la exclusión y refuerzan el mínimo tipográfico de ayudas a 0,875 rem. Se ejecutan explícitamente en la matriz moderna.
- Las suites nuevas están incluidas en los dos workflows de certificación correspondientes; no basta con crear archivos de tests.

## Validación local

Entorno: Node 24.19.0, Next 16.3.8, Chromium 153.0.8010.0, build optimizada; escritorio y emulación Pixel 7. Dependencias de producción y lockfile sin cambios.

- TypeScript, build y comprobaciones acumulativas de postbuild: PASS.
- Previsión completa: 152 casos aprobados, ocho omisiones de matrices que se ejecutan una sola vez, cero fallos y cero resultados intermitentes.
- Matriz transversal de rutas/Documentos y límites JSON: 401 aprobados, tres omisiones y dos fallos de la prueba JSON identificados; ambas causas se corrigieron y verificaron después.
- Correcciones de JSON, contratos API y Cash Flow, junto a horizontes: 79 aprobados, una omisión de matriz duplicada, cero fallos.
- Consolidación por archivo, título y proyecto: 590 casos distintos aprobados y diez omisiones; los reintentos y casos repetidos no se suman como pruebas adicionales. Esta cifra no acredita AP1–AP8 ni aceptación del propietario.
- Las 21 rutas de la matriz se renderizan en once anchos y dos temas con datos sintéticos/estados no disponibles. La ruta de Previsión se revalida después de conectar el contexto dinámico. Los documentos poblados tienen además revisión de editor y proceso OCR en ambos temas.
- Los horizontes se revisan en 360, 390, 768, 1024, 1100, 1280, 1366 y 1440 px, con capturas y comprobaciones de contraste en claro/oscuro. Esto es Chromium y emulación, no prueba física en Android/iOS ni certificación universal de accesibilidad.

## Capturas sintéticas conservadas

La referencia anterior y la candidata utilizan el mismo periodo, cuenta ficticia e importes. La captura anterior de 1280 px recoge el viewport; las siguientes incluyen el componente completo y otros anchos, por lo que no se presentan como una comparación idéntica píxel a píxel.

- [Antes · viewport claro 1280](evidence/20261014-forecast/before-light-1280.png).
- [Candidata · claro 1280](evidence/20261014-forecast/light-1280.png).
- [Candidata · claro 1440](evidence/20261014-forecast/light-1440.png).
- [Candidata · oscuro 1440](evidence/20261014-forecast/dark-1440.png).
- [Candidata · oscuro 390](evidence/20261014-forecast/dark-390.png).

## Puertas y continuidad

AP1–AP8 permanecen abiertas. Este bloque verifica un subconjunto de integridad, experiencia, lenguaje, gráficas y reducción de consultas; no certifica todo el producto.

Siguen pendientes la matriz completa del Axioma con evidencia por requisito, el recorrido autenticado de persistencia en backend realmente aislado, el corpus OCR heterogéneo y reservado con originales/transcripciones verificadas, la medición comparable de API/base y latencia real, y el cierre acumulativo con backup, reversión y postflight. Los tiempos sintéticos locales y la eliminación de un GET no demuestran por sí solos el presupuesto de rendimiento real.

La próxima acción es revisar los workflows del HEAD exacto de la PR, resolver cualquier fallo nuevo y avanzar sobre esas puertas con evidencia actual. El Gantt mantiene sus pesos y porcentajes históricos y la aceptación REABIERTA. No publicar ni fusionar esta candidata parcial.
