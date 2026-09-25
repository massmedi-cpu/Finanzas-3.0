# 37 · Ampliación funcional — Comparador financiero

Fecha: 2026-09-25 (Europe/Madrid)

## Estado

**IMPLEMENTACIÓN, CONTRATO, COMPILACIÓN Y REGRESIONES PURAS COMPLETADOS EN LA RAMA DE RECUPERACIÓN. RECORRIDO VISUAL PREPARADO Y PENDIENTE DE UN RUNNER CON CHROMIUM.**

El bloque añade un Comparador financiero de solo lectura sin alterar el modelo de datos, las migraciones, el gateway Edge ni los permisos. `main` y Production permanecen sin cambios y este bloque no se ha desplegado.

## Semántica financiera

- Compara un periodo principal con una referencia anterior elegida por el usuario.
- La referencia debe terminar antes de que empiece el periodo principal; no se aceptan solapamientos.
- Ningún periodo puede contener fechas futuras ni superar 366 días.
- El estado inicial contrasta el mes en curso hasta hoy con el mismo tramo del mes anterior, ajustando correctamente el último día en meses más cortos y años bisiestos.
- Los importes totales se conservan como hechos del periodo y se acompañan de un ritmo diario normalizado. Un periodo puede gastar más en total y menos por día sin que la interfaz confunda ambos hechos.
- Las diferencias de ingresos, gasto, neto operativo, ahorro y tasa de ahorro se calculan de forma determinista; un denominador cero produce `null`, nunca `NaN` o `Infinity`.
- Categorías y comercios se ordenan por el cambio absoluto que explican y cada lado enlaza a los movimientos exactos que lo componen.

## Integridad y arquitectura

- El loader realiza exactamente una operación `financial.snapshot` con dos rangos explícitos y reutiliza el motor agregado central.
- No existe una segunda suma en React ni una consulta por tarjeta o driver.
- El contrato v1 valida calendario, duración, orden, cuenta, periodos devueltos, métricas derivadas, ritmos diarios, drivers, cuentas y principios de procedencia.
- El gasto por categorías debe reconciliar al céntimo contra el total tanto en el periodo principal como en la referencia. Cualquier divergencia aborta la respuesta con `comparison_reconciliation_failed`.
- La API sólo admite cinco parámetros conocidos, responde con `private, no-store`, expone versión contractual y declara una única operación de datos.
- Las fuentes bancarias permanecen de solo lectura y el resultado declara expresamente que no usa IA generativa.

## Experiencia integrada

- Nueva ruta `/compare` y endpoint `/api/compare`.
- Entrada en navegación desktop/móvil, favoritos móviles, búsqueda global y shortcut PWA.
- Enlace contextual desde Análisis que conserva ambos periodos y la cuenta cuando están disponibles.
- Retorno contextual a Análisis, Movimientos de cada periodo y Cash Flow.
- Cuatro métricas comparativas, lectura principal normalizada, tablas de categorías y comercios, trazabilidad por ambos lados y sello de reconciliación.
- Acciones rápidas para recuperar el mes actual frente al anterior y generar una referencia inmediatamente anterior de igual duración.
- La URL se actualiza sólo después de una respuesta válida y queda lista para recuperar o compartir la selección.
- Peticiones abortables y secuenciadas impiden que una respuesta antigua reemplace filtros más recientes.
- Estados de carga, recuperación, error, datos vacíos y refresco conservan la comparación vigente y no realizan mutaciones.

Además, el drill-down existente de Análisis para `Sin categoría` se ha alineado con el contrato público `uncategorized=true`; deja de emitir el sentinel interno `__uncategorized__` como si fuera un UUID.

## Evidencia ejecutada

- `npm run test:comparison`: **10 passed, 0 failed**.
- Regresión focal de Análisis y navegación contextual: **7 passed, 0 failed**.
- Regresión PRE-025 de importes cero, capacidad, rollback, sesión y límites: **8 passed, 0 failed**.
- `npm run typecheck`: **SUCCESS**.
- `npm run build`: **SUCCESS** con Next.js 16.3.4; `/compare` y `/api/compare` aparecen como rutas dinámicas compiladas.
- `npx playwright test tests/e2e/comparison-ui.spec.ts --project=chromium-desktop --list`: **6 pruebas descubiertas y compiladas**.

Los diez contratos ejecutados cubren calendario y bisiesto, periodos adversariales, normalización diaria, reconciliación bilateral, drill-down, una sola operación de datos, rechazo de números no finitos, integración de navegación, workspace sin actividad y validación estricta de API.

## Gate visual pendiente

`comparison-ui.spec.ts` prepara el recorrido real de navegador para:

- lectura financiera, métricas y trazabilidad;
- rechazo de periodos solapados sin perder el resultado vigente;
- referencia equivalente y actualización de URL;
- composición sin overflow a 360, 430 y 1.440 px.

Este entorno no dispone del ejecutable Chromium y ya se confirmó esa limitación en bloques anteriores. Por tanto, el recorrido se ha compilado y enumerado, pero no se declara evidencia visual real ni hidratación de navegador.

El comando preparado es `npm run test:comparison:ui`.

No se ha creado un Preview de Vercel para sustituir ese gate ni se han consumido créditos de publicación.
