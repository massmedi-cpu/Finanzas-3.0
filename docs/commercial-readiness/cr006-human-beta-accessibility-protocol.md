# CR-006 · Protocolo de beta humana y accesibilidad

Fecha de preparación: 2026-09-11  
Estado: **PENDIENTE DE EVIDENCIA HUMANA**  
Producto: Financial App · producto privado monousuario

## 1. Objetivo y límite de esta fase

Este protocolo convierte la beta heurística previa en una prueba humana reproducible. La automatización puede detectar regresiones técnicas, pero **no sustituye** la experiencia de una persona real usando teclado, lector de pantalla, zoom, alto contraste o interacción táctil.

Hasta que existan ejecuciones humanas registradas, CR-006 no puede declararse completado y no se publicarán tiempos, tasas de éxito, satisfacción ni métricas humanas inventadas.

## 2. Protección de datos durante la beta

- No usar movimientos bancarios, documentos, tickets, credenciales ni datos financieros reales del propietario con terceras personas.
- Usar una cuenta/entorno de prueba con datos ficticios o fixtures controlados.
- No compartir tokens, claves, enlaces de bypass ni secretos de infraestructura.
- Las capturas de evidencia deben excluir credenciales y cualquier dato personal innecesario.
- Identificar participantes mediante alias no identificativos, por ejemplo `P01`.

## 3. Matriz mínima de participantes

La beta humana debe registrar al menos estas perspectivas; una misma persona puede cubrir más de una cuando proceda, pero debe documentarse:

1. Uso general con ratón/touchpad.
2. Uso principalmente móvil/táctil.
3. Navegación sólo con teclado.
4. Revisión con lector de pantalla.
5. Revisión con zoom/reflow 200 % y 400 % o equivalencia de 320 CSS px.
6. Revisión con alto contraste/forced colors cuando la plataforma lo permita.

No se fija una cifra comercial de participantes como si existiese una muestra estadística. El cierre exige evidencia humana suficiente para los flujos críticos, no una métrica inventada.

## 4. Entorno que debe registrarse

Por cada sesión anotar:

- alias de participante;
- fecha y hora;
- dispositivo y tamaño aproximado de pantalla;
- sistema operativo;
- navegador y versión;
- modalidad de entrada: ratón, táctil, teclado;
- tecnología asistiva, si se usa, y versión;
- nivel de zoom/reflow;
- forced colors/high contrast, si aplica;
- versión/SHA de Financial App probada.

## 5. Flujos humanos críticos

### H01 · Acceso privado

**Tarea:** entrar en Financial App y reconocer claramente el estado de acceso.  
**Éxito:** campos y botón se entienden, el orden de foco es lógico, el foco es visible y un error no revela cuál credencial concreta es válida.

### H02 · Orientación y navegación

**Tarea:** desde Inicio localizar Movimientos, Cuentas, Presupuestos, Previsión, Documentos y Configuración, y volver al punto anterior.  
**Éxito:** navegación predecible, ubicación actual comprensible, sin trampas de foco ni necesidad de adivinar iconos.

### H03 · Comprender la situación financiera

**Tarea:** identificar saldo total en cuentas, balance del periodo y una variación relevante sin confundir saldo con patrimonio neto.  
**Éxito:** la jerarquía visual y textual permite interpretar los datos sin depender exclusivamente de color, hover o memoria espacial.

### H04 · Buscar y revisar un movimiento

**Tarea:** localizar un movimiento mediante filtros, abrir su trazabilidad y corregir un campo.  
**Éxito:** filtros, tabla/listado, edición, errores y confirmación se entienden; el foco permanece o vuelve a un lugar lógico.

### H05 · Presupuesto

**Tarea:** localizar el presupuesto mensual, introducir un importe inválido, corregirlo y guardar.  
**Éxito:** el error queda asociado al campo, se anuncia/comprende y la corrección puede completarse sólo con teclado.

### H06 · Previsión y contenido dinámico

**Tarea:** crear/revisar una previsión y abrir/cerrar candidatos de conciliación.  
**Éxito:** el contenido nuevo se percibe, el foco se mueve de forma predecible y vuelve al disparador al cerrar.

### H07 · Documentos

**Tarea:** localizar un documento/ticket de prueba, entender su estado y volver al contexto financiero relacionado.  
**Éxito:** estados, acciones y mensajes no dependen únicamente de color o iconografía.

### H08 · Móvil y táctil

**Tarea:** recorrer Inicio → Movimientos → Presupuestos → Previsión en un móvil real.  
**Éxito:** no hay controles difíciles de pulsar, solapamientos, clipping ni scroll horizontal global; la navegación sigue siendo comprensible.

## 6. Recorridos específicos de accesibilidad

### Sólo teclado

- Entrar en la página con `Tab`/`Shift+Tab` sin usar ratón.
- Confirmar foco visible en cada control esencial.
- Activar botones, enlaces, desplegables y editores con teclado.
- Comprobar que modales/paneles dinámicos reciben foco y lo devuelven al cerrar.
- Verificar que no existe un bucle o trampa de foco.

### Lector de pantalla

Como mínimo: Login, Inicio, Movimientos, una gráfica/resumen, un formulario con error y un panel dinámico.

Comprobar:
- título/heading principal y landmarks;
- nombres accesibles de controles;
- asociación label-campo;
- estado seleccionado/expandido cuando aplique;
- anuncio de errores y mensajes de estado;
- lectura equivalente de información financiera mostrada gráficamente.

### Zoom y reflow

- 200 %: completar H02 y H04.
- 400 % o 320 CSS px equivalentes: completar H01, H02 y H03.
- No debe perderse contenido esencial ni requerirse scroll horizontal bidimensional para contenido ordinario.

### Alto contraste / forced colors

- Foco y selección deben seguir siendo visibles.
- Estados de ingreso/gasto/alerta no pueden depender sólo del color.
- Iconos esenciales y bordes de controles deben conservar significado suficiente.

### Táctil

- Probar targets esenciales con dedo en dispositivo real cuando sea posible.
- Confirmar que tooltips/valores importantes no dependen exclusivamente de hover.

## 7. Clasificación de hallazgos

- **BLOCKER:** impide completar un flujo crítico, expone datos o deja una función esencial inaccesible.
- **MAJOR:** el flujo puede completarse sólo con ayuda, workaround o esfuerzo claramente excesivo.
- **MINOR:** fricción real sin impedir la tarea.
- **OBSERVACIÓN:** mejora deseable sin fallo demostrado.

Un BLOCKER abierto impide cerrar CR-006. Un MAJOR debe corregirse o quedar aceptado explícitamente con justificación y nueva prueba.

## 8. Plantilla de evidencia por hallazgo

Registrar:

- ID (`CR006-H-001`, etc.);
- participante alias;
- flujo/tarea;
- entorno y tecnología asistiva;
- pasos para reproducir;
- resultado esperado;
- resultado observado;
- severidad;
- evidencia (captura/vídeo/log si es seguro);
- SHA probado;
- estado: abierto / corregido / revalidado / aceptado;
- SHA de corrección y fecha de revalidación cuando corresponda.

## 9. Plantilla de sesión

```text
Participante: P__
SHA probado:
Dispositivo/SO/navegador:
Entrada/tecnología asistiva:
Zoom/forced colors:

H01: PASS / FAIL / NO PROBADO · notas
H02: PASS / FAIL / NO PROBADO · notas
H03: PASS / FAIL / NO PROBADO · notas
H04: PASS / FAIL / NO PROBADO · notas
H05: PASS / FAIL / NO PROBADO · notas
H06: PASS / FAIL / NO PROBADO · notas
H07: PASS / FAIL / NO PROBADO · notas
H08: PASS / FAIL / NO PROBADO · notas

Hallazgos asociados:
Observaciones libres:
```

## 10. Gate de cierre de CR-006

CR-006 sólo puede marcarse completado cuando:

1. los gates automáticos de accesibilidad/regresión del candidato estén verdes;
2. exista evidencia humana registrada sobre los flujos aplicables;
3. se haya realizado al menos un recorrido sólo teclado;
4. se haya realizado al menos una revisión con lector de pantalla;
5. zoom/reflow haya sido revisado humanamente;
6. móvil/táctil haya sido revisado en un dispositivo real cuando sea posible;
7. no existan BLOCKER abiertos;
8. los MAJOR estén corregidos/revalidados o aceptados explícitamente con justificación.

**Estado actual del gate humano: PENDIENTE.**
