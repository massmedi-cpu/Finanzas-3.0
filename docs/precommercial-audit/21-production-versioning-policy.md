# 21 · Política de versionado de Production

## Regla permanente

Financial App usa versionado incremental para cada estado mejorado que llegue realmente a Production.

- Production actual parte de `10.0.0`.
- La próxima promoción que introduzca una mejora real será `10.0.1`.
- Las siguientes promociones mejoradas avanzarán de forma monotónica: `10.0.2`, `10.0.3`, etc.
- Un Preview, un commit de auditoría, una ejecución de CI o un despliegue que no sea Production **no** cambia la versión comercial.
- No se reutiliza la misma versión para dos estados materialmente distintos de Production.

## Qué cuenta como mejora de Production

Cualquier promoción que cambie Production para incorporar una mejora funcional, visual, de UX, accesibilidad, seguridad, rendimiento, fiabilidad, compatibilidad, datos o corrección de defecto incrementa PATCH.

Un rollback que restaura exactamente un artefacto/versionado anterior no inventa una versión nueva; vuelve al identificador del artefacto restaurado. Un hotfix nuevo sí es una mejora nueva y, por tanto, incrementa PATCH.

## Gate obligatorio de release

El incremento de versión forma parte del mismo release que se promociona y debe quedar coherente, como mínimo, en:

- `package.json` y `package-lock.json`;
- metadata de build expuesta por `/api/build`;
- constantes o metadata de producto que muestren la versión;
- evidencia del release/deployment y SHA exacto;
- diagrama canónico de Google Drive.

Antes de declarar una nueva versión en Production se exige:

1. gates del bloque afectado verdes;
2. regresión aplicable verde;
3. Preview del SHA exacto validado;
4. bump PATCH coherente en el release candidate;
5. promoción a Production;
6. comprobación posterior de `/api/build`, versión, SHA, autenticación y smoke tests esenciales;
7. actualización del diagrama y trazabilidad del PR/release.

## Principio

La versión identifica un estado verificable de Production. Nunca se incrementa para aparentar avance y nunca se mantiene congelada cuando Production ha mejorado realmente.
