# 06 · Auditoría de marketing y percepción comercial

## Estado de partida

Financial App permanece **NO APTA PARA SALIDA COMERCIAL**. Esta revisión evalúa qué señales impiden que el usuario perciba un producto terminado, confiable y premium incluso cuando la base técnica es buena.

## Benchmark comercial actual · septiembre de 2026

Patrones verificados en productos actuales mediante sus fuentes oficiales:

### Copilot Money

- Se presenta como producto premium centrado en claridad visual, automatización y visión unificada.
- Comunica gasto, presupuestos, inversiones, net worth, alertas y revisión de transacciones.
- El onboarding utiliza datos históricos para proponer categorías/presupuesto y lleva al usuario a revisar movimientos.
- Diferencia claramente lo que hace y lo que no hace.
- La propuesta comercial evita lenguaje de arquitectura interna.

Fuentes:
- https://www.copilot.money/
- https://www.copilot.money/faq
- https://help.copilot.money/en/articles/11157550-quick-start-guide
- https://help.copilot.money/en/articles/6045480-dashboard-tab-overview

### YNAB

- Posiciona el producto alrededor de un resultado y un método, no de una lista de tablas.
- Separa planificación/presupuesto de reflexión/análisis.
- Comunica seguridad, soporte y ausencia de publicidad como parte del valor percibido.

Fuente:
- https://www.ynab.com/features

### Rocket Money

- Convierte características en resultados: controlar gasto, presupuestar, detectar suscripciones, alertar y entender patrimonio.
- Usa automatización y ahorro de esfuerzo como argumento premium.
- La capa de producto explica valor antes de exponer detalles técnicos.

Fuentes:
- https://www.rocketmoney.com/
- https://www.rocketmoney.com/faq

## Primera impresión de Financial App

### En 5 segundos

**Positivo:** “Tu dinero, claro en segundos” es una promesa comprensible, concreta y alineada con Inicio.

**Negativo:** el usuario encuentra referencias internas a fases de desarrollo y terminología de ingeniería. Eso contradice visualmente la idea de producto terminado.

### En 30 segundos

**Positivo:** se percibe control sobre saldo, mes, presupuesto, futuro y cuentas; el tono de sólo lectura transmite respeto por la fuente bancaria.

**Negativo:** la jerarquía comercial no explica todavía por qué elegir Financial App frente a una hoja de cálculo avanzada o un agregador financiero. Se muestra “qué hay” antes de demostrar suficientemente “qué cambia para mí”.

### En 2 minutos

**Positivo:** aparecen señales de rigor poco comunes: saldo explícito vs reconstruido, transferencias excluidas del ahorro, confianza en recurrentes, previsión reconciliable y trazabilidad documental.

**Negativo:** parte de ese rigor se comunica como documentación técnica (`motores centrales`, `runtime`, `preflight`, `fase`, `datos autoritativos`) en vez de traducirse a confianza y beneficio.

### En 10 minutos

**Positivo:** el producto tiene profundidad funcional real.

**Negativo:** la ausencia de Análisis, onboarding, centro de atención unificado, patrimonio real y navegación plenamente coherente impide formar una narrativa premium completa de “entiendo mi dinero y sé qué hacer después”.

## Fortalezas de posicionamiento

1. **Integridad de datos como diferenciador.** La app evita inventar, mantiene fuente bancaria sólo lectura y conserva trazabilidad.
2. **Explicabilidad.** Recurrentes, balances, presupuesto y previsión explican origen/confianza en lugar de mostrar resultados mágicos.
3. **Orientación a decisión.** Inicio ya intenta seleccionar lo importante.
4. **Privacidad visible.** Acceso privado, documentos privados y conexión Google limitada son activos de confianza.
5. **Adaptación España.** es-ES, EUR y Europe/Madrid son coherentes y pueden convertirse en una ventaja si el producto se dirige al mercado español.

## Hallazgos

### MKT-001 — P1 · La UI expone el roadmap interno de desarrollo

**Área:** Percepción premium / confianza  
**Evidencia:** Inicio recibe y muestra `phaseLabel`; Recurrentes muestra `Fase 7 · Recurrentes`; Fuente oficial muestra `FASE 2 · FUENTE OFICIAL`; otras superficies siguen el mismo patrón de certificación por fases.  
**Consecuencia:** transmite beta interna, proyecto de ingeniería o prototipo aunque el módulo esté terminado. Un cliente de pago no necesita saber el número de fase para usar su dinero.  
**Recomendación:** eliminar referencias `Fase N` de la UI normal. Mantener versión, build, gates y fase en `/configuration/about`, diagnóstico interno o endpoint `/api/build`.  
**Esfuerzo:** Bajo.  
**Riesgo de regresión:** Muy bajo.  
**Prioridad:** P1 por percepción comercial; además es un quick win.  
**Criterio de aceptación:** ninguna pantalla orientada a usuario muestra números/nombres de fases internas salvo modo diagnóstico explícito.

### MKT-002 — P1 comercial · No existe narrativa de activación previa al producto

**Área:** Adquisición / primera impresión  
**Evidencia:** el punto de entrada comercial actual es un login privado. No existe experiencia pública de propuesta de valor, prueba guiada, demo segura, pricing, confianza, privacidad, FAQ o onboarding.  
**Consecuencia actual:** ninguna para una app personal cerrada.  
**Consecuencia comercial:** el usuario tendría que comprar/registrarse sin entender producto, confianza ni alcance.  
**Recomendación:** separar `marketing/public` de `app/private`. Para una hipotética venta: landing mínima, seguridad/privacidad, funciones clave, capturas/demo con datos ficticios, pricing/condiciones y CTA. No cargar marketing dentro de la app autenticada.  
**Esfuerzo:** Alto como lanzamiento, bajo para una demo mínima.  
**Riesgo de regresión:** Muy bajo si es superficie separada.  
**Prioridad:** P1 comercial.  
**Criterio de aceptación:** usuario nuevo entiende problema, valor, seguridad y siguiente paso antes de entregar credenciales financieras.

### MKT-003 — P2 · Lenguaje técnico invade mensajes orientados al usuario

**Área:** Copy / confianza  
**Evidencia:** expresiones como “motores centrales”, “runtime seguro”, “prevalidación”, “datos autoritativos”, “contrato validado” y “revisión” aparecen en superficies de uso.  
**Consecuencia:** la precisión técnica aporta transparencia, pero en exceso hace que el producto parezca una consola de QA y obliga al usuario a traducir ingeniería a beneficio.  
**Recomendación:** mantener detalle técnico disponible, pero traducir primer nivel a lenguaje de resultado: “Datos verificados”, “Sin cambios en tu banco”, “Actualización segura”, “No se ha importado nada porque la fuente cambió”.  
**Esfuerzo:** Medio por alcance de copy.  
**Riesgo de regresión:** Bajo si no se alteran códigos/errores.  
**Prioridad:** P2.  
**Criterio de aceptación:** un beta tester no técnico comprende cada mensaje sin necesitar vocabulario de desarrollo.

### MKT-004 — P2 · El nombre “Financial App” es descriptivo pero comercialmente poco diferenciador

**Área:** Marca / descubribilidad  
**Evidencia:** marca principal genérica y funcional.  
**Consecuencia:** comunica categoría, pero dificulta diferenciación, recuerdo, búsqueda, registro de dominio/marca y personalidad propia frente a productos establecidos.  
**Recomendación:** no renombrar durante la auditoría técnica. Antes de una salida comercial real, realizar naming/brand clearance y decidir si “Financial App” queda como nombre de proyecto o producto.  
**Esfuerzo:** Alto fuera de código si se cambia marca.  
**Riesgo de regresión:** Bajo técnicamente, alto de consistencia de marca.  
**Prioridad:** P2 comercial, no bloquea mejoras técnicas actuales.

### MKT-005 — P2 · El producto demuestra rigor pero todavía no lo convierte en una promesa diferenciada

**Área:** Posicionamiento  
**Evidencia:** existen controles reales de fuente read-only, inmutabilidad, overrides, balances explícitos, confianza y trazabilidad. Sin embargo, Inicio comunica principalmente “ver tu dinero” y no articula por qué esos controles son mejores para el usuario.  
**Consecuencia:** parte del trabajo técnico de alta calidad no se traduce en valor percibido.  
**Recomendación:** propuesta de valor provisional: **“Entiende tu dinero con datos verificables, sin tocar tu banco y sabiendo siempre de dónde sale cada cifra.”** Usarla como dirección, no como claim definitivo hasta validar con beta testers.  
**Esfuerzo:** Bajo.  
**Riesgo de regresión:** Ninguno técnico.  
**Prioridad:** P2.

### MKT-006 — P2 comercial · Falta prueba de confianza institucional

**Área:** Credibilidad  
**Evidencia:** hay seguridad técnica, pero no superficies de producto para privacidad, tratamiento de datos, retención/borrado, soporte, recuperación, estado del servicio y condiciones de uso.  
**Consecuencia:** un cliente no puede verificar fácilmente cómo se trata su información aunque el backend esté bien protegido.  
**Recomendación:** antes de comercializar: privacidad/condiciones, política de datos, soporte/contacto, proceso de borrado/exportación y estado/incidentes. Las afirmaciones de seguridad deben estar respaldadas por controles reales y no por frases genéricas como “bank-grade” sin evidencia.  
**Esfuerzo:** Alto multidisciplinar (legal/producto/ops).  
**Riesgo de regresión:** Ninguno técnico directo.  
**Prioridad:** P2/P1 según jurisdicción y modelo comercial.

### MKT-007 — P3 · Versionado visible debe pasar a nivel de soporte, no de identidad principal

**Área:** Percepción / soporte  
**Evidencia:** metadata y múltiples textos enfatizan 10.0.0/Fases.  
**Consecuencia:** la versión es útil para diagnóstico, pero no debe competir con el producto en la experiencia diaria.  
**Recomendación:** conservar versión/build en “Acerca de”, soporte, endpoint de build y logs; retirar de encabezados principales.  
**Esfuerzo:** Bajo.  
**Riesgo de regresión:** Muy bajo.  
**Prioridad:** P3 como cambio aislado; agrupado con MKT-001 pasa a quick win P1 comercial.

## Posicionamiento recomendado para validar

Financial App no debería intentar competir diciendo “también tengo presupuestos y gráficas”. Ese terreno ya está cubierto.

La diferenciación más defendible que ya existe técnicamente es:

- datos financieros verificables;
- fuente original sólo lectura;
- cambios manuales reversibles/superpuestos;
- explicabilidad de cálculos;
- previsión con origen/confianza;
- experiencia diseñada para España.

Dirección de posicionamiento:

> **Control financiero personal fiable y explicable: saber qué tienes, qué ha cambiado, por qué y qué viene después, sin alterar la fuente bancaria.**

## Estado de fase

Marketing: **COMPLETADA** para la primera ronda de auditoría.

Estado comercial: **NO APTA**.
