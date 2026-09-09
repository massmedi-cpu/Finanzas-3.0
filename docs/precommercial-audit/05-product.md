# 05 · Auditoría de producto

## Estado de producto

Decisión de partida fijada por producto/propietario: **NO APTA PARA SALIDA COMERCIAL**.

Esta fase no intenta discutir esa decisión. Su objetivo es identificar qué impide que Financial App deje de estar en ese estado y qué debe conservarse.

## Propuesta de valor actual

La aplicación sí tiene una dirección de producto reconocible:

> **“Tu dinero, claro en segundos.”**

Inicio intenta condensar saldo, balance mensual, evolución, presupuesto, próximos 30 días y actividad reciente sin recalcular fuera de los motores centrales. La filosofía aprobada sigue siendo válida:

- Inicio = decisión rápida.
- Movimientos = gestión.
- Análisis = comprensión.
- Presupuestos = control.
- Previsión = futuro.
- Cuentas = origen del dinero.
- Documentos = soporte documental.
- Configuración = administración.

La auditoría confirma que esta filosofía es mejor que añadir más paneles indiscriminadamente. El problema es que **la implementación de producto todavía no representa completamente esa arquitectura**.

## Benchmark conceptual actual · septiembre de 2026

Se han revisado patrones funcionales actuales de productos consolidados, sin copiar diseño:

- **YNAB**: conexión bancaria, planificación/presupuesto como núcleo y una superficie separada de reflexión/análisis de ingresos vs gasto y evolución.
- **Copilot Money**: onboarding guiado, revisión de transacciones nuevas, cash flow separado, recurrencias, presupuestos, net worth, alertas y automatización progresiva basada en historial.
- **Rocket Money**: agregación de cuentas, seguimiento de gasto, presupuestos, alertas de saldo/gasto, suscripciones, patrimonio y automatizaciones orientadas a ahorro.

Patrón común útil: un producto premium no sólo muestra datos; organiza el ciclo **capturar → revisar → comprender → decidir → anticipar → actuar**.

Fuentes oficiales consultadas:
- https://www.ynab.com/features
- https://help.copilot.money/en/articles/11157550-quick-start-guide
- https://www.copilot.money/faq
- https://help.copilot.money/en/articles/9682232-cash-flow-tab-overview
- https://www.rocketmoney.com/
- https://www.rocketmoney.com/faq

## Fortalezas verificadas

1. **Inicio tiene propósito.** No es una página genérica de métricas: prioriza situación actual, mes, presupuesto, previsión y actividad.
2. **Presupuestos explicables.** Distinguen límite automático (media histórica) de override manual y no alteran movimientos bancarios.
3. **Recurrentes conservador y auditable.** Detecta patrones, expone confianza y no persiste automáticamente sin decisión explícita.
4. **Previsión está más avanzada que un simple calendario.** Combina recurrencias, presupuesto, manuales, reconciliación y saldo proyectado.
5. **Cuentas distingue saldo bancario explícito de reconstruido.** Eso es una señal de producto financiero serio.
6. **Fuente bancaria tiene preflight y trazabilidad.** No oculta fallos ni afirma actualización sin confirmación real.
7. **Documentos se conecta conceptualmente con movimientos**, en vez de existir como simple almacén de archivos.

## Hallazgos

### PROD-001 — P1 · Falta la superficie “Análisis” de la arquitectura aprobada

**Área:** Arquitectura de información / comprensión  
**Evidencia:** el árbol de rutas actual contiene `/accounts`, `/budgets`, `/forecast`, `/recurrences`, `/transactions`, `/documents` y `/configuration`, pero no `/analysis` ni una superficie equivalente. Inicio muestra una gráfica anual básica, pero no sustituye una sección de comprensión.  
**Consecuencia:** el usuario puede gestionar y prever, pero no dispone de un lugar dedicado para responder preguntas como “¿por qué gasto más?”, “¿qué cambió?”, “¿qué categorías explican la variación?”, “¿qué tendencia es estructural?”. Esto rompe la filosofía aprobada `Análisis = comprensión`.  
**Recomendación:** crear Análisis como consumidor de motores existentes, no como un nuevo motor financiero paralelo. Debe incluir comparación temporal, cash flow, composición de gasto/ingreso, tendencias, categorías/comercios explicativos y drill-down a movimientos.  
**Esfuerzo:** Medio/alto.  
**Riesgo de regresión:** Bajo si es inicialmente read-only sobre APIs centrales.  
**Prioridad:** P1 de producto.  
**Criterio de aceptación:** un usuario puede explicar una variación financiera desde Análisis y llegar a los movimientos causantes sin cálculos duplicados.

### PROD-002 — P1 comercial · No existe onboarding/first-run de producto

**Área:** Activación / UX / comercialización  
**Evidencia:** el flujo público actual es login privado; la configuración de fuente existe como pantalla administrativa avanzada, con términos como runtime, preflight, revisión y contrato seguro. No hay flujo guiado de “primera vez” para entender producto, conectar origen, validar datos, crear preferencias y llegar a una primera conclusión útil.  
**Consecuencia actual:** aceptable para el propietario que conoce el sistema.  
**Consecuencia comercial:** un usuario nuevo necesitaría instrucciones externas y comprender conceptos internos antes de obtener valor.  
**Recomendación:** onboarding progresivo, no wizard interminable: identidad/privacidad → conexión/origen → validación → cuentas detectadas → categorías iniciales → primer resumen → tareas pendientes. La capa técnica avanzada permanece en Configuración.  
**Esfuerzo:** Alto.  
**Riesgo de regresión:** Bajo si se añade encima de motores actuales.  
**Prioridad:** P1 comercial.  
**Criterio de aceptación:** beta tester no técnico llega desde cuenta nueva a un Inicio comprensible sin instrucciones externas.

### PROD-003 — P2 · Recurrentes está funcionalmente huérfano en la navegación principal

**Área:** Descubribilidad  
**Evidencia:** Inicio ofrece accesos a Movimientos, Cuentas, Presupuestos, Previsión, Documentos y Configuración; no incluye Recurrentes pese a existir `/recurrences`, motor y UI completos.  
**Consecuencia:** una función valiosa puede no ser descubierta; Previsión depende conceptualmente de recurrencias, pero el usuario no recibe un camino claro para revisar su origen.  
**Recomendación:** incorporar Recurrentes en la arquitectura de navegación o como subnivel explícito de Previsión con acceso bidireccional. No añadir otro botón aislado sin jerarquía.  
**Esfuerzo:** Bajo.  
**Riesgo de regresión:** Muy bajo.  
**Prioridad:** P2.  
**Criterio de aceptación:** usuario habitual puede descubrir, revisar y volver desde una recurrencia a Previsión sin conocer la URL.

### PROD-004 — P2 · “Disponible total” no está semánticamente demostrado

**Área:** Exactitud de producto / copy financiero  
**Evidencia:** Inicio muestra `financial.balances.activeBalanceCents` con el rótulo “Disponible total”. Ese valor agrega saldos de cuentas activas; el modelo de cuenta admite ahorro, crédito, inversión y otros tipos.  
**Consecuencia:** “disponible” puede interpretarse como dinero libre para gastar, algo distinto de saldo agregado/patrimonio líquido. En finanzas, una etiqueta imprecisa puede inducir una decisión equivocada.  
**Recomendación:** hasta disponer de un motor explícito de disponibilidad, renombrar a “Saldo total en cuentas”/“Saldo agregado” o definir formalmente `availableToSpendCents` descontando reservas, deuda, presupuestos y próximos compromisos.  
**Esfuerzo:** Bajo para copy; alto si se crea nuevo motor.  
**Riesgo de regresión:** Muy bajo para copy.  
**Prioridad:** P2.  
**Criterio de aceptación:** cada cantidad principal tiene definición financiera documentada y el texto no promete una semántica que el motor no calcula.

### PROD-005 — P1 comercial · Falta visión real de patrimonio/net worth

**Área:** Valor financiero / posicionamiento premium  
**Evidencia:** Cuentas calcula saldos y evolución por cuentas financieras, pero no existe un agregado comercial de activos menos pasivos con activos manuales, deuda y evolución patrimonial. El nombre “Panorama” de Inicio no equivale a patrimonio. Productos comerciales revisados separan saldo/cash flow de net worth.  
**Consecuencia:** la aplicación explica liquidez y gasto mejor que riqueza/patrimonio; para una app premium generalista queda un hueco relevante.  
**Recomendación:** no simular patrimonio sumando cuentas. Diseñar un motor de `NetWorthSnapshot` con activos, pasivos, cuentas incluidas/excluidas, valoración y fecha/fuente. Puede empezar con cuentas bancarias/crédito/inversión y activos manuales opcionales.  
**Esfuerzo:** Alto.  
**Riesgo de regresión:** Bajo si es motor nuevo read-only sobre entidades definidas; medio al ampliar modelo.  
**Prioridad:** P1 comercial, P3 para uso personal si no se necesita.  
**Criterio de aceptación:** patrimonio = activos - pasivos con trazabilidad y evolución, sin reutilizar incorrectamente “saldo disponible”.

### PROD-006 — P2 comercial · Falta un “inbox”/centro de atención financiera unificado

**Área:** Decisión / automatización  
**Evidencia:** la app tiene múltiples conceptos que requieren atención: movimientos pendientes/revisión, duplicados, candidatos recurrentes, documentos pendientes, presupuesto superado, diferencias de reconstrucción, sync warnings y previsiones de baja confianza. Están repartidos por módulos.  
**Consecuencia:** el usuario debe recordar dónde mirar. El sistema conoce problemas pero no los prioriza en una cola única.  
**Recomendación:** crear “Para revisar” como agregador de referencias, no como nueva fuente de verdad. Cada item apunta al módulo original y conserva severidad/origen. Inicio puede mostrar sólo los 3–5 más importantes.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.  
**Criterio de aceptación:** el usuario puede dejar la app “a cero” de asuntos pendientes desde una única cola sin duplicar estados.

### PROD-007 — P2 · Presupuesto automático necesita comunicar mejor su adecuación a ingresos

**Área:** Presupuesto / decisión  
**Evidencia:** el presupuesto automático se basa en media de tres meses; el motor expone explicación e histórico, pero no existe una comprobación de sostenibilidad frente a ingresos esperados/objetivos de ahorro.  
**Consecuencia:** un límite automático puede ser históricamente representativo y, aun así, económicamente poco deseable.  
**Recomendación:** mantener la media como referencia, pero añadir contexto: ingresos medios/previstos, tasa de ahorro objetivo y diferencia entre “lo habitual” y “lo recomendable”. Nunca etiquetar la media histórica como recomendación financiera sin criterio adicional.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.  
**Criterio de aceptación:** UI distingue claramente baseline histórico, límite elegido y objetivo financiero.

### PROD-008 — P3 · Configuración de fuente expone lenguaje interno demasiado pronto

**Área:** Usabilidad / arquitectura de información  
**Evidencia:** la pantalla usa términos como runtime, prevalidación, contrato y datos autoritativos. Son técnicamente correctos y útiles para diagnóstico.  
**Consecuencia:** para propietario/técnico son transparentes; para cliente comercial elevan carga cognitiva.  
**Recomendación:** conservar toda la información en un nivel “Detalles técnicos/Diagnóstico”; en primer nivel hablar de Conectada, Última actualización, Datos nuevos, Avisos y Actualizar.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P3 actual / P2 comercial.

## Arquitectura de producto propuesta

No crear más módulos por inercia. El destino recomendado queda:

1. **Inicio** — situación, decisiones y atención inmediata.
2. **Movimientos** — buscar, revisar, editar overrides, duplicados y transferencias.
3. **Análisis** — comprender variaciones y tendencias.
4. **Presupuestos** — límites, objetivos y control.
5. **Previsión** — futuro; Recurrentes como fuente/gestión estrechamente relacionada.
6. **Cuentas** — saldos, origen y posteriormente patrimonio.
7. **Documentos** — soporte y asociación documental.
8. **Configuración** — administración, conexión, reglas y diagnóstico técnico.

## Estado de fase

Producto: **COMPLETADA** para la primera ronda de auditoría.

Estado comercial permanece explícitamente: **NO APTA**.
