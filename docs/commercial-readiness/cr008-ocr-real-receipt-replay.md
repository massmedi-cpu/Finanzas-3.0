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

## Tercer candidato

SHA previo a este commit: `b66d1ff242304f06c39bb5a63dde0aa680c5cd36`.

Cambios principales:

- las filas de producto y resumen tienen prioridad frente a ruido e identificadores de cabecera;
- el límite de refinado ya no se consume simplemente con las primeras filas sospechosas por posición vertical;
- un decimal partido solo se recompone cuando la puntuación decimal aparece explícitamente en la lectura aislada (`2` + `,` + `80`, por ejemplo);
- no se transforma un entero ambiguo como `560` en `5,60` por heurística;
- se mantienen los estados de baja confianza / geometría por revisar para evitar falsos éxitos.

## Evidencia automatizada previa

Sobre `b66d1ff242304f06c39bb5a63dde0aa680c5cd36`:

- Rebuild Preview E2E `34713541588`: SUCCESS.
- Gate 4 Protected Workspace Boundary `34713541610`: SUCCESS.
- PRE-020 Storage Runtime Rehearsal `34713541616`: SUCCESS.
- PRE-020 Disposable DB Smoke `34713541598`: SUCCESS.
- CR-001 Function Surface Postflight `34713541608`: SUCCESS.
- CR-001 Deletion Self-Service Postflight `34713541586`: SUCCESS.

Este commit solicita además la validación live del Preview protegido mediante el marcador `[vercel-preview]`. Production y `main` permanecen fuera de esta prueba.

## Límite de automatización

El archivo real está en un bucket privado y su acceso está ligado al workspace del propietario. No se debe introducir un bypass, una excepción de tenancy ni una credencial permanente solo para automatizar esta comprobación. Si el replay exacto no puede realizarse con la frontera de seguridad vigente, la última ejecución deberá hacerse desde una sesión legítima del propietario en Preview.
