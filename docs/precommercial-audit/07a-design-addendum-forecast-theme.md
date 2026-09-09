# 07a · Addendum de Dirección de Arte — Identidad visual de Previsión

## ART-011 — P1 · Previsión utiliza un sistema visual incompatible con el resto de Financial App

**Área:** Identidad visual / coherencia global  
**Evidencia:** `app/forecast/forecast.module.css` define fondo `#f5f5f2`, superficies blancas/beige, textos oscuros `#171715`, acentos dorados/marrones y botones carbón. En contraste, `app/globals.css`, Inicio, Movimientos y Presupuestos usan base oscura azulada, superficies translúcidas, acentos azul/cian y texto claro. No se trata de una simple variante de panel: cambia el sistema cromático completo de la pantalla.  
**Consecuencia:** al navegar a Previsión parece que el usuario ha entrado en otro producto o en una pantalla heredada de otra dirección artística. Reduce identidad de marca, continuidad cognitiva y percepción de producto premium integrado. También vuelve inviable un futuro tema claro/oscuro porque ya existe una pantalla clara no gobernada por tokens semánticos.  
**Recomendación:** no “oscurecer” Previsión con un parche de colores. Primero consolidar ART-001 (tokens semánticos); después migrar Previsión al mismo sistema de superficies, tipografía, estados e interacción, conservando su jerarquía funcional y pudiendo mantener un acento propio sutil para futuro/previsión.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo funcional / medio visual.  
**Prioridad:** P1 visual.  
**Criterio de aceptación:** Inicio → Previsión se percibe como navegación dentro de la misma aplicación; todos los colores/superficies de Previsión proceden del sistema visual común y pasan contraste/regresión responsive.

Este hallazgo se incorpora a la Fase 7 ya completada y debe entrar en la matriz conjunta de prioridades.
