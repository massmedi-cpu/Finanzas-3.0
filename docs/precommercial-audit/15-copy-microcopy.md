# 15 · Auditoría de copy y microcopy

## Dictamen

El copy actual es preciso y honesto en muchas operaciones críticas, pero está escrito parcialmente para quien desarrolló/auditó la aplicación. Antes de una salida comercial debe conservar la transparencia técnica mientras **sube a primer plano lo que significa para el usuario**.

## Fortalezas verificadas

- Login no revela qué credencial concreta es incorrecta.
- Fuente bancaria comunica repetidamente que es sólo lectura y que un fallo no se da por exitoso.
- Movimientos explica que las ediciones viven en la capa de overrides y no modifican la fuente.
- Recurrentes diferencia candidato/confianza/confirmación.
- Previsión explica exclusiones, conciliación y origen de elementos.
- Estados vacíos suelen evitar inventar datos (“No hay movimientos previstos…”, “No se inventan movimientos”).
- Errores de dominio importantes se traducen a mensajes humanos en Movimientos/Fuente.

## Hallazgos

### COPY-001 — P1 · Referencias a fases/versiones internas en copy de usuario

**Evidencia:** encabezados como `FASE 4 · MOVIMIENTOS`, `FASE 7 · RECURRENTES`, `FINANCIAL APP · FASE 8`, `FASE 10 · CUENTAS`, `FASE 2 · FUENTE OFICIAL`.  
**Consecuencia:** producto en construcción/QA, no software acabado.  
**Recomendación:** eliminar de UI de usuario y conservar versión/fase sólo en Acerca de/Diagnóstico/build.  
**Criterio:** ninguna pantalla diaria expone nomenclatura de proyecto interno.

### COPY-002 — P1 · “Disponible total” no corresponde a una definición demostrada de disponibilidad

**Evidencia:** Inicio y Cuentas etiquetan `activeBalanceCents` como “Disponible total”. El agregado incluye todos los tipos activos admitidos por el modelo.  
**Consecuencia:** puede interpretarse como dinero libre para gastar.  
**Recomendación inmediata:** “Saldo total en cuentas” o “Saldo agregado”. Cuando exista un motor `availableToSpend`, podrá recuperarse “Disponible”.  
**Criterio:** cada término financiero principal tiene definición documentada coincidente con su cálculo.

### COPY-003 — P1 · “Patrimonio disponible” es semánticamente incorrecto

**Evidencia:** Cuentas utiliza `PATRIMONIO DISPONIBLE` sobre el listado de cuentas/saldos. No existe motor de activos - pasivos.  
**Consecuencia:** confunde saldo bancario con net worth/patrimonio.  
**Recomendación:** “CUENTAS ACTIVAS”, “SALDOS” o “TUS CUENTAS”; reservar Patrimonio a PROD-005.  
**Criterio:** la palabra patrimonio sólo aparece donde existan activos/pasivos y cálculo trazable.

### COPY-004 — P2 · Exceso de lenguaje de ingeniería en primer nivel

**Evidencia:** “motores centrales”, “runtime seguro”, “prevalidación”, “datos autoritativos”, “contrato validado”, “fingerprint”, “snapshot” y lenguaje de fase aparecen en UI o diagnóstico muy visible.  
**Consecuencia:** carga cognitiva y aspecto de consola técnica.  
**Recomendación:** primer nivel: “Datos verificados”, “Fuente conectada”, “Actualización segura”, “No se ha importado nada porque la estructura cambió”. Segundo nivel desplegable: motor, runtime, revisión, fingerprint, ids.  
**Criterio:** usuario no técnico puede actuar sin comprender términos de arquitectura.

### COPY-005 — P2 · “Fuente bancaria preferente” es innecesariamente abstracto

**Evidencia:** Inicio muestra “Fuente bancaria preferente” junto al saldo. Cuentas ya utiliza una frase más concreta: “Saldo confirmado por el banco”.  
**Consecuencia:** no queda claro qué se prefiere ni frente a qué.  
**Recomendación:** “Saldo confirmado por el banco · [fecha]” o “Saldo bancario · [fecha]”.  
**Criterio:** origen del dato entendido sin documentación.

### COPY-006 — P2 · Recuperación de error no siempre tiene CTA coherente

**Evidencia:** Inicio ante fallo ofrece “Abrir Cuentas”, aunque el problema puede ser presupuesto/previsión/transacciones. No existe reintento global.  
**Consecuencia:** el mensaje informa pero no resuelve.  
**Recomendación:** estructura estándar: Qué ha pasado → qué se conserva → Reintentar → alternativa. No usar CTA irrelevante sólo por tener uno.  
**Criterio:** todo error recuperable explica la siguiente acción válida.

### COPY-007 — P2 · Términos ingleses de producto deben jerarquizarse

**Evidencia:** “cash flow”, “runtime”, “preflight” conviven con copy español. Algunos son útiles internamente, pero no necesarios en primer nivel.  
**Recomendación:** preferir “flujo de caja”, “comprobación técnica”, “validación previa” en UI normal; conservar términos exactos en diagnóstico si ayudan a soporte.  
**Criterio:** es-ES consistente sin perder precisión técnica.

### COPY-008 — P2 · Estados vacíos deben convertirse en orientación cuando falta configuración

**Evidencia:** existen vacíos correctos (“Sin categorías…”, “No hay movimientos…”), pero una app comercial debe distinguir “no hay datos porque aún no configuraste X” de “hay datos y el resultado del filtro es cero”.  
**Consecuencia:** un usuario nuevo puede no saber si debe actuar.  
**Recomendación:** empty state contextual con CTA sólo cuando existe una acción segura. Ej.: “Todavía no has creado un presupuesto para septiembre · Crear presupuesto”.  
**Criterio:** estados cero diferencian ausencia real, filtro vacío y configuración pendiente.

### COPY-009 — P2 · Confirmaciones de mutación deben indicar consecuencia, no sólo éxito

**Evidencia:** muchos mensajes ya lo hacen bien, pero conviene normalizar. Ejemplo positivo: “Los movimientos ya importados permanecen intactos” al desconectar Google.  
**Recomendación:** estándar: acción + alcance + qué no cambió cuando sea relevante. Ej.: “Categoría actualizada en 12 movimientos. La fuente bancaria no se ha modificado.” para cambios sensibles.  
**Criterio:** el usuario entiende el efecto de cada mutación sin revisar la base de datos.

### COPY-010 — P3 · Mensajes de calidad deberían priorizar impacto sobre implementación

**Evidencia:** “diferencia de reconstrucción”, “saldo explícito”, “revisión bancaria actual” son técnicamente precisos.  
**Recomendación:** mantener exactitud, pero empezar por impacto: “El saldo del banco no coincide con la suma reconstruida. Mostramos el saldo del banco; puedes revisar la diferencia.” Detalle técnico secundario.  
**Criterio:** alertas responden primero “¿me afecta?” y después “¿cómo se calcula?”.

## Guía de tono resultante

- Claro y específico.
- Sin lenguaje infantil ni exageraciones.
- No afirmar seguridad/perfección sin evidencia.
- No llamar “recomendación” a una media histórica.
- No llamar “patrimonio” a saldo.
- No llamar “disponible” a saldo agregado.
- Explicar siempre qué puede hacer el usuario después.
- Mantener trazabilidad técnica accesible bajo demanda.

## Estado de fase

Copy/microcopy: **COMPLETADA** para la primera ronda.

Estado comercial: **NO APTA**.
