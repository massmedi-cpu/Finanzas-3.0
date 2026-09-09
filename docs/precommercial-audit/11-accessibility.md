# 11 · Auditoría de accesibilidad

## Dictamen

Financial App 10.0.0 ya incorpora varias buenas prácticas accesibles y una gate automática útil, pero **no alcanza aún una validación humana suficiente para producto comercial**. La cobertura actual comprueba estructura básica, foco y contraste de tokens globales; quedan huecos en gráficos, formularios, foco dinámico, tamaño táctil y contraste efectivo de valores hardcoded.

## Fortalezas verificadas

- `html lang="es"` exigido por E2E.
- Gate de controles visibles sin nombre accesible.
- Gate de imágenes visibles sin `alt`.
- Gate de foco visible por teclado en rutas principales.
- `role="alert"` y `role="status"` usados en errores/notificaciones de módulos críticos.
- Formularios principales usan elementos `label` nativos.
- Movimientos usa tabla semántica real y checkboxes con `aria-label` individual.
- Cuentas usa botones seleccionables con `aria-pressed`.
- Varias superficies implementan `prefers-reduced-motion`.
- Estados financieros importantes se expresan también con texto/importe, no únicamente con iconos.

## Hallazgos

### A11Y-001 — P1 · Gráficas no son completamente operables ni legibles con tecnología asistiva

**Área:** Gráficas / teclado / touch / lector de pantalla  
**Evidencia:** Dashboard usa barras `<span>` con `title`; Cuentas usa tracks `<div>` con `title`. Los elementos no son focables ni seleccionables por teclado, y `title` no ofrece interacción táctil fiable. La gráfica de Cuentas además expresa el signo del neto principalmente por color/clase.  
**Consecuencia:** una persona sin ratón/hover o con lector de pantalla no dispone de una experiencia equivalente para consultar valores mensuales.  
**Recomendación:** componente gráfico accesible con selección por teclado/tap/hover, tooltip con contenido anunciado y alternativa textual/tabular. El signo debe expresarse por dirección/posición y texto.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P1.  
**Criterio de aceptación:** todos los valores del gráfico pueden consultarse sin ratón ni depender de color o `title`.

### A11Y-002 — P1/P2 · La gate de contraste sólo valida tokens globales contra un único fondo

**Área:** Contraste  
**Evidencia:** `axiom-final-gates.spec.ts` comprueba ocho variables hex contra `--color-bg`. Sin embargo, Dashboard/Forecast/Presupuestos y otros módulos usan numerosos colores hardcoded y fondos/gradientes/rgba propios. Previsión incluso utiliza un tema claro independiente que queda fuera de esa gate.  
**Consecuencia:** un token global puede ser AA y, al mismo tiempo, existir texto real con contraste insuficiente sobre una superficie local.  
**Recomendación:** gate de contraste computado sobre elementos visibles reales, diferenciando texto normal/grande y estados disabled; acompañarla de revisión humana sobre gradients/overlays. Migrar colores a tokens semánticos reducirá superficie de riesgo.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P1 de QA accesible / P2 técnico.  
**Criterio de aceptación:** ninguna combinación de texto esencial/superficie visible incumple WCAG AA en los viewports objetivo.

### A11Y-003 — P2 · Errores de formulario no están asociados a campos

**Área:** Formularios  
**Evidencia:** no se han encontrado usos de `aria-invalid` ni `aria-describedby` en el repositorio. Login muestra un `role="alert"` general; formularios de presupuesto, previsión y movimientos también muestran errores globales.  
**Consecuencia:** el error se anuncia, pero un lector de pantalla no puede relacionarlo sistemáticamente con el control concreto; al recorrer el formulario después no sabe qué campo está inválido.  
**Recomendación:** errores de campo con id estable, `aria-invalid=true`, `aria-describedby`; errores generales siguen en live region. No revelar en login cuál credencial concreta falló.  
**Esfuerzo:** Medio por alcance.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.  
**Criterio de aceptación:** cada validación de campo se anuncia junto al control al que pertenece.

### A11Y-004 — P1 móvil · Algunos controles quedan por debajo del target táctil mínimo

**Área:** Accesibilidad motora  
**Evidencia:** Previsión contiene `.textButton`, `.primarySmall`, `.ghostButton` y `.reasonInput` sin garantía de 44 px; la gate actual no mide hit areas.  
**Consecuencia:** dificultad para usuarios con movilidad reducida o interacción táctil imprecisa.  
**Recomendación:** mínimo 44×44 para controles esenciales en móvil, incluso si el elemento visual es menor mediante padding/hit area. Añadir gate.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P1.  
**Criterio de aceptación:** todos los controles esenciales en <=480 px cumplen área táctil mínima.

### A11Y-005 — P2 · Focus management incompleto en contenido dinámico

**Área:** Teclado / anuncios  
**Evidencia:** Movimientos inserta editores y paneles de revisión dentro de la tabla tras pulsar “Editar”, “Duplicado” o “Emparejar”, pero no mueve foco al panel/primer campo ni devuelve explícitamente el foco al control al cerrar. Previsión inserta candidatos de conciliación con patrón similar.  
**Consecuencia:** el usuario de teclado/lector puede no percibir dónde apareció el contenido nuevo y necesita tabular hasta localizarlo.  
**Recomendación:** al abrir, foco en heading/primer control del panel y anuncio contextual; al cerrar/guardar, devolver foco al elemento lógico siguiente/origen cuando siga presente.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.  
**Criterio de aceptación:** abrir/cerrar un editor/revisión conserva una secuencia de foco predecible.

### A11Y-006 — P2 · Microtexto reduce accesibilidad aunque el contraste sea correcto

**Área:** Percepción visual  
**Evidencia:** varios módulos usan texto de ~11–12,8 px para estados, ayudas, fechas y metadatos esenciales.  
**Consecuencia:** baja legibilidad para baja visión, pantallas pequeñas y zoom parcial; además aumenta dependencia del zoom del navegador.  
**Recomendación:** aplicar mínimos tipográficos de ART-002 y comprobar 200 % de zoom/reflow.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Medio visual.  
**Prioridad:** P2/P1 cuando el texto es necesario para una decisión.

### A11Y-007 — P2 · Reduced motion no está centralizado

**Área:** Movimiento  
**Evidencia:** algunos CSS Modules anulan transiciones/animaciones con `prefers-reduced-motion`, pero otros efectos/transformaciones están definidos localmente y no existe una política global de motion tokens.  
**Consecuencia:** al crecer la app se pueden introducir animaciones no desactivadas de forma consistente.  
**Recomendación:** motion tokens + regla global para variantes no esenciales; los componentes que necesiten movimiento documentan su fallback reducido.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.

### A11Y-008 — P3 · Tabla de Movimientos puede reforzar asociación de cabeceras

**Área:** Tablas  
**Evidencia:** usa `<table>/<thead>/<th>/<tbody>`, suficiente para una tabla simple en muchos lectores, pero no define `scope="col"` y el modo visual móvil transforma la presentación mediante CSS/data-label.  
**Consecuencia:** no se ha demostrado un fallo actual, pero explicitar scope hace el contrato semántico más robusto ante futuras filas agrupadas/editores.  
**Recomendación:** `scope="col"` en cabeceras y validar la experiencia con lector de pantalla en desktop/móvil. No sustituir la tabla por divs sólo para diseño.  
**Esfuerzo:** Muy bajo.  
**Riesgo de regresión:** Ninguno.  
**Prioridad:** P3.

### A11Y-009 — P2 comercial · Falta gate explícita de reflow/zoom al 200–400 %

**Área:** Zoom / reflow  
**Evidencia:** la matriz cambia viewport, pero no prueba zoom ni emulación equivalente de reflow.  
**Consecuencia:** responsive a 360 px no garantiza que una pantalla de escritorio a 200 % conserve lectura/controles sin clipping.  
**Recomendación:** añadir casos de zoom/reflow y revisión manual de 200 %; para criterios WCAG relevantes comprobar también 400 %/320 CSS px cuando aplique.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Ninguno.  
**Prioridad:** P2.

## Validación humana obligatoria antes de salida

La automatización no sustituirá:

- recorrido sólo teclado;
- lector de pantalla en login, Inicio, Movimientos, gráfica, formulario y error;
- zoom/reflow;
- modo high contrast/forced colors donde esté disponible;
- deficiencia cromática sobre charts/estados;
- interacción táctil con targets reales.

## Estado de fase

Accesibilidad: **COMPLETADA** para la primera ronda.

Estado comercial: **NO APTA**.
