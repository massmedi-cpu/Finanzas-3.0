# 07 · Auditoría de dirección de arte y diseño gráfico

## Dictamen

Financial App 10.0.0 posee una dirección visual reconocible —oscura, azul/cian, superficies translúcidas, degradados, números prominentes y bordes suaves— pero todavía **no dispone de un sistema visual único que gobierne todas las pantallas**.

Existe una base de tokens, pero conviven tres niveles de valores:

1. `src/design/tokens.ts`.
2. Variables CSS en `app/globals.css` que duplican parte de esos tokens.
3. Valores hardcoded específicos en CSS Modules y componentes.

El resultado puede verse coherente en una pantalla aislada, pero tiene riesgo de drift, densidad irregular y decisiones tipográficas/espaciales distintas entre módulos.

## Fortalezas verificadas

- Paleta oscura coherente con producto financiero tecnológico.
- Buen uso de números tabulares/alineados en tablas y cantidades críticas.
- Contraste conceptual de estados: éxito, warning, danger, transferencia, ingreso/gasto.
- Radios, sombras y superficies ya siguen una familia visual parecida.
- Responsive no se resuelve sólo con reducir tamaño: Movimientos cambia tabla a tarjetas y los layouts colapsan por prioridad.
- Estados vacíos/error/carga tienen tratamiento visual propio.
- Iconos principales usan SVG vectorial, no emojis decorativos aleatorios.
- `prefers-reduced-motion` aparece en varias superficies.

## Hallazgos

### ART-001 — P1 · El sistema de diseño tiene múltiples fuentes de verdad

**Área:** Sistema visual / mantenibilidad  
**Evidencia:** `src/design/tokens.ts` define tipografía, spacing, radios, motion y breakpoints. `app/globals.css` repite manualmente tipografía/spacing/radios como custom properties. Módulos como `dashboard.module.css` vuelven a declarar numerosos colores, sombras, radios, tamaños y transiciones en literales.  
**Consecuencia:** modificar un token no garantiza que cambie la interfaz completa. La consistencia depende de recordar cada CSS module.  
**Recomendación:** una única fuente semántica. Para CSS, consolidar custom properties globales como contrato de runtime y generar/derivar equivalentes TypeScript cuando sean necesarios. Separar tokens base (`space`, `font`, `radius`) de tokens semánticos (`surface-primary`, `text-muted`, `income`, `expense`, `interactive`).  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Medio si se hace de golpe; bajo si se migra módulo a módulo con screenshots/regresión.  
**Prioridad:** P1 visual.  
**Criterio de aceptación:** no existe duplicación manual de los tokens base entre TS y CSS y las pantallas migradas no contienen colores/radios/sombras arbitrarios salvo excepciones documentadas.

### ART-002 — P1 · Tipografía auxiliar demasiado pequeña para una app premium financiera

**Área:** Legibilidad / móvil / accesibilidad  
**Evidencia:** aunque el token `helper` equivale a 0.8125rem (~13 px), existen múltiples literales de `.70rem`, `.72rem`, `.73rem`, `.75rem`, `.76rem`, `.78rem` y `.8rem` para hints, kickers, chips, leyendas y metadatos. En una base de 16 px, varios caen aproximadamente entre 11,2 y 12,8 px.  
**Consecuencia:** información financiera secundaria, estados y ayudas pierden legibilidad especialmente en móvil, densidad alta o pantallas con escalado. También contradice el objetivo previo de evitar fuentes demasiado pequeñas.  
**Recomendación:** establecer mínimos de producto: texto auxiliar normal >= 0.8125rem/13 px; labels operativos preferiblemente >= 0.875rem/14 px; reservar tamaños inferiores sólo para elementos no esenciales y tras comprobar accesibilidad. Aumentar line-height antes que añadir cajas.  
**Esfuerzo:** Medio por alcance visual.  
**Riesgo de regresión:** Medio en layout; bajo funcional.  
**Prioridad:** P1 por legibilidad.  
**Criterio de aceptación:** ningún dato/estado/acción necesario para decidir usa texto por debajo del mínimo aprobado en 360 px, 430 px y escritorio.

### ART-003 — P2 · Breakpoints declarados no gobiernan los módulos

**Área:** Responsive / sistema  
**Evidencia:** `BREAKPOINTS` define 360/480/768/1024/1280/1440/1728, pero los CSS Modules usan valores locales como 420, 600, 680, 900, 1050 y 1180 px.  
**Consecuencia:** cada pantalla responde con lógica propia; al cambiar shell/navigation o incorporar una nueva densidad de contenido aparecen zonas intermedias incoherentes.  
**Recomendación:** no imponer sólo por números. Definir breakpoints de layout semánticos y migrar los módulos cuando sus transiciones equivalgan; mantener excepciones justificadas por contenido.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Medio.  
**Prioridad:** P2.  
**Criterio de aceptación:** breakpoints principales derivan del sistema y las excepciones se documentan por necesidad de contenido.

### ART-004 — P2 · Iconografía distribuida y duplicada por pantalla

**Área:** Iconografía / consistencia  
**Evidencia:** Dashboard define un componente `Icon` con paths inline; Presupuestos define otro conjunto; otras pantallas usan iconografía propia o carecen de ella. No existe biblioteca central de iconos de producto.  
**Consecuencia:** stroke, tamaño, semántica y evolución pueden divergir. Añadir iconos exige copiar SVG o inventar otro estilo.  
**Recomendación:** crear catálogo `src/design/icons` con componentes SVG accesibles, stroke/size normalizados y mapa semántico; no convertir cada texto en icono ni usar iconos sólo por decoración.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2.  
**Criterio de aceptación:** acciones y conceptos repetidos utilizan el mismo icono/semántica en toda la app.

### ART-005 — P2 · Demasiadas superficies anidadas en zonas densas

**Área:** Composición / jerarquía  
**Evidencia:** Configuración encadena hero → panel → entity card → badge/button; Movimientos usa hero → filtros → panel → tabla → editor/review panel → cards/chips; Inicio usa paneles que a su vez contienen varias mini-superficies con fondo.  
**Consecuencia:** profundidad visual constante reduce contraste jerárquico: casi todo parece una tarjeta. En pantallas pequeñas aumenta sensación de “cajas dentro de cajas”.  
**Recomendación:** reservar superficies elevadas para niveles estructurales. Dentro de un panel usar separación por spacing, tipografía, divisores o background muy sutil antes de crear otra tarjeta.  
**Esfuerzo:** Medio/alto de diseño.  
**Riesgo de regresión:** Bajo funcional / medio visual.  
**Prioridad:** P2.  
**Criterio de aceptación:** cada pantalla tiene 2–3 niveles visuales claramente diferenciados y no usa borde+fondo+radio en cada agrupación por defecto.

### ART-006 — P2 · App shell no es realmente compartido

**Área:** Navegación / composición  
**Evidencia:** Inicio implementa su propio `shell`, hero y `quickNav`; Movimientos, Cuentas, Recurrentes, Configuración y Fuente implementan shells/heroes/back links específicos. `app/layout.tsx` sólo envuelve `body` y children.  
**Consecuencia:** la navegación, anchura, cabeceras y acciones globales pueden variar pantalla a pantalla. También dificulta crear experiencia móvil instalada coherente.  
**Recomendación:** diseñar `AppShell` compartido con navegación responsive, page header slots y zona de contenido; mantener heroes especiales sólo cuando el contenido lo justifique.  
**Esfuerzo:** Medio/alto.  
**Riesgo de regresión:** Medio/alto si se sustituye todo a la vez. Implementar incrementalmente.  
**Prioridad:** P2, dependiente de UX/móvil.  
**Criterio de aceptación:** cambiar navegación global o ancho de contenido no exige editar cada módulo.

### ART-007 — P2 · La familia tipográfica declarada no está garantizada

**Área:** Tipografía / consistencia de render  
**Evidencia:** `body` declara `Inter, ui-sans-serif...`, pero no se ha encontrado `@font-face` ni `next/font` en el repositorio.  
**Consecuencia:** usuarios sin Inter instalada renderizan la fuente de sistema; la métrica cambia por plataforma y la identidad visual no es determinista.  
**Recomendación:** elegir una estrategia explícita. O bien usar deliberadamente system-ui y eliminar la falsa expectativa de Inter, o cargar una tipografía web de forma optimizada/licenciada mediante `next/font`/asset propio autorizado.  
**Esfuerzo:** Bajo.  
**Riesgo de regresión:** Medio visual por cambio de métricas.  
**Prioridad:** P2.  
**Criterio de aceptación:** la tipografía efectiva es deliberada, reproducible y medida en todos los breakpoints.

### ART-008 — P2 · El fondo/degradado global y el de Inicio compiten

**Área:** Dirección de arte / consistencia  
**Evidencia:** `body` ya aplica dos radial gradients sobre `--color-bg`; `dashboard.module.css .shell` vuelve a aplicar radial + linear gradient propios.  
**Consecuencia:** Inicio tiene una atmósfera diferente al resto y duplica capas de pintura; esto puede ser buscado, pero hoy no está expresado como variante del sistema.  
**Recomendación:** definir backgrounds semánticos (`app`, `hero`, `feature`) y evitar que cada módulo cree un nuevo “tema”.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Bajo.  
**Prioridad:** P2/P3.

### ART-009 — P2 · Navegación de Inicio funciona como barra de enlaces, no como navegación de producto

**Área:** App shell / móvil  
**Evidencia:** `quickNav` es una fila horizontal de enlaces con scroll en móvil; no indica ruta activa ni jerarquía, omite Recurrentes y Análisis.  
**Consecuencia:** sirve como shortcut de dashboard pero no como estructura de app persistente. Al entrar en un módulo se vuelve al patrón `← Volver a Inicio`.  
**Recomendación:** la auditoría UX/móvil debe decidir navegación responsive persistente: lateral/rail en escritorio y navegación inferior/drawer en móvil, con máximo de destinos primarios y secundarios agrupados.  
**Esfuerzo:** Medio/alto.  
**Riesgo de regresión:** Medio.  
**Prioridad:** P2.

### ART-010 — P3 · Modo visual exclusivamente oscuro

**Área:** Preferencias / accesibilidad  
**Evidencia:** `:root { color-scheme: dark; }`; no hay variante light/system detectada.  
**Consecuencia:** no es un defecto por sí solo y puede ser una decisión de marca, pero limita preferencia de usuario y escenarios de alta iluminación.  
**Recomendación:** no añadir light mode como parche. Tras consolidar tokens semánticos, evaluar tema `system/dark/light`; sólo entonces resulta barato y coherente.  
**Esfuerzo:** Medio después de ART-001, alto antes.  
**Riesgo de regresión:** Medio visual.  
**Prioridad:** P3.

## Sistema visual objetivo

Orden recomendado:

1. Consolidar tokens semánticos y mínimos tipográficos.
2. Crear primitivas de superficie, control, estado e iconografía.
3. Introducir AppShell compartido.
4. Migrar Inicio/Movimientos primero por ser superficies de mayor uso.
5. Migrar módulos restantes sin cambiar reglas de negocio.
6. Ejecutar comparación visual en 360/430/768/1024/1280/1440.
7. Sólo después evaluar light mode y motion adicional.

## Estado de fase

Dirección de arte/diseño: **COMPLETADA** para la primera ronda.

Estado comercial: **NO APTA**.
