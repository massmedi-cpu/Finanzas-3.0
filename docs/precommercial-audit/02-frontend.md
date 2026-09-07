# 02 · Auditoría frontend

## Dictamen

El frontend 10.0.0 tiene una base visual y responsive claramente trabajada: tamaños tipográficos y targets táctiles están tokenizados, las tablas críticas cambian a tarjetas en móvil, existen estados vacíos/carga/error en los módulos principales y los cambios financieros se explican al usuario. No es correcto tratarlo como un frontend roto o improvisado.

Los hallazgos principales están en **concurrencia de peticiones, contratos API duplicados, componentes cliente sobredimensionados y estados globales de navegación/error no personalizados**.

## Fortalezas verificadas

- `src/design/tokens.ts` define breakpoints 360/480/768/1024/1280/1440/1728, tipografía, spacing, radios, motion y targets de 44/48 px.
- Movimientos convierte la tabla de escritorio en bloques responsivos a <=900 px y apila controles a <=600 px; no se limita a overflow horizontal.
- Documentos usa contadores de secuencia (`listSequence`, `detailSequence`) para ignorar respuestas obsoletas.
- Dashboard carga sus cinco motores de forma paralela y cancela actualizaciones de estado al desmontarse.
- Configuración reutiliza tipos y validadores reales de `src/domain` y el parser monetario central, evitando duplicar reglas de negocio críticas.
- Los estados de error y éxito usan `role="alert"` / `role="status"` en superficies relevantes.
- Las ediciones de movimientos explican que actúan sobre overrides y no sobre la fuente bancaria.

## Hallazgos

### FE-001 — P2 · Movimientos puede aceptar una respuesta de listado obsoleta

**Área:** Estado / peticiones / concurrencia  
**Archivo:** `app/transactions/transactions-client.tsx`  
**Evidencia:** `fetchPage()` no usa `AbortController`, request id ni secuencia. `applyFilters()`, `clearFilters()`, recargas tras mutaciones y paginación pueden lanzar peticiones sucesivas; la última respuesta que finalice ejecuta `setRows`, aunque corresponda a un filtro anterior. Documentos ya demuestra el patrón correcto mediante `listSequence`/`detailSequence`.  
**Consecuencia:** Con red lenta o interacción rápida el listado puede mostrar temporalmente resultados que no corresponden al filtro actualmente aplicado. No se ha demostrado corrupción de datos, pero sí riesgo de UI stale.  
**Recomendación:** incorporar control de secuencia/abort para replace-page y separar la secuencia de append pagination.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Bajo con prueba determinista de respuestas fuera de orden.  
**Criterio de aceptación:** si una petición A comienza antes que B y termina después, A no puede sobrescribir el estado producido por B.

### FE-002 — P2 · Componentes cliente con demasiadas responsabilidades

**Área:** Mantenibilidad / frontend architecture  
**Archivos:** `app/transactions/transactions-client.tsx` (~39 KB), `app/documents/documents-client.tsx` (~28 KB), `app/configuration/configuration-client.tsx` (~24 KB)  
**Evidencia:** Movimientos concentra contratos de respuesta, formateadores, filtros, query building, edición individual, edición masiva, revisión de duplicados, transferencias, paginación y render completo. Documentos concentra subida, listado, detalle, metadatos, asociaciones y búsqueda manual.  
**Consecuencia:** aumenta el coste y el radio de regresión de futuras mejoras; no implica por sí solo un bug actual.  
**Recomendación:** extraer por responsabilidad sólo cuando exista una frontera estable: contratos/cliente API, hook de listado, editor y paneles de revisión. Evitar una fragmentación artificial en componentes diminutos.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Medio.  
**Criterio de aceptación:** cada extracción mantiene exactamente los mismos flujos E2E y reduce estado/efectos cruzados en el componente raíz.

### FE-003 — P2 · Contratos API redefinidos en la UI

**Área:** TypeScript / contrato cliente-servidor  
**Evidencia:** Dashboard, Movimientos y Documentos vuelven a declarar localmente DTOs como `TransactionRow`, snapshots y payloads; en Movimientos `readableError(payload: any)` acepta un payload sin contrato. Configuración, en cambio, ya importa tipos del dominio central.  
**Consecuencia:** un cambio de API puede compilar en servidor y romper silenciosamente una pantalla porque el cast local no valida el runtime.  
**Recomendación:** crear contratos DTO compartidos por endpoint y guards/parsers mínimos para respuestas críticas. No exponer modelos de persistencia directamente al cliente.  
**Esfuerzo:** Medio.  
**Riesgo de regresión:** Bajo/medio.  
**Criterio de aceptación:** servidor y cliente importan un contrato común; respuestas estructuralmente inválidas producen error controlado en vez de datos parciales.

### FE-004 — P2 comercial · 404 global no personalizada

**Área:** Calidad percibida / navegación / copy  
**Evidencia:** no existe `app/not-found.tsx`. Una respuesta real de `/login` incluye el fallback estándar de Next para 404 (`404: This page could not be found.`), con estilos genéricos del framework.  
**Consecuencia:** una ruta inexistente rompe de inmediato la identidad visual, el idioma español y la percepción de producto premium.  
**Recomendación:** añadir 404 propia usando el sistema visual existente y acceso claro a Inicio.  
**Esfuerzo:** Bajo.  
**Riesgo de regresión:** Muy bajo.  
**Criterio de aceptación:** una ruta inexistente muestra una pantalla Financial App coherente, española, accesible y con recuperación a Inicio.

### FE-005 — P2 comercial · No existen límites globales de carga/error del App Router

**Área:** Resiliencia / feedback  
**Evidencia:** no se han encontrado `app/loading.tsx` ni `app/error.tsx`. Los módulos controlan sus errores internos, pero un error de render/server component fuera de esos catches cae en la experiencia del framework.  
**Consecuencia:** estados excepcionales no controlados pueden salir de la identidad visual y ofrecer poca orientación al usuario.  
**Recomendación:** añadir `loading.tsx` y `error.tsx` globales sobrios, sin esconder los estados específicos ya existentes.  
**Esfuerzo:** Bajo.  
**Riesgo de regresión:** Bajo.  
**Criterio de aceptación:** navegación suspendida y error de segmento tienen feedback coherente, foco/semántica correctos y opción de reintentar/volver.

### FE-006 — P3 · Cliente de red y traducción de errores inconsistentes entre módulos

**Área:** UX / mantenibilidad  
**Evidencia:** Movimientos implementa `readableError`, Documentos `readJson` + `friendlyError`, Configuración `requestConfiguration`, Dashboard otro `readJson<T>`.  
**Consecuencia:** mensajes, tratamiento de 401/503 y validación de payload pueden divergir con el tiempo.  
**Recomendación:** un helper mínimo compartido para parseo de error/status y dejar la traducción de copy específica de cada dominio en cada módulo.  
**Esfuerzo:** Bajo/medio.  
**Riesgo de regresión:** Bajo.  
**Criterio de aceptación:** 401/403/429/503 y JSON inválido siguen una política uniforme sin borrar mensajes de dominio útiles.

## Primer bloque de implementación seguro

Se consideran de bajo riesgo y alto retorno inmediato:

1. `app/not-found.tsx` personalizado.
2. `app/loading.tsx` global coherente con el sistema visual.
3. `app/error.tsx` con recuperación y sin filtrar información técnica.
4. Pruebas E2E de estos estados donde sea determinista.

FE-001 debe corregirse también, pero sólo junto a una prueba que fuerce respuestas fuera de orden; no se hará un cambio ciego dentro del componente de Movimientos.

## Estado de fase

Frontend: **COMPLETADA** para la primera ronda de auditoría. La implementación de los hallazgos se ejecutará por bloques tras priorización y regresión.
