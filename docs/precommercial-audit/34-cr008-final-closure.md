# 34 · CR-008 — QA final y decisión de cierre

Fecha: 2026-09-12 (Europe/Madrid)

## Alcance

CR-008 reevalúa Financial App después de cerrar los gates de readiness 1–7 o dejarlos formalmente fuera de alcance con evidencia. El objetivo es distinguir con precisión entre:

1. aptitud técnica del producto que realmente existe hoy: aplicación privada y monousuario;
2. aptitud para una hipotética salida comercial pública a terceros.

Este documento no reescribe los informes históricos `31-final-qa.md` ni `32-commercial-decision.md`; registra la situación posterior a los cierres CR-001…CR-007 y a la decisión expresa del propietario de omitir la beta humana.

## Candidato técnico previo al sello documental

Checkpoint técnico certificado previo: `5a2972fcd43de8ad97a87ffaee17c2fc8f4c96d7`.

Evidencia exacta comprobada sobre ese SHA:

- Rebuild Preview E2E `34697020223`: SUCCESS.
  - `browser-interaction-e2e`: SUCCESS.
  - `protected-preview-live`: SUCCESS.
- PRE-020 Disposable DB Smoke `34697020234`: SUCCESS.
- PRE-020 Storage Runtime Rehearsal `34697020255`: SUCCESS.
- CR-001 Deletion Self-Service Postflight: SUCCESS.
- CR-001 Function Surface Postflight: SUCCESS.
- Gate 4 Protected Workspace Boundary: SUCCESS.
- Vercel Preview `dpl_4qSLp3p2vuuGG42k4ejCzxpyppix`: READY, con `githubCommitSha` exactamente `5a2972fcd43de8ad97a87ffaee17c2fc8f4c96d7`.
- Production/main: no modificados por CR-008.

El protocolo de `31-final-qa.md` exige que el propio commit documental de cierre vuelva a superar DB Smoke, Storage Runtime, browser E2E, protected Preview y Vercel READY con SHA exacto. Por tanto, este documento sólo se considerará sellado cuando su propio SHA complete esos gates; la evidencia final se registra fuera del commit, en el Google Sheet canónico, evitando circularidad.

## Evolución respecto al veredicto histórico

El informe `32-commercial-decision.md` de 2026-09-10 enumeraba ocho bloqueos. La situación actual es distinta:

### 1. Borrado self-service

CERRADO POR ALCANCE MONOUSUARIO. Financial App no ofrece borrado self-service como función del producto. El executor destructivo permanece desactivado/fail-closed y fuera de la UI. No debe interpretarse como una función disponible.

### 2. Retención y recibo post-borrado

CERRADO POR FUERA DE ALCANCE. Al no existir borrado de cuenta como función del producto monousuario actual, no se publica una política comercial ficticia de retención/recibo.

### 3. Privacidad y condiciones

CR-003 COMPLETADO. La superficie visible se basa en hechos técnicos verificables. No se inventan condiciones legales/comerciales para un servicio público que actualmente no existe.

### 4. Soporte y estado del servicio

CR-004 COMPLETADO. Existe capacidad interna de diagnóstico y operación para el uso actual, sin fingir SLA ni página pública de estado.

### 5. Net Worth / patrimonio

CR-005 CERRADO POR ALCANCE. No se anuncia Net Worth mientras no exista un modelo explícito y trazable de activos, pasivos y valoración. El saldo agregado no se presenta como patrimonio neto.

### 6. Validación humana

OMITIDA POR DECISIÓN EXPRESA DEL PROPIETARIO el 12/09/2026. Las filas B01–B08, H01–H08 y A01–A06 no se marcan PASS: permanecen documentadas como `OMITIDA`.

La amplia cobertura automática/simulada es evidencia técnica complementaria y no se presenta como prueba humana de usabilidad o accesibilidad.

### 7. Medición operativa

CR-007 COMPLETADO con RUM real autenticada. Las muestras limpias de Inicio cumplieron los presupuestos fijados: FCP/LCP aproximadamente 444–448 ms, TTFB aproximadamente 44–46 ms, CLS 0,0073 e INP 0–40 ms.

### 8. Controles dependientes de una plataforma comercial futura

No se convierten en deuda del producto privado actual. Rate limiting público, compromisos de servicio, operación multiusuario, procesos contractuales y demás controles propios de un SaaS deben reabrirse si cambia el alcance hacia venta pública/multiusuario. No se declaran implementados cuando no forman parte del producto actual.

## Calidad del candidato actual

La rama candidata conserva y amplía la evidencia previa de arquitectura, coherencia financiera, seguridad fail-closed, responsive, accesibilidad automatizada, UI/UX y calidad percibida.

Además, durante CR-006 quedaron cerradas de forma acumulativa tres deudas de pulido:

- D-01: tipografía Inter determinista mediante `next/font` y gate específico de fuente efectiva + overflow.
- D-02: iconos y colores de Configuración muestran etiquetas humanas preservando claves internas.
- D-03: Documentos y Movimientos usan el formateador monetario regional central manteniendo semántica interna en céntimos.

No se detecta una razón técnica documentada para seguir modificando el producto por intuición antes del sello CR-008.

## Veredicto CR-008

# APTA CON CONDICIONES PARA EL ALCANCE ACTUAL PRIVADO Y MONOUSUARIO

Financial App alcanza aptitud técnica para su uso privado/controlado dentro del alcance realmente implementado, sujeto a las siguientes condiciones de interpretación:

- no se afirma que exista beta humana ni certificación humana de accesibilidad;
- no se ofrece borrado self-service;
- no se ofrece ni anuncia Net Worth/patrimonio;
- no se presentan SLA, soporte comercial ni condiciones de servicio público inexistentes;
- no se interpreta la arquitectura actual como autorización automática para SaaS/multiusuario;
- `main` y Production no se promocionan desde PR #328 sin aprobación expresa.

## Veredicto ante una hipotética salida comercial pública

# NO APTA PARA SALIDA COMERCIAL PÚBLICA EN EL ALCANCE ACTUAL

Esta segunda conclusión no deriva de una regresión técnica del candidato. Deriva de que varios requisitos propios de vender a terceros —en particular validación humana deliberadamente omitida y obligaciones operativas/contractuales de un servicio público— están fuera del alcance actual y no deben fingirse como satisfechos.

Si en el futuro se decide comercializar Financial App públicamente, deberán reabrirse específicamente esos requisitos sin invalidar la base técnica ya certificada.

## Regla de cierre documental

El 100 % de la auditoría/readiness roadmap significará **trabajo de auditoría y decisión ejecutados**, no “100 % de aptitud para vender públicamente”.

CR-008 sólo pasa a `Completada` en el Google Sheet canónico cuando el SHA que contiene este documento supera el protocolo exacto de `31-final-qa.md` y existe Preview Vercel READY asociado al mismo SHA.

Production y `main` permanecen intactos hasta aprobación expresa.