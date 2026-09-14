# CR-008 · Evidencia del caso OCR real

Estado: **abierto / blocker**.

## Caso de cierre

La corrección no se considera cerrada únicamente con pruebas sintéticas. El criterio final sigue siendo la misma fotografía real que reabrió CR008-OCR-002:

- Archivo: `PXL_20260821_220553447.jpg`
- Documento persistido: `33201a95-ac08-4c5f-935d-ef81800ab2ff`
- Fuente: almacenamiento privado de Financial App.

La comprobación final debe confirmar, sin correcciones inventadas ni residuos de fondo:

- ENERGY
- TERCIO GALICIA CERO
- CAÑA GRANDE
- CUBATA
- AGUA CON GAS
- importes 1,80 / 2,80 / 5,60 / 5,50 / 1,80
- base 15,91
- IVA 1,59
- total 17,50

Debe rechazar o marcar para revisión residuos como `560`, `280`, `2.800`, `5,508`, `1,008`, `505/60` o `50550` cuando no exista evidencia geométrica fiable.

## Resultado real que mantiene el blocker

V10 resolvió el fallo de memoria/500 y el replay real del 13/09/2026 terminó HTTP 200, pero la calidad siguió siendo insuficiente:

- confianza global: 64 %;
- contaminación de fondo/periferia visible en la reconstrucción;
- pérdida de separadores decimales en varias celdas monetarias;
- Base 15,91 reconocible, pero IVA/Total no suficientemente fiables;
- por tanto, V10 queda descartada como candidato de cierre.

El criterio sigue siendo conservador: un entero ambiguo como `560` no se transforma por heurística en `5,60`, ni se corrigen importes mediante aritmética del ticket.

## Candidato V11

Código candidato: `751d132618fcb232886ca1f9717efaab08fb7fc4`.

Cambios principales de V11:

- filtrado estructural del contenido periférico antes del OCR focalizado, sin añadir otro worker Tesseract;
- aislamiento de la región coherente con el ticket para reducir texto procedente del fondo de la fotografía;
- ampliación del margen físico de los crops monetarios para evitar recortar coma o punto decimal;
- preprocesado menos agresivo en celdas numéricas para preservar puntuación real;
- se mantiene la prohibición de inventar decimales, convertir bare digits o completar importes por consistencia aritmética;
- si no existe evidencia geométrica y visual suficiente, el documento permanece en revisión humana obligatoria.

## Evidencia automatizada V11

Sobre `751d132618fcb232886ca1f9717efaab08fb7fc4`:

- deployment exacto Vercel `dpl_8dwCYvzdYVv6nmsPy79CPEE8nQiM`: READY;
- Rebuild Preview E2E `34749811520`: SUCCESS;
- `browser-interaction-e2e`: SUCCESS;
- build de producción: SUCCESS;
- Playwright desktop y móvil: SUCCESS;
- Production y `main`: sin modificar.

Este commit documental usa el marcador `[vercel-preview]` únicamente para ejecutar la validación live del Preview protegido sobre el mismo código OCR V11 ya certificado localmente. No introduce cambios funcionales en OCR.

## Gate final pendiente

Si la validación live protegida también termina en verde, quedará una sola intervención humana imprescindible: repetir el análisis del documento real `PXL_20260821_220553447.jpg` desde una sesión legítima del propietario en el Preview exacto correspondiente.

Ese replay deberá confirmar:

- HTTP 200 sin OOM ni 5xx;
- ausencia de texto perteneciente al fondo de la foto;
- importes monetarios con separador decimal físicamente reconocido;
- Base 15,91;
- IVA 1,59;
- Total 17,50;
- ninguna corrección inventada para forzar coherencia.

Si cualquiera de esos puntos falla, CR-008 continúa abierto y la corrección debe seguir en la rama sin promover a `main` ni Production.

## Límite de automatización

El archivo real está en un bucket privado y su acceso está ligado al workspace del propietario. No se debe introducir un bypass, una excepción de tenancy ni una credencial permanente solo para automatizar esta comprobación. La última ejecución debe realizarse desde una sesión legítima del propietario en Preview si no puede ejercitarse respetando la frontera de seguridad vigente.

## Corrección de integridad de columnas · 13/09/2026

Sobre el candidato V12 `9cfb561d57cb383b85ef8b4b904a57eb0826ea87` se reprodujo un fallo independiente de la calidad del motor: Tesseract reconoce correctamente una tabla de cuatro columnas, pero `validateIsolation` considera la columna `IMPORTE` un componente horizontal de fondo y elimina sus valores, incluidos Base/IVA/Total.

La regresión nativa falló antes del cambio con `Received: []` para todos los tokens de esa columna. La corrección conserva componentes predominantemente numéricos que comparten al menos tres filas distintas con el texto seleccionado, antes de validar el recorte de fondo. No cambia palabras, coordenadas, confianza ni separadores, y conserva literalmente tokens ambiguos como `560`. Ante una columna numérica de procedencia ambigua se prioriza no destruir evidencia; no se certifica su validez financiera.

Evidencia local:

- `npm run test:ocr`: 56 pruebas, incluidas cuatro extracciones con Tesseract real y el proveedor base / composición de runtime, con y sin texto adyacente. Las imágenes se generan localmente con Sharp, sin navegador ni credenciales.
- Se comprueban por fila cantidad, precio e importe, así como Base 15,91, IVA 1,59 y Total 17,50. El texto de la hoja adyacente sigue excluido.
- `npm run typecheck`: correcto.
- `npm run build`: correcto; el postbuild de runtime Vercel se omite por tratarse de un build local.
- Sin cambios de UI, autenticación, persistencia ni fuentes bancarias. Sin importes calculados o inventados; revisión humana obligatoria.

Esta evidencia sintética no cierra CR008-OCR-002 ni sustituye el replay del archivo real. No se promueve `main` ni Production. La verificación de navegador local sigue pendiente porque los binarios no pudieron descargarse en este entorno.
