# Financial App — Fundamentos 0.0.1

## Estado

- Versión: `0.0.1`
- Fase: `1 — Fundamentos`
- Rama de trabajo: `rebuild/phase-1-foundations`
- Producción: no modificar hasta validación de preview
- OCR: fuera del camino crítico; Fase 11
- Esquema persistente: definido como migraciones reproducibles, todavía no aplicadas

## Principios ya materializados en código

1. La fuente bancaria es externa, inmutable y de solo lectura.
2. Los movimientos se modelan en tres capas:
   - instantáneas originales de origen;
   - transacción procesada/normalizada;
   - modificación explícita del usuario.
3. Las modificaciones del usuario no sobrescriben el dato bancario original.
4. El usuario puede corregir o vaciar expresamente categoría/comercio sin perder la distinción entre “sin override” y “valor borrado por el usuario”.
5. Si una fila histórica cambia en la fuente externa, Financial App no reescribe la observación anterior: añade una nueva instantánea inmutable enlazada a la anterior.
6. Las transferencias internas no se consideran ingreso/gasto por defecto.
7. Sincronización futura: incremental, idempotente y conservadora de overrides.
8. La identidad de una fila bancaria y su fingerprint SHA-256 son deterministas: misma identidad + mismo fingerprint se ignora; misma identidad + fingerprint distinto crea una revisión inmutable.
9. Una sola capa central de formato regional es-ES.
10. Dinero en lógica de aplicación: céntimos enteros seguros.
11. Moneda visual: EUR con exactamente dos decimales.
12. Fecha visual: DD/MM/AAAA en zona Europe/Madrid.
13. Diseño y responsive nacen desde el primer componente mediante tokens globales.
14. Build, rama y commit son identificables desde la propia aplicación y `/api/build`.
15. Cuentas y categorías tienen políticas de unicidad, reordenación e integridad jerárquica antes de persistir.
16. Los comandos de aplicación de cuentas/categorías normalizan entradas y preparan objetos persistibles sin duplicar reglas de dominio.
17. La build ejecuta las comprobaciones de fundamentos y falla si alguna deja de cumplirse.

## Fuente lógica de verdad

| Dominio | Fuente lógica |
| --- | --- |
| Cuentas | `accounts` |
| Instantáneas bancarias originales | `transaction_source_records` |
| Movimientos procesados | `transactions` |
| Correcciones del usuario | `transaction_overrides` |
| Categorías | `categories` |
| Comercios | `merchants` |
| Presupuestos | `budgets` |
| Recurrentes | `recurrences` |
| Previsiones | `forecast_items` |
| Documentos | `documents` |
| Asociación documento/movimiento | `document_transaction_associations` |
| Ejecuciones de sincronización | `sync_runs` |
| Cursor incremental | `sync_cursors` |
| Auditoría | `audit_changes` |

La proyección efectiva del movimiento sigue siendo una responsabilidad única del dominio (`resolveEffectiveTransaction`); la base de datos conserva las tres capas y no introduce una segunda lógica financiera paralela.

## Persistencia reproducible

Las migraciones de `supabase/migrations/` dejan preparada la estructura física de Fundamentos:

### 000001 — estructura base

- esquema aislado `financial_app`;
- claves primarias y foráneas;
- restricciones de tipos/estados;
- importes en céntimos dentro del rango entero seguro de JavaScript;
- unicidad normalizada de cuentas, categorías y aliases;
- jerarquía de categorías sin ciclos y con tipo coherente;
- registros bancarios protegidos contra `UPDATE` y `DELETE` también a nivel de base de datos;
- índices para fechas, revisión, duplicados y sincronización;
- auditoría y cursor incremental;
- metadata fija `es-ES`, `EUR`, `Europe/Madrid`, versión `0.0.1` y objetivo `10.0.0`;
- acceso denegado por defecto a `anon`/`authenticated`; la apertura de acceso deberá hacerse de forma explícita cuando exista un modelo de autenticación validado.

### 000002 — historial inmutable de correcciones de origen

- `source_row_identity` estable para identificar la misma fila externa entre sincronizaciones;
- `source_fingerprint` SHA-256 validado;
- `supersedes_source_record_id` para enlazar correcciones externas sin reescribir observaciones anteriores;
- historial indexado por identidad y fecha de importación;
- idempotencia por identidad + fingerprint;
- se elimina la antigua unicidad que impedía conservar dos observaciones de la misma fila cuando el banco corrige el contenido.

Las migraciones están versionadas en Git pero **no se han aplicado** sobre el Supabase compartido actual. Su sintaxis y constraints siguen pendientes de prueba real contra PostgreSQL/Supabase dedicado; no se consideran validadas físicamente hasta entonces.

## Cuentas y categorías

Ya existe una capa de comandos de aplicación que prepara altas y ediciones de cuentas/categorías con:

- normalización de espacios y texto;
- EUR forzado en cuentas;
- unicidad de nombre;
- jerarquía de categorías sin ciclos;
- coherencia del tipo padre/hijo;
- fusión solo entre categorías compatibles;
- reordenación sin pérdidas, duplicados ni elementos añadidos;
- conservación de `createdAt` y actualización controlada de `updatedAt`.

Falta conectar estos comandos a repositorios reales y a la interfaz. No se marca como completado hasta comprobar persistencia real.

## Supabase

El proyecto Supabase actualmente conectado contiene tablas de otros desarrollos y un manifiesto previo de Financial App. No se ha reutilizado ninguna tabla ni se ha realizado ninguna modificación estructural durante esta reconstrucción.

La opción arquitectónica recomendada continúa siendo un **proyecto Supabase dedicado exclusivamente a Financial App**. Crear el proyecto puede consumir cuota o generar coste según el plan, por lo que la creación real requiere autorización explícita. Hasta entonces, las migraciones permanecen preparadas y comprobables en Git sin tocar infraestructura compartida.

## Responsive base

Breakpoints de referencia compartidos:

- 360 px: móvil pequeño
- 480 px: móvil grande
- 768 px: tablet vertical
- 1024 px: tablet horizontal
- 1280 px: portátil
- 1440 px: escritorio
- 1728 px: pantalla ancha

Los componentes pueden adaptarse de forma fluida entre estos puntos; no se usarán como fotografías aisladas.

## Siguiente bloque de Fase 1

1. Crear el Supabase dedicado cuando exista autorización explícita de cuota/coste.
2. Aplicar y verificar las migraciones reproducibles en el proyecto nuevo.
3. Implementar los repositorios reales de cuentas y categorías contra esa persistencia.
4. Completar alta/edición/archivo/orden de cuentas y categorías sin borrados destructivos.
5. Probar que una relectura idéntica no duplica y que una corrección externa crea una revisión inmutable conservando overrides.
6. Validar preview, responsive y regresión antes de cerrar Fase 1.
