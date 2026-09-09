# 13 · Beta testing inicial — perfiles ficticios

## Método

Se ejecuta la ronda exigida con **8 perfiles ficticios y tareas sin instrucciones de navegación** sobre la arquitectura/UI/cobertura E2E actual. No se inventan tiempos humanos ni puntuaciones de satisfacción: en esta primera ronda el esfuerzo se expresa como pasos/decisiones observables y el campo tiempo queda `NO MEDIDO`. Los tiempos reales se medirán en la segunda ronda con ejecución humana o browser instrumentado tras la implementación.

La cobertura automática existente confirma múltiples flujos funcionales (Movimientos, Configuración, Dashboard, Presupuestos, OCR, etc.); esta beta busca **fricción de producto**, no repetir tests unitarios/E2E.

---

## Beta Tester 1 — Usuario poco técnico

**Tarea:** “Quiero empezar a usar la app, conectar mis datos y saber cuánto dinero tengo.”  
**Ruta probable:** Login → Inicio vacío/estado actual → Configuración → Fuente → conexión/preflight/sync → Inicio.  
**Resultado:** **PARCIAL / comercialmente fallido para primera experiencia**.  
**Tiempo:** NO MEDIDO.  
**Esfuerzo observable:** alto; necesita descubrir Configuración/Fuente y comprender prevalidación/runtime/estado.  
**Errores/confusión:** vocabulario técnico antes de obtener valor; no existe onboarding.  
**No encontró fácilmente:** un CTA “Conecta tus datos” guiado desde primera experiencia.  
**Positivo:** la fuente explica que es sólo lectura y bloquea operaciones inseguras.  
**Sugerencia:** UX-001/PROD-002: onboarding progresivo y diagnóstico técnico secundario.

## Beta Tester 2 — Usuario avanzado de finanzas personales

**Tarea:** “Quiero saber por qué he gastado más este mes que el anterior y qué categorías/comercios lo explican.”  
**Ruta probable:** Inicio → intenta usar Evolución → Movimientos/filtros manuales.  
**Resultado:** **FALLIDO como tarea de comprensión**.  
**Tiempo:** NO MEDIDO.  
**Esfuerzo observable:** elevado; requiere reconstruir comparación manualmente.  
**Errores/confusión:** no existe superficie Análisis ni drill-down desde la evolución.  
**No encontró:** comparación periodo contra periodo, drivers de variación, top categorías/comercios explicativos.  
**Positivo:** los movimientos y filtros necesarios existen.  
**Sugerencia:** PROD-001/VIZ-005: Análisis read-only sobre motores centrales.

## Beta Tester 3 — Usuario principalmente móvil

**Tarea:** “Revisa movimientos, después mira el presupuesto y vuelve a previsión.”  
**Ruta probable:** Inicio → Movimientos → Volver a Inicio → Presupuestos → Volver/Inicio → Previsión.  
**Resultado:** **FUNCIONAL CON FRICCIÓN ALTA**.  
**Tiempo:** NO MEDIDO.  
**Esfuerzo observable:** varios cambios de contexto y regresos al hub.  
**Errores/confusión:** navegación no persistente; algunos controles de Previsión por debajo de target táctil recomendado.  
**Positivo:** matrices responsive evitan overflow en rutas principales; Movimientos ya adapta tabla.  
**Sugerencia:** MOB-001/002 + ART-006/009: AppShell móvil y targets >=44 px.

## Beta Tester 4 — Usuario de escritorio

**Tarea:** “Busca dos movimientos y cambia su categoría/estado de una vez.”  
**Ruta probable:** Inicio → Movimientos → filtros → seleccionar → categoría/estado masivo → aplicar.  
**Resultado:** **ÉXITO**.  
**Tiempo:** NO MEDIDO.  
**Esfuerzo observable:** razonable; el E2E confirma selección múltiple y una sola operación PATCH.  
**Confusión:** draft de filtros vs filtro aplicado no muestra de forma explícita que existen cambios pendientes.  
**Positivo:** edición masiva reduce trabajo repetitivo y mantiene overrides no destructivos.  
**Sugerencia:** UX-007 y FE-001: indicador dirty + protección contra respuesta stale.

## Beta Tester 5 — Usuario con mucha información financiera

**Tarea:** “Encuentra un movimiento antiguo, comprueba su origen y revisa un posible duplicado.”  
**Ruta probable:** Movimientos → búsqueda/fechas/cuenta → paginación → Detalle y trazabilidad → Duplicado.  
**Resultado:** **ÉXITO FUNCIONAL CON FRICCIÓN MEDIA**.  
**Tiempo:** NO MEDIDO.  
**Esfuerzo observable:** correcto gracias a filtros, cursor y trazabilidad; el E2E cubre estos flujos.  
**Confusión:** después de guardar/revisar, el listado se recarga desde primera página y puede perder el ancla visual.  
**Positivo:** fuente, fingerprint, fila, original/procesado/efectivo y decisión de duplicado son auditables.  
**Sugerencia:** UX-005: preservar contexto/foco tras mutaciones.

## Beta Tester 6 — Usuario orientado a presupuestos

**Tarea:** “Fija un límite mensual, comprueba cuánto te queda y detecta dónde te has pasado.”  
**Ruta probable:** Inicio → Presupuestos → mes → límite manual/categoría → guardar.  
**Resultado:** **ÉXITO PARCIAL**.  
**Tiempo:** NO MEDIDO.  
**Esfuerzo observable:** bajo/medio.  
**Confusión:** “automático” significa media histórica, pero puede interpretarse como recomendación adecuada; la barra visual no diferencia bien 105 % vs 200 % al truncar a 100 %.  
**Positivo:** distingue límite manual y automático; muestra Gastado/Disponible/Exceso.  
**Sugerencia:** PROD-007 + VIZ-003: separar baseline histórico, objetivo y sostenibilidad; representar magnitud del exceso.

## Beta Tester 7 — Usuario orientado a análisis

**Tarea:** “Compara la evolución anual, profundiza en un mes malo y llega a los movimientos que explican el cambio.”  
**Resultado:** **FALLIDO**.  
**Tiempo:** NO MEDIDO.  
**Esfuerzo observable:** la primera tendencia existe, pero no hay interacción/drill-down.  
**Confusión:** la gráfica de Inicio parece analítica pero es sólo resumen; valores exactos dependen de `title`/hover.  
**No encontró:** Análisis, selección de mes y enlace a causas.  
**Positivo:** serie mensual central ya existe y puede alimentar la solución sin nuevo cálculo financiero.  
**Sugerencia:** PROD-001 + VIZ-001/005.

## Beta Tester 8 — Usuario que intenta romper la aplicación

**Tareas:**
- entrar en API sin sesión;
- manipular parámetros/fechas;
- navegar directamente a rutas privadas;
- ejecutar filtros muy rápido;
- subir archivo con MIME permitido pero contenido incorrecto;
- forzar concurrencia OCR.

**Resultado:** **CONTROLES DE SERVIDOR FUERTES, CON TRES HUECOS REPRODUCIBLES/DE DISEÑO**.  
**Tiempo:** NO MEDIDO.  
**Evidencia positiva:** API sin sesión → 401; rutas privadas → login; parámetros se validan; fuente fail-closed; OCR valida firma/dimensiones y tiene límites/timeouts.  
**Huecos:**
1. Movimientos no protege respuestas de filtros fuera de orden (FE-001).
2. `upload_finalize` confía inicialmente en MIME/metadata antes de inspección de firma (SEC-006).
3. Preview comparte frontera de persistencia con Production (SEC-002/BE-001).
**Positivo:** no se ha observado corrupción viva; invariantes actuales devuelven cero huérfanos/duplicados técnicos.

---

## Resultado conjunto de primera beta

### Tareas que funcionan bien

- revisar/editar movimientos;
- edición masiva;
- trazabilidad de fuente;
- revisión de duplicados/transferencias;
- control de presupuesto básico;
- confirmación explícita de recurrentes;
- conciliación de previsiones;
- protección de sesión/fuente.

### Tareas que fallan como producto comercial

1. **Empezar sin conocimiento previo** — falta onboarding.
2. **Comprender por qué cambian las finanzas** — falta Análisis/drill-down.
3. **Saber qué requiere atención** — falta “Para revisar”.
4. **Navegar como app móvil** — falta shell persistente.
5. **Usar gráficos como herramienta** — interacción/accesibilidad insuficiente.

### Problemas transversales más repetidos

- arquitectura interna visible al usuario;
- navegación dependiente de Inicio;
- falta de contexto entre módulos relacionados;
- microtexto/targets en móvil;
- ausencia de análisis profundo;
- pérdida de contexto después de algunas mutaciones.

## Estado de fase

Beta testing inicial: **COMPLETADA como ronda ficticia/heurística**, sin fabricar tiempos humanos.

Los tiempos, errores por sesión y satisfacción comparativa se medirán en la Fase 23 tras implementación.

Estado comercial: **NO APTA**.
