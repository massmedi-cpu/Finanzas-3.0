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

## Candidato V8

Código OCR funcional previo a este commit: `4840aa637ecbb9c2a78e6704306e5abd9227994b`.

Cambios principales de V8:

- la ruta de imágenes usa el proveedor `ReceiptUpscaledCellConsensusImageOcrProvider`;
- cada celda numérica sospechosa se recorta de forma focalizada y se amplía físicamente hasta una altura objetivo de al menos 180 px antes de Tesseract;
- cada celda se somete a tres variantes de preprocesado independientes;
- una cifra monetaria solo se acepta cuando existe consenso estricto de al menos 2 de 3 observaciones válidas;
- el consenso usa tanto texto OCR directo como geometría TSV para recomponer únicamente decimales explícitos;
- un entero ambiguo como `560` no se convierte por heurística en `5,60`;
- se mantienen los estados de revisión obligatoria cuando la geometría o la lectura no son suficientemente fiables.

## Evidencia automatizada V8

Sobre `4840aa637ecbb9c2a78e6704306e5abd9227994b`:

- deployment exacto Vercel `dpl_4cBWBfGtnVdTG5mSn9qoh1m8otMx`: READY;
- Rebuild Preview E2E `34722377445`: SUCCESS;
- `browser-interaction-e2e`: SUCCESS;
- Gate 4 Protected Workspace Boundary `34722377418`: SUCCESS;
- PRE-020 Storage Runtime Rehearsal `34722377436`: SUCCESS;
- PRE-020 Disposable DB Smoke `34722377431`: SUCCESS;
- CR-001 Function Surface Postflight `34722377423`: SUCCESS;
- CR-001 Deletion Self-Service Postflight `34722377492`: SUCCESS.

Este commit solicita además la validación live del Preview protegido mediante el marcador `[vercel-preview]` sin modificar el código OCR ya certificado localmente. Production y `main` permanecen fuera de esta prueba.

## Resultado real anterior que mantiene el blocker

V7 queda descartada tras replay real del 13/09/2026: confianza global 62 %, TERCIO GALICIA CERO sin importe, CAÑA GRANDE con `5,00` en lugar de `5,60`, CUBATA sin importe e IVA/Total ausentes. Por tanto CR-008 no puede cerrarse con evidencia sintética ni con CI verde por sí sola.

## Límite de automatización

El archivo real está en un bucket privado y su acceso está ligado al workspace del propietario. No se debe introducir un bypass, una excepción de tenancy ni una credencial permanente solo para automatizar esta comprobación. Si el replay exacto no puede realizarse con la frontera de seguridad vigente, la última ejecución deberá hacerse desde una sesión legítima del propietario en Preview.
