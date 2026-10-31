# OCR: atribución del total de IVA e IGIC

Bloque del 20/10/2026, continuación de PR #619 sobre
`f689263969c35a7fa211343fab374c7069adfcea`. La candidata permanece en borrador;
este documento no acredita aceptación AP7 ni publicación.

## Defecto reproducido

El intérprete reconoce IVA, I.V.A., IGIC e I.G.I.C. como impuestos, pero la
exclusión de subtotales del campo total solo reconocía IVA sin puntos.
Con confianza OCR 0,99, `TOTAL I.V.A. 2,10` y `TOTAL IGIC 2,10` devolvían
210 céntimos como total fiable, aunque solo existía una cuota fiscal.
`TOTAL I.V.A. 2,10 TOTAL 12,10` también escogía 210 en vez de 1.210 céntimos.
Son ejemplos sintéticos independientes de documentos privados.

## Corrección y controles

- La exclusión de etiquetas fiscales del total acepta las mismas formas
  puntuadas de IVA e IGIC que el intérprete fiscal, también después de «DE».
- Solo se enmascara la etiqueta; un TOTAL o IMPORTE TOTAL posterior conserva
  su atribución y el texto OCR original no cambia.
- Los impuestos siguen disponibles en su campo propio. Se mantienen signo,
  céntimos, confianza, geometría y procedencia.
- Un total en una línea adyacente continúa como dudoso y conserva ambas
  evidencias; este cambio no promueve inferencias a hechos fiables.
- No se modifican cuentas, movimientos, sincronización, originales,
  migraciones, versión ni contratos de confirmación humana.

Regresiones `REC-OCR-197` y `REC-OCR-198`: etiquetas con/sin puntos,
IVA/IGIC, prefijo DE, cuotas positivas/negativas, total ordinario/expreso,
importe en línea adyacente, procedencia e inmutabilidad del resultado original.
El script de selección de importes añade seis casos independientes.

## Validación local

| Comprobación | Resultado y alcance |
| --- | --- |
| Script de importes antes de la corrección | 75/79 PASS, cuatro fallos reproducidos con el código anterior |
| Script de importes después | 79/79 PASS |
| Suite completa de interpretación | 216/216 PASS bajo las dos configuraciones de Playwright; son pruebas de dominio sin fixture de navegador |
| `npm run typecheck` | PASS |
| `npm run build`, incluido postbuild acumulativo | PASS |
| Rasterización PDF en Node | PASS |
| Política de orientación OCR | 9/9 PASS |
| Motor Tesseract español y PDFs sintéticos | PASS; variantes financieras 3/3, sin acceso a reserva privada |
| Guard de ejecución de suites visuales | PASS; es un contrato de configuración, no inspección visual |
| Sintaxis del script y `git diff --check` | PASS |

La instalación local de Chromium falló: el servidor de descarga devolvió un
archivo ZIP inválido/truncado. La matriz visual local queda NO VERIFICADA;
la CI obligatoria del nuevo SHA debe ejecutar navegador y regresiones.
No existe un script `lint` en package.json; no se atribuye una ejecución ficticia.

La comprobación histórica `verify-next-security-10.0.71.mjs`, invocada además
de los gates actuales, abortó porque exige literalmente versión 10.0.71 y el
proyecto declara 10.0.103. No se cambió esa comprobación histórica ni se
presenta como PASS; los guards actuales del build sí se completaron.

## Estado de entrega

La CI inicial del padre fue consultada: 87 workflows terminales,
86 SUCCESS y un backup histórico SKIPPED. Estos resultados no certifican
el commit nuevo. Consultar Actions por el SHA que contiene este documento,
conservar los fallos/reintentos y revisar sus resultados terminales.

Producción comprobada al inicio: `financialapp-home.vercel.app`, 10.0.103,
commit `6dad59c6c2db3575618a7c91c49c3060a93bbba1`, deployment
`dpl_34WhAcvVpP6YrdbxAckDgm3TWwz5`, READY y target production.
Este bloque no la sustituye. AP1–AP8 conservan sus pendientes: respaldo
actual y restauración segregada, dos identidades cloud de ensayo, validación
privada OCR heterogénea, sincronización segura y aceptación/publicación final.

## Seguimiento: entrada reproducible del smoke Tesseract

El commit de corrección `62f2b897f82133f542cca6508b0b13a988184cad`
repitió el fallo de reconocimiento de `larger receipt` en el run
[39378580020](https://github.com/massmedi-cpu/Finanzas-3.0/actions/runs/39378580020),
jobs `118482177745` y `118483292648`. Falló la igualdad de céntimos; después,
la regresión integrada no pudo arrancar porque el build previo quedó omitido.
Un reintento no explicó ni resolvió el problema. No se atribuye este fallo al
cambio de etiquetas: sucede antes de la compilación y de esas pruebas.

El generador pedía Arial sin comprobar su disponibilidad, con fallback
silencioso del sistema y sin conservar la imagen o el texto del fallo. Se
registra ahora una familia exclusiva desde `Geist-Regular.ttf`, incluida en
la dependencia Next fijada en el lockfile; el smoke aborta si no carga. Se
comprueba que el texto cabe en el raster y se registran hashes de fuente e
imagen. Si falla una variante, el artefacto existente de CI conserva PNG,
oráculo y texto reconocido, todos generados sintéticamente por el propio test.
Se mantienen las mismas etiquetas y cantidades esperadas, incluidos 124,90 €;
no hay reintentos dentro del smoke ni tolerancia nueva de dígitos.

Dos procesos locales, con fuentes de sistema habilitadas y deshabilitadas,
completaron todos los casos y 3/3 variantes; produjeron estos mismos hashes:

| Entrada fijada | SHA-256 |
| --- | --- |
| Fuente | bde046ddd9f20be35b0bd56cc79eb752b967fb6661a3fe76cb067bb09f871d76 |
| small receipt | 4601390aac86f50326f2cb77f5d88577507eb508ea682c575c0f83b1e6d71ff2 |
| invoice amount | dbcb217771a4d22b1fb3d3d153a03b1826eda6e95fab56cecc1053eafef3d193 |
| larger receipt | 7e6801a0d988983aeca2cf974f8314e348dbc6c140704fdffa0cbea2c79fbc50 |

Esto elimina la dependencia de Arial del host en el generador. No demuestra
por sí solo que el fallback fuera la única causa del fallo previo, ni mejora
la precisión sobre documentos reales. La nueva CI debe comprobar el SHA y
contrastar estos hashes antes de afirmar una entrada reproducible en CI.
