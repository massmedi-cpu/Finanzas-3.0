# 08 · Auditoría de visualización de datos

## Dictamen

Las visualizaciones actuales son ligeras y coherentes con los motores financieros, pero la mayoría funcionan como **resúmenes visuales estáticos**, no todavía como herramientas analíticas premium.

La buena noticia es que no hay una dependencia pesada de gráficos que obligue a reescribir. El producto puede evolucionar con componentes SVG/HTML accesibles y reutilizables, manteniendo los datos centrales actuales.

## Fortalezas verificadas

- Las gráficas consumen resultados de motores financieros; no recalculan reglas financieras en el navegador.
- Ingresos/gastos/neto se presentan con etiquetas y cantidades asociadas.
- Los importes usan formato es-ES/EUR y números tabulares donde corresponde.
- Dashboard limita la visualización a una pregunta sencilla: evolución mensual de ingresos/gastos.
- Cuentas añade neto mensual además de ingresos/gastos.
- Presupuestos combina progreso con importes “Presupuesto / Gastado / Disponible-Exceso”, evitando depender exclusivamente de color.
- Previsión muestra saldo después de cada elemento, confianza, origen y estado; los datos necesarios para una visualización temporal ya existen.

## Hallazgos

### VIZ-001 — P1 · Las gráficas de Inicio no permiten lectura exacta fiable en móvil/teclado

**Área:** Interacción / accesibilidad  
**Evidencia:** `dashboard-client.tsx` representa columnas con `<span>` y usa atributo `title` para el valor exacto. En móvil no existe hover equivalente fiable; los spans no son focables ni activables. No hay tabla/resumen alternativo de los mismos valores.  
**Consecuencia:** la gráfica sirve para percibir tendencia, pero no para consultar un mes exacto de forma universal.  
**Recomendación:** componente de chart accesible con punto/barra seleccionable por tap, teclado y hover; tooltip persistente/focusable y alternativa textual/tabla compacta.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P1 por móvil/accesibilidad.  
**Criterio de aceptación:** un usuario táctil o de teclado puede seleccionar cualquier mes y conocer ingresos/gastos exactos sin `title` del navegador.

### VIZ-002 — P1 · El neto negativo de Cuentas no usa un eje divergente

**Área:** Semántica gráfica  
**Evidencia:** `accounts-client.tsx` calcula el ancho del neto con `Math.abs(row.operatingNetCents)` y tanto positivo como negativo crecen desde el mismo origen; la diferencia se expresa principalmente con una clase/color distinta.  
**Consecuencia:** visualmente, +500 € y -500 € tienen la misma dirección/longitud. El usuario debe leer color/importe para saber signo, debilitando la lectura preatentiva y accesibilidad a deficiencias de color.  
**Recomendación:** neto con baseline cero central: positivo a derecha/arriba, negativo a izquierda/abajo; conservar valor textual.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P1.  
**Criterio de aceptación:** el signo del neto se reconoce por posición/dirección aun en escala de grises.

### VIZ-003 — P2 · El progreso de presupuesto oculta la magnitud del exceso

**Área:** Presupuestos  
**Evidencia:** `progressWidth()` limita el ancho a 100 %. Un presupuesto al 105 % y otro al 200 % llenan visualmente la barra por completo; el exceso sólo se descubre en importe/texto.  
**Consecuencia:** la visualización no distingue gravedad de desviación, precisamente cuando más útil debería ser.  
**Recomendación:** mantener track 0–100 para objetivo y representar sobrepaso con marcador/segmento secundario o escala adaptativa, acompañado de `+X €` / `+Y % sobre límite`. Evitar barras infinitas que distorsionen categorías normales.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.  
**Criterio de aceptación:** 105 % y 200 % son distinguibles sin depender únicamente del texto.

### VIZ-004 — P1/P2 · Previsión carece de curva de saldo proyectado en el tiempo

**Área:** Previsión  
**Evidencia:** cada `ForecastItem` ya contiene `date`, `projectionEffectCents` y `projectedBalanceAfterCents`, pero la UI presenta una lista cronológica, no una trayectoria visual del saldo.  
**Consecuencia:** el usuario sabe el saldo tras leer elemento por elemento, pero no ve rápidamente cuándo aparece el mínimo, si se cruza cero o qué periodo concentra riesgo de liquidez.  
**Recomendación:** gráfico principal de saldo proyectado por fecha, con línea de 0 €, mínimo del periodo, puntos de eventos y selección que sincronice con la lista. No inventar intervalos sin eventos; usar step/line claramente documentada.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo si sólo consume snapshot existente.  
**Prioridad:** P1 para percepción/decisión premium; P2 técnico.  
**Criterio de aceptación:** en segundos se identifica saldo de cierre, saldo mínimo, fecha del mínimo y eventos que provocan la caída/subida.

### VIZ-005 — P2 · Inicio mezcla “resumen” y “análisis” sin drill-down temporal

**Área:** Arquitectura de información  
**Evidencia:** la gráfica anual de Inicio es la única superficie de evolución general; no existe ruta Análisis. No permite seleccionar periodo ni ir desde un mes a categorías/movimientos explicativos.  
**Consecuencia:** Inicio empieza a asumir una función analítica que debería ser breve; cuando se añadan más comparativas existe riesgo de saturarlo.  
**Recomendación:** mantener Inicio resumido y trasladar comparativas, breakdown y drill-down a la futura sección Análisis. Inicio ofrece sólo una tendencia y CTA contextual.  
**Esfuerzo:** Dependiente de PROD-001.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.

### VIZ-006 — P2 · Escalas sin referencias suficientes para comparación precisa

**Área:** Ejes / escala  
**Evidencia:** Inicio normaliza alturas al máximo del periodo sin ticks/eje numérico. Cuentas hace lo mismo con tracks horizontales. Esto reduce ruido, pero obliga a usar tooltip/texto para interpretar magnitud relativa.  
**Consecuencia:** dos periodos visualmente similares pueden representar escalas económicas muy distintas; el usuario no conoce el orden de magnitud mirando sólo el chart.  
**Recomendación:** para charts analíticos usar 2–4 ticks legibles y formato abreviado es-ES; para Inicio mantener minimalismo pero mostrar referencia de máximo o tooltip accesible.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.

### VIZ-007 — P2 · Dependencia excesiva de color en algunos estados visuales

**Área:** Accesibilidad / semántica  
**Evidencia:** ingreso/gasto/neto positivo-negativo usan principalmente verde/rojo/azul. Hay leyendas y cantidades, pero el signo/diferencia visual de ciertas barras se apoya en color.  
**Consecuencia:** menor discriminación para usuarios con deficiencias de visión cromática y en pantallas de bajo contraste.  
**Recomendación:** añadir dirección, patrón/contorno, icono o label según el caso; nunca color como único canal. VIZ-002 resuelve gran parte del neto.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.

### VIZ-008 — P3 · No existe librería/componente gráfico común

**Área:** Sistema visual / mantenibilidad  
**Evidencia:** Dashboard y Cuentas implementan charts independientes con DOM/CSS. Presupuestos tiene su propio progress.  
**Consecuencia:** tooltips, accesibilidad, escalas y responsive evolucionan de forma distinta.  
**Recomendación:** crear primitivas internas (`FinancialBarChart`, `DivergingBar`, `BalanceProjectionChart`, `ProgressMeter`) antes de añadir más gráficos. No introducir una librería grande sólo por estética; medir bundle/rendimiento y accesibilidad.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo/medio.  
**Prioridad:** P3 ahora; P2 antes de construir Análisis.

## Pregunta que debe responder cada visualización

- Inicio · Evolución: **¿este año estoy ingresando/gastando mejor o peor?**
- Cuentas · Actividad mensual: **¿qué meses explican la variación de esta cuenta?**
- Presupuesto: **¿cuánto margen tengo y dónde me estoy desviando?**
- Previsión: **¿qué pasará con mi saldo y cuándo aparece el riesgo?**
- Análisis futuro: **¿qué causa los cambios y qué movimientos los explican?**

Si un gráfico futuro no responde una pregunta concreta, no se añade.

## Estado de fase

Visualización de datos: **COMPLETADA** para la primera ronda.

Estado comercial: **NO APTA**.
