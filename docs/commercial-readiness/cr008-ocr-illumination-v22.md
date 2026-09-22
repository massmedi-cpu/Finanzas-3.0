# CR-008 · OCR V22 · iluminación y recuperación por celdas

Estado: candidato de Preview; CR-008 sigue abierta.

El replay local de V21 reproducía pérdidas de importes, mezcla entre columnas y
caracteres falsos en los pliegues del papel. V22 estima la iluminación del papel
antes de recortar, conserva la proporción de los caracteres y contrasta dos
preprocesados con tres segmentaciones. Las observaciones de baja confianza no
pueden imponerse por repetición. La recuperación exige evidencia de los píxeles;
no reconstruye decimales ni calcula importes a partir de otros valores.

Las cajas recuperadas corresponden a los glifos detectados. Los resúmenes reservan
todo el espacio posterior a su etiqueta para no cortar cifras grandes. Las
descripciones se contrastan por región y los fragmentos inciertos se releen en
su propio recorte. El filtrado por cabecera vuelve a agrupar las filas dentro del
papel y evita incorporar una última fila de fondo distante.

## Evidencia local del 15 de septiembre de 2026

- 45 pruebas OCR correctas, incluyendo Tesseract nativo, columnas separadas,
  fondo fotografiado, sombras, totales grandes y conservación de evidencia.
- Compilación Next.js y TypeScript correcta antes y después de integrar el nuevo Inicio.
- Replay con la copia privada de 1542 × 2048, 700.330 bytes: cinco descripciones
  de producto y los ocho importes de líneas/resumen recuperados; 10,204 s en la
  última ejecución. El trazo falso junto a una descripción ya no aparece.
- Persisten errores y residuos en los metadatos y el pie. Este resultado no
  acredita todavía una transcripción completa y fiel.
- La copia local no equivale al objeto privado persistido de 2.258.072 bytes.
  Falta el replay de ese objeto desde una sesión legítima en la Preview exacta.

Se incorpora `main` 28719715ffd77c419528450b3973146f81f48acf conservando su nuevo
Inicio y los cambios acumulados. Los tests de interfaz se adaptan a la retirada
ya realizada de la revisión manual, a los textos actuales y a una fusión de
categorías válida con confirmación explícita. Las pruebas conservan los límites
de accesibilidad y de escrituras personales, sin reintroducir controles retirados.

La batería general anterior (34923993369) terminó con 582 passed, 109 skipped y
17 failed. La nueva batería y el gate de Preview deben verificarse sobre el nuevo
SHA. El navegador de Playwright no está instalado en este entorno local; la
validación interactiva debe ejecutarse en CI con su Chromium declarado.

La primera batería V22 (34966962686, SHA 7a06a561) terminó con **677 passed,
109 skipped y 2 failed**. Los únicos fallos corresponden a la misma casilla de
selección de Movimientos en escritorio y móvil: su área interactiva mide 18,39 px.
El gate `protected-preview-live` pasó sobre ese SHA y la Preview está READY.
La corrección añade una etiqueta pulsable de 44 × 44 px manteniendo el glifo
nativo compacto. Las pruebas miden el área asociada a la casilla, esperan a que
la fila cargue y pulsan el margen exterior del glifo para verificar su efecto.
El nuevo build es correcto; se requiere repetir el gate global sobre el commit
que contiene esta corrección.

La fuente bancaria continúa en solo lectura. OCR sigue aislado con
`financialWrites: false` y `requiresHumanReview: true`. No fusionar ni promover a
Production hasta pasar los gates automáticos y el replay real autenticado.
La fotografía y los resultados privados no se incluyen en el repositorio.


## 20/09/2026 · Rebase seguro sobre Production actual

V22 se ha reconstruido sobre `main` `b829adb07e00e46bb73e893b87e2b60a55d87315` en PR #367. La comparación contra el merge-base anterior confirma que 33/34 archivos de V22 no habían cambiado en `main`; el único solapamiento real era `app/transactions/transactions-client.tsx`, integrado conservando la versión actual y aplicando sólo el hit-area de selección de 44 px. Este commit solicita una única Preview Vercel exacta del candidato actualizado. No autoriza merge ni Production: siguen siendo obligatorios CI verde y replay autenticado del documento canónico.


## Preview candidate checkpoint · 22/09/2026

Functional tree frozen at `a1b781a67836a35403d7bb9ff225b59b9ff2a390`.

Validated before requesting Preview:
- UX 15 User Value run `35687649075`: SUCCESS.
- TypeScript: SUCCESS.
- Production build: SUCCESS.
- Playwright desktop/mobile: 130 passed / 4 skipped / 0 failed.
- OCR base worker terminates before queue handoff.
- V22 padded worker terminates before queue handoff.
- Whole image OCR pipeline serialized per process.
- OCR timeouts do not start overlapping recognitions on a timed-out worker.
- Full-image illumination variants are prepared sequentially and reuse the decoded grayscale buffer.
- Financial source remains read-only; `financialWrites=false`; `requiresHumanReview=true`.

This documentation-only commit requests the exact Vercel Preview. Runtime code is unchanged from the frozen functional tree.

## Retry exact Preview · 22/09/2026

The previous documentation-only Preview request reached Vercel while the Hobby build-rate limit was active and produced no new deployment. This retry changes documentation only and requests one exact Preview of the same frozen runtime tree `a1b781a67836a35403d7bb9ff225b59b9ff2a390`. Production remains untouched until the authenticated canonical-ticket replay and runtime log checks pass.
