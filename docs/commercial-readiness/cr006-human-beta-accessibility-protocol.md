# CR-006 · Protocolo maestro de beta humana, funcional, técnica y precomercial

Fecha de preparación inicial: 2026-09-11  
Actualización de contrato: 2026-09-12  
Estado: **PENDIENTE DE EVIDENCIA HUMANA**  
Producto: Financial App · producto privado monousuario

## 1. Regla fundamental

CR-006 valida Financial App como producto completo usado por personas reales. Unit tests, integración, E2E, SQL, RLS, Playwright, CI/CD, Vercel, Supabase, Lighthouse, Security Advisor y logs son **EVIDENCIA TÉCNICA** y nunca sustituyen una prueba humana.

No se permitirá presentar perfiles ficticios, personas simuladas por IA, tiempos inventados, satisfacción inventada ni recorridos heurísticos como **BETA HUMANA**. Cuando una prueba no haya sido realizada por una persona real se etiquetará como **PRUEBA TÉCNICA / HEURÍSTICA / AUTOMATIZADA**. Si falta una persona real, el estado es **PENDIENTE DE BETA HUMANA**.

CR-006 no puede declararse completado sólo porque compile, las páginas carguen o todos los tests estén verdes.

## 2. Secuencia operativa obligatoria

**BETA HUMANA → INCIDENCIA → CORRECCIÓN → RETEST → CERTIFICACIÓN**

Durante CR-006 no se iniciarán de forma espontánea nuevas grandes funcionalidades, rediseños generales, refactors amplios, auditorías independientes ni CR-008. Sólo se permite trabajo nuevo cuando corrige una incidencia encontrada, es imprescindible para completar el beta o ha sido ordenado expresamente por el propietario.

## 3. Participantes reales

La beta debe intentar contar con un mínimo recomendado de **8 personas reales** y perfiles diversos. Una misma persona puede cubrir más de una perspectiva cuando sea razonable, pero debe documentarse sin inventar cobertura.

- **B01 · Usuario poco tecnológico:** orientación sin explicación previa.
- **B02 · Usuario habitual de banca digital:** claridad financiera, confianza y coherencia.
- **B03 · Usuario avanzado de finanzas personales:** profundidad y utilidad real.
- **B04 · Usuario principalmente móvil:** experiencia táctil en smartphone real.
- **B05 · Usuario principalmente escritorio:** productividad con PC/portátil, teclado y ratón.
- **B06 · Usuario orientado a accesibilidad:** teclado, zoom, lector de pantalla y/o contraste.
- **B07 · Usuario crítico / breaker:** acciones repetidas, valores incorrectos, navegación rápida y estados inesperados.
- **B08 · Usuario nuevo sin contexto:** no conoce historia, arquitectura ni problemas previos de Financial App.

El propietario puede hacer pruebas reales en sus dispositivos, confirmar experiencia y aceptar el producto, pero se clasifican como **VALIDACIÓN DEL PROPIETARIO** y no sustituyen la beta del resto de usuarios.

## 4. Entorno y datos de beta

Siempre que sea técnicamente posible se utilizará un entorno beta aislado de Production: Preview exacta, usuario beta, datos ficticios, fixtures controlados y persistencia independiente. Si una comprobación no destructiva debe realizarse en Production, será sólo lectura y no compartirá credenciales ni datos personales.

Los testers externos utilizarán exclusivamente datos ficticios. El dataset debe parecer realista e incluir varias cuentas, ingresos, gastos, transferencias internas, compras repetidas legítimas, posibles duplicados, categorías y subcategorías, comercios, presupuestos, recurrentes, previsiones, documentos, tickets, varios meses, estados vacíos y estados con muchos datos.

Nunca se proporcionarán a terceros datos bancarios reales, extractos reales, credenciales personales, información privada, tokens, secretos ni datos personales del propietario.

## 5. Cobertura mínima de dispositivos y navegadores

Debe existir evidencia humana, en la medida de lo posible, de:

- Windows en resolución habitual de portátil/escritorio con Chrome o Chromium.
- Smartphone Android real en orientación vertical e interacción táctil.
- Pantallas pequeñas: sin scroll horizontal accidental, paneles cortados, botones inaccesibles, modales imposibles de cerrar, texto desbordado ni elementos superpuestos.
- Pantallas grandes: uso adecuado del espacio, tablas, gráficas, paneles y jerarquía visual.
- Chrome y Edge como cobertura mínima recomendable.
- Navegador Android basado en Chromium.
- Firefox y Safari/iOS cuando existan medios. La ausencia de dispositivo se documenta como **COBERTURA NO EJECUTADA**, nunca como PASS.

Por cada sesión se registra: alias, fecha/hora, SHA, dispositivo, sistema operativo, navegador/versión, modalidad de entrada, tecnología asistiva, zoom/reflow y forced colors/alto contraste cuando aplique.

## 6. H01–H08 · recorridos humanos obligatorios

### H01 · Acceso privado

1. Abrir Financial App.
2. Identificar que es una aplicación privada.
3. Intentar iniciar sesión.
4. Introducir datos incorrectos.
5. Comprobar el mensaje de error.
6. Usar credenciales beta válidas.
7. Acceder.
8. Cerrar sesión.
9. Intentar abrir una página protegida de nuevo.

Evaluar comprensión, claridad, seguridad percibida, mensajes, recuperación ante error y sesión.

### H02 · Orientación y navegación

Sin explicación detallada, localizar Inicio, Movimientos, Cuentas, Presupuestos, Análisis, Previsión, Documentos y Configuración. Revisar menú, iconos, nombres, jerarquía, atrás, estado seleccionado, navegación móvil y persistencia del contexto.

Pregunta final obligatoria: «¿En algún momento no sabías dónde estabas o cómo volver?»

### H03 · Comprender la situación financiera

En Inicio, el tester debe explicar con sus propias palabras cuánto dinero tiene, cuánto ha ingresado, cuánto ha gastado, el balance del periodo, la evolución, categorías principales, situación del presupuesto y próximos pagos/previsiones. No se explicará previamente cada panel. Una interpretación errónea de una cifra importante se registra como incidencia.

### H04 · Movimientos

Buscar y filtrar, cambiar periodo, abrir movimiento, editar un campo permitido, guardar, recargar y comprobar persistencia; probar selección múltiple cuando exista, revisar posible duplicado, cancelar alguna operación y volver al listado. Evaluar búsqueda, filtros, orden, edición, persistencia, estados, duplicados, feedback y rendimiento percibido.

### H05 · Presupuestos

Abrir Presupuestos, entender el estado actual, crear o editar, introducir un valor inválido, comprobar error, corregir, guardar, cambiar de pantalla, volver, confirmar persistencia y revisar progreso/límites. Evaluar validación, comprensión, cálculos, jerarquía y estado sin presupuesto.

### H06 · Previsión y contenido dinámico

Abrir Previsión, explicar qué representa, revisar próximos movimientos, crear/modificar una previsión ficticia cuando esté permitido, excluir/reincluir, revisar candidatos de conciliación si existen, cambiar periodo y volver tras navegar por otra sección. Evaluar cálculos, estados dinámicos, actualización, persistencia, foco, feedback y comprensión.

### H07 · Documentos

Abrir Documentos, revisar listado, abrir documento, subir documento ficticio, revisar metadatos, ejecutar OCR cuando corresponda, revisar resultado, asociar a movimiento, cambiar/desasociar cuando sea posible y volver a abrir. Evaluar subida, almacenamiento, visualización, OCR, asociación, persistencia, feedback y estados de error. OCR se evalúa de forma independiente por su riesgo histórico.

### H08 · Recorrido móvil completo

En teléfono real y sólo mediante interacción táctil: **Inicio → Movimientos → Presupuestos → Previsión → Inicio**. Comprobar menú, scroll, targets, modales, formularios, teclado virtual, botones, gráficas, tablas, vertical, volver atrás y ausencia de scroll horizontal.

## 7. Pruebas adicionales obligatorias

Además de H01–H08 se revisarán estados vacíos, estados cargando, error de red, error de servidor, acción inválida, recarga/F5, botón atrás del navegador, doble clic/doble toque, operaciones lentas sin duplicación, caducidad de sesión y acceso directo por URL.

## 8. Accesibilidad humana

### A01 · Teclado

Tab, Shift+Tab, Enter, Space, Escape y flechas cuando corresponda. Foco visible y sin trampa de teclado.

### A02 · Bypass

Al pulsar Tab desde el inicio debe estar disponible **Saltar al contenido principal** y debe funcionar realmente.

### A03 · Zoom 200 %

Revisar lectura, formularios, menús, gráficas, botones y modales.

### A04 · Reflow / 400 %

Equivalente aproximado a 320 CSS px. No debe existir scroll horizontal general.

### A05 · Contraste / forced colors

Revisar foco, texto, botones, campos y estados.

### A06 · Lector de pantalla

Preferiblemente NVDA en Windows o TalkBack en Android. Revisar títulos, landmarks, formularios, botones, avisos, cambios dinámicos y gráficas accesibles. Si no existe una persona real capaz de realizarla, **NO MARCAR PASS**; registrar **PENDIENTE DE EVIDENCIA HUMANA DE LECTOR DE PANTALLA**.

## 9. Qué debe observar el tester

No basta con responder «Funciona». Debe valorar si entiende qué tiene delante, qué puede hacer, dónde pulsar, si la respuesta coincide con lo esperado, si algún dato parece incorrecto, si ha tenido que pensar demasiado, si hay términos confusos, botones ambiguos, exceso/falta de información, lentitud, poca confianza, sensación de producto terminado y si pagaría por un producto con ese nivel de acabado.

## 10. Registro obligatorio de incidencias

Cada problema se registra con:

- **ID:** `CR006-BETA-XXX`.
- **Tester:** B01–B08 o código equivalente real.
- **Fecha real de ejecución.**
- **Dispositivo, sistema y navegador.**
- **Sección y recorrido H01–H08.**
- **Severidad:** BLOCKER / MAJOR / MINOR / OBSERVATION.
- **Descripción.**
- **Pasos para reproducir.**
- **Resultado esperado.**
- **Resultado real.**
- **Evidencia:** captura, vídeo, log o descripción verificable.
- **Reproducibilidad:** siempre / frecuente / ocasional / una vez.
- **Estado:** ABIERTO / CORREGIDO / PENDIENTE DE RETEST / CERRADO.

## 11. Severidades y regla de cierre

- **BLOCKER:** impide una función crítica, pérdida/corrupción de datos, escritura indebida en fuente bancaria, acceso ajeno, error grave de seguridad o app inutilizable. CR-006 no puede cerrarse con BLOCKER abierto.
- **MAJOR:** función importante rota, persistencia incorrecta, navegación crítica rota, duplicados masivos falsos, error de sincronización ocultado, móvil inutilizable, OCR fundamentalmente incorrecto o función principal incomprensible. CR-006 no puede cerrarse con MAJOR abierto.
- **MINOR:** problema real no crítico. Sólo puede quedar pendiente si está documentado, no afecta seguridad/datos/función crítica y existe justificación expresa.
- **OBSERVATION:** sugerencia. No se corrige automáticamente; sólo se convierte en tarea si existe beneficio claro.

## 12. Corrección y retest

Ante una incidencia: reproducir, confirmar causa, clasificar, corregir causa raíz, añadir regresión automática cuando sea razonable, ejecutar tests afectados, ejecutar regresión general, desplegar candidato exacto, devolver al tester y realizar **RETEST HUMANO**.

Un test automático verde **NO CIERRA UNA INCIDENCIA HUMANA**. Tras la corrección queda **PENDIENTE DE RETEST** hasta confirmación humana equivalente.

## 13. Evidencia técnica complementaria

Unit, integración, E2E, SQL, RLS, aislamiento, contratos, responsive automáticos, Lighthouse, Security Advisor, logs, Vercel y Supabase pueden seguir ejecutándose. Se etiquetan como **EVIDENCIA TÉCNICA**, nunca como evidencia humana.

## 14. Matriz de cobertura

La matriz operativa vive en `docs/commercial-readiness/cr006-human-beta-matrix.md` y debe distinguir, como mínimo, Login, Inicio, Movimientos, Cuentas, Categorías, Presupuestos, Recurrentes, Previsión, Análisis, Documentos, OCR, Mobile, Teclado, Reflow, Contraste, Screen reader y Seguridad, con columnas separadas de técnica, humana, retest y resultado.

No se considera cubierta una sección simplemente porque tenga tests automáticos.

## 15. Sesión de beta

El tester recibe sólo cómo acceder y la tarea que debe completar. No se le explica dónde están los botones, cómo funciona cada pantalla ni qué debería entender salvo que la propia tarea lo requiera. Si pregunta «¿Dónde está esto?», se registra.

Siempre que sea posible se recopilarán captura, vídeo, dispositivo, navegador, fecha, pasos y comentario literal, evitando datos personales innecesarios.

## 16. Métricas finales

El informe final debe poder informar, sin inventar porcentajes, de número de testers reales, dispositivos cubiertos, recorridos ejecutados, BLOCKER/MAJOR/MINOR encontrados, incidencias corregidas/pending, retests realizados, cobertura humana y cobertura técnica.

## 17. Criterio de salida de CR-006

CR-006 sólo puede declararse **COMPLETADA** cuando se cumpla simultáneamente:

1. H01–H08 han sido ejecutados.
2. Existe evidencia humana real.
3. Mobile real ha sido probado.
4. Teclado ha sido probado.
5. Zoom/reflow ha sido probado.
6. Contraste ha sido probado.
7. Lector de pantalla ha sido probado o existe justificación formal explícita para su cobertura pendiente.
8. No hay BLOCKER abiertos.
9. No hay MAJOR abiertos.
10. BLOCKER/MAJOR corregidos tienen retest humano satisfactorio.
11. La regresión técnica general está verde.
12. Se mantiene integridad financiera.
13. La fuente bancaria sigue estrictamente read-only.
14. No se introducen regresiones.
15. La matriz de cobertura está completa.
16. El Gantt está actualizado.
17. Existe informe final de beta.

## 18. Veredicto final

El informe final sólo puede concluir:

- **NO APTA:** existen BLOCKER.
- **BETA NO CERRABLE:** no hay BLOCKER pero existen MAJOR o cobertura humana incompleta.
- **APTA PARA CERRAR CR-006:** cero BLOCKER/MAJOR, retests completados y cobertura requerida realizada.

## 19. Relación con CR-008

> **CR-008 NO PUEDE COMENZAR MIENTRAS CR-006 NO FIGURE FORMALMENTE COMO COMPLETADA.**

No se adelantará CR-008, ni se preparará silenciosamente, ni se considerará «prácticamente iniciado».

## 20. Gantt y despliegues

Tras cada beta real, BLOCKER/MAJOR, corrección importante, retest o cambio de estado se actualizará **Financial App · Gantt porcentual de reconstrucción**. No se aumentarán porcentajes artificialmente y debe distinguirse desarrollo terminado, tests técnicos, beta humana y certificación final.

Para proteger cuota de Vercel se agruparán correcciones, se evitará Preview por cada MINOR, se usarán candidatos coherentes y SHA exactos, se ejecutarán gates antes de merge y Production se mantendrá como checkpoint seguro.

## 21. Estado actual

- **Gate humano:** PENDIENTE.
- **Evidencia externa real suficiente:** NO.
- **Validación del propietario:** existe y se clasifica por separado.
- **CR-008:** BLOQUEADA.
- **Regla activa:** no fingir cobertura, no convertir automatización en beta humana y no cerrar una incidencia humana sin retest humano.
