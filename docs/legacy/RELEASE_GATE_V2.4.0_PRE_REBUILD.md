# Release gate — V2.4.0

> Documento histórico previo al rebuild actual. No describe Financial App 2.4.0 vigente.

## Estado histórico

Desarrollo funcional: PASS. Release/producción: pendiente en aquella arquitectura.

## Alcance histórico

Aquel V2.4 implementaba un motor de horizonte de 1–60 meses, eventos planificados, calendario financiero y resúmenes anuales. Formaba parte de una arquitectura anterior y su evidencia CI, previews, healthchecks y referencias a snapshots no son especificaciones del rebuild actual.

## Garantías que se conservan como intención

- No modificar la fuente bancaria original.
- Mantener regresiones financieras en verde.
- No promocionar una versión sin gates completos.
- Mantener rollback y despliegue controlado.

El rebuild actual redefine 2.4 con un horizonte 3/6/12 de capacidad y mantiene las previsiones bancarias y patrimoniales limitadas a 90 días para no inventar cifras sin eventos canónicos suficientes.
