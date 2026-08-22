# Financial App 2.0.0 — Plan Financiero unificado

## Objetivo

La 2.0.0 convierte las capacidades ya validadas de control, presupuesto y planificación en una única capa de decisión. No sustituye a los módulos operativos: los resume, explica sus conclusiones y dirige al usuario al dato original que debe corregirse o gestionarse.

## Principio de diseño

2.0 no introduce un score opaco ni una segunda lógica financiera. El Plan reutiliza exclusivamente las cinco funciones canónicas existentes:

- `budget_overview_core`
- `forecast_overview_core`
- `goals_overview_core`
- `net_worth_overview_core`
- `control_center_core`

El navegador/Next.js realiza una sola llamada a `financial_app_plan_overview`. La agregación y las reglas de prioridad viven en PostgreSQL para evitar divergencias entre pantallas.

## Resumen unificado

El Plan presenta de forma conjunta:

- ingresos, gastos y resultado del mes;
- presupuesto asignado, gastado, disponible y proyección de cierre;
- saldo actual, saldo previsto, mínimo y flujo neto confirmado a 90 días;
- patrimonio y patrimonio proyectado a 90 días;
- esfuerzo mensual requerido por objetivos;
- capacidad mensual de referencia y margen posterior a objetivos.

## Prioridades explicables

Las acciones se construyen con reglas deterministas y cada una incluye:

- severidad;
- dominio de origen;
- título y explicación;
- valor asociado cuando existe;
- enlace directo al módulo operativo;
- `sourcePath` que identifica la métrica exacta de la que procede.

Se priorizan, entre otros, duplicados, riesgo de saldo negativo, movimientos por revisar, proyección de presupuesto excedida, objetivos vencidos o sin fuente, capacidad conjunta de objetivos, gasto sin presupuesto, cobertura incompleta de patrimonio y avisos de cierre.

## Seguridad y no automatización

- `financial_app_plan_overview` exige la misma identidad autorizada que el resto de Financial App.
- El wrapper público revoca ejecución para `public` y `anon`.
- Solo `authenticated` y `service_role` pueden ejecutar el RPC.
- El Plan declara `readOnlyDecisionLayer: true` y `noAutomaticFinancialMutations: true`.
- No modifica movimientos, presupuestos, objetivos, patrimonio, reglas o cierres.
- Las sugerencias automáticas de previsión continúan sin afectar al saldo proyectado mientras no sean confirmadas.

La función de previsión reutilizada puede refrescar sus ocurrencias derivadas, igual que la pantalla Previsión existente; esto no cambia decisiones financieras del usuario ni la fuente bancaria.

## UX

- Nueva ruta `/plan`.
- Plan aparece inmediatamente después de Inicio en escritorio.
- En móvil pasa a las cuatro entradas principales junto con Inicio, Movimientos y Control.
- Selector mensual server-side, sin estado paralelo en cliente.
- Diseño responsive y accesible, con jerarquía de estado, KPIs, capacidad, acciones y detalle de dominios.
- Se evita añadir gráficas sin función operativa.

## Validación de base real

El RPC fue ejecutado con la identidad autorizada dentro de una transacción exterior finalizada con `ROLLBACK`. Devolvió versión, mes, estado, resumen, dominios, reglas y prioridades coherentes sin dejar datos de prueba.

## Protección contra regresiones

`audit:v20` exige:

- versión 2.x o posterior;
- una sola llamada RPC desde la capa Plan;
- ausencia de llamadas directas paralelas a los cinco módulos;
- presencia de trazabilidad `sourcePath`;
- reutilización de los cinco motores canónicos en SQL;
- allowlist y permisos correctos;
- garantías no destructivas;
- navegación desktop/móvil;
- layout responsive;
- coherencia entre `package.json` y `package-lock.json`.

## Recursos y despliegue

La rama `financial-app-rebuild` continúa sin previews automáticos de Vercel. 2.0 se valida mediante base real, auditorías, typecheck y build antes de decidir un único preview visual de checkpoint.
