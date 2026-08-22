# Financial App 2.1.0 — baseline y optimizaciones de rendimiento

## Principio

Las optimizaciones de 2.1.0 deben reducir trabajo redundante sin alterar reglas financieras, fuente bancaria, edición privada ni contratos de recuperación. Las cifras de este documento son muestras de diagnóstico sobre el dataset real en el momento de la medición; no son SLA.

## Movimientos — baseline B3

Dataset medido: 3.139 movimientos.

Respuesta inicial de `financial_app_movements_advanced_v14` con 50 movimientos:

- Tamaño JSONB total: 81.921 bytes.
- `items`: 69.775 bytes.
- `facets`: 11.896 bytes.
- Contrapartes/comercios en facetas: 326.
- Tiempo PostgreSQL observado de la RPC completa: ~70,8 ms.
- Tiempo observado del bloque que reconstruye facetas globales: ~17,7 ms.

Las facetas representan aproximadamente un 14,5 % del tamaño de la respuesta de referencia y alrededor de una cuarta parte del tiempo SQL observado. Estas facetas son globales y no cambian al pasar de página o modificar un filtro dentro de la misma sesión de Movimientos.

## Cambio aplicado

- La carga SSR inicial conserva la RPC y el contrato 2.0.1 completos para obtener facetas y primera página.
- `MovementsClient` solicita `facets=0` en paginaciones, filtros y recargas posteriores.
- El API mantiene la RPC estable 2.0.1 y elimina `facets` de esas respuestas posteriores.
- El cliente conserva las facetas obtenidas en la primera carga y las reutiliza; filtros, edición, splits, conciliación, documentos y búsqueda mantienen el mismo contrato visible.

Resultado esperado: aproximadamente 11,9 KB menos de JSONB no comprimido por petición posterior de Movimientos, sin cambiar cálculos ni datos.

## Decisión sobre una RPC page-only

Se estudió eliminar también el cálculo SQL de facetas en peticiones posteriores. El intento de generar dinámicamente una RPC derivada fue rechazado por PostgreSQL antes de aplicar cambios, por lo que no quedó ninguna función parcial en producción.

Para 2.1.0 no se introduce una RPC duplicada o generada dinámicamente: el ahorro adicional (~17,7 ms en la muestra) no compensa aumentar superficie de base de datos antes de la release estable. Si el volumen futuro hace insuficiente este rendimiento, la optimización deberá implementarse como SQL explícito, reproducible y auditado, nunca mediante reescritura dinámica de `pg_get_functiondef`.

## Navegación y shell

- Prefetch automático de las 14 rutas privadas desactivado.
- Prefetch solo ante intención real del usuario (hover, foco o touch).
- 16 `AppSidebar` redundantes eliminados de páginas privadas; queda un único sidebar persistente en `AppChrome`.

Estas dos mejoras reducen trabajo anticipado y markup/componentes duplicados durante cambios de sección sin modificar los RPC financieros.
