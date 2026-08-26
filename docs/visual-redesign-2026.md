# Financial App — Auditoría visual y dirección 2026

## Estado de partida

La interfaz funciona, pero su lenguaje visual depende demasiado de patrones genéricos de dashboard: navegación lateral fija con quince destinos de primer nivel; portada organizada como cuentas, seis KPI y paneles; superficies elevadas con borde, radio y sombra como recurso principal de agrupación; uso repetido de `grid` para convertir datos en colecciones de tarjetas; y CSS visual repartido entre fundamentos y capas posteriores que vuelven a estilizar los mismos componentes.

El resultado se lee como un dashboard SaaS correcto, pero no como una herramienta financiera personal con identidad propia.

## Principios del nuevo sistema

### Continuidad antes que cajas

La estructura principal se crea con ritmo, alineación, divisores y cambios de densidad. Las superficies elevadas se reservan para overlays, menús y elementos realmente flotantes.

### Los números son la identidad

Importes, saldos, porcentajes y variaciones usan numeración tabular, jerarquía tipográfica clara y alineación estable. El tamaño responde a relevancia financiera, no a espectacularidad.

### Paleta editorial, no bancaria

El sistema abandona el azul como identidad por defecto. La base es neutra y cálida, con un acento mineral/cobre. Ingresos, gastos, advertencias e información disponen de familias semánticas propias y no dependen únicamente de verde/rojo.

### Navegación por intención

La navegación principal muestra solo seis destinos de alta frecuencia: Inicio, Movimientos, Cuentas, Plan, Análisis y Control. Las herramientas especializadas pasan a un menú secundario. En móvil se mantiene una navegación inferior de cuatro destinos más acceso a «Más».

### Portada narrativa

La portada pasa de «tarjeta + tarjeta + tarjeta» a una historia continua: disponible total, cuentas, pulso del mes, evolución, presupuesto en contexto, previsión, concentración del gasto y asuntos que necesitan atención.

### Movimientos como registro financiero

En escritorio, la tabla se mantiene como tabla. Se eliminan contenedores elevados innecesarios en resumen, filtros y listado. En móvil, las filas se convierten en una lista compacta separada por divisores, no en tarjetas flotantes.

## Foundations

- Color: fondo cálido, superficies neutrales, acento cobre y familias semánticas para éxito, gasto, advertencia e información.
- Superficies: contenido normal sin sombra; divisores y espacio para agrupar; elevación solo en overlays.
- Radios: controles y overlays; secciones de datos sin radio por defecto.
- Motion: transiciones breves y soporte de `prefers-reduced-motion`.
- Cifras: numeración tabular y jerarquía estable.

## Decisiones de implementación

- sustituir la sidebar por una barra superior de producto;
- reducir la navegación primaria;
- reestructurar la portada sin modificar sus fuentes de datos ni cálculos;
- refactorizar `globals.css`, `chrome.css`, `home.css`, `controls.css`, `visual.css`, `tablet.css` y `movements.css`;
- eliminar la capa que volvía a convertir los KPI de portada en tarjetas destacadas;
- resolver colores de gráficos por especificidad estructural, evitando nuevos `!important`;
- conservar autenticación, sincronización, rutas, filtros, APIs, cálculos y componentes de datos.

## Criterio de identidad

Financial App debe poder reconocerse por su balance dominante pero sobrio, ritmo editorial, datos separados por divisores, navegación compacta, acento cálido, tratamiento tabular de importes y movimientos densos y legibles.

## Próximos módulos

Cash Flow, Presupuesto, Previsión, Patrimonio, Análisis, Archivo, Cuentas, Objetivos, Reglas y Control deben revisarse en su propio CSS para retirar patrones de tarjeta heredados que no tengan valor semántico. La regla es corregir cada módulo desde su origen, no taparlo con overrides globales.
