# Financial App — Fundamentos 0.0.1

## Estado

- Versión: `0.0.1`
- Fase: `1 — Fundamentos`
- Rama de trabajo: `rebuild/phase-1-foundations`
- Producción: no modificar hasta validación de preview
- OCR: fuera del camino crítico; Fase 11
- Persistencia física: SQL de Fundamentos definido como blueprints pre-migración; todavía no generado ni aplicado como historial oficial de Supabase

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
17. La build ejecuta las comprobaciones de Fundamentos y falla si alguna deja de cumplirse.

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

## Blueprints SQL pre-migración

Los archivos de `supabase/blueprints/` contienen el SQL preparado de Fundamentos, pero **no forman parte todavía del historial oficial de migraciones de Supabase**. Esto es deliberado: el entorno actual no dispone de Supabase CLI ni de PostgreSQL local, y el proyecto Supabase dedicado aún no existe. No se inventan nombres de migración ni se da por validada una migración que no se ha ejecutado.

### `financial_app_foundations.sql` — estructura base

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
- acceso denegado por defecto a `anon`/`authenticated`; cualquier exposición posterior deberá diseñarse explícitamente con el modelo de autenticación y RLS correspondiente.

### `source_snapshot_history.sql` — historial inmutable de correcciones de origen

- `source_row_identity` estable para identificar la misma fila externa entre sincronizaciones;
- `source_fingerprint` SHA-256 validado;
- `supersedes_source_record_id` para enlazar correcciones externas sin reescribir observaciones anteriores;
- historial indexado por identidad y fecha de importación;
- idempotencia por identidad + fingerprint;
- retirada de la unicidad que impediría conservar dos observaciones de una misma fila cuando la fuente corrige su contenido.

### Suite de integridad preparada

`supabase/tests/foundation_integrity.sql` está preparada para ejecutarse con `BEGIN`/`ROLLBACK` y comprobar en una base PostgreSQL/Supabase real:

- metadata regional y política bancaria `read_only`;
- unicidad normalizada de cuentas;
- coherencia y ausencia de ciclos en categorías;
- bloqueo de `UPDATE` y `DELETE` sobre la capa bancaria original;
- creación de una nueva instantánea cuando una fila externa cambia;
- rechazo de una observación idéntica repetida;
- persistencia del borrado explícito de categoría/comercio mediante overrides.

La suite **todavía no se considera superada** porque no existe en el entorno actual un PostgreSQL real donde ejecutarla.

## Flujo obligatorio de migración Supabase

Cuando exista el proyecto Supabase dedicado:

1. Verificar changelog, documentación y comandos Supabase vigentes.
2. Crear la migración mediante el mecanismo oficial disponible en ese momento (`supabase migration new ...` si se usa CLI, o el flujo MCP/documentado equivalente).
3. Revisar e incorporar el SQL de los blueprints en la migración oficial generada.
4. Aplicar únicamente al proyecto dedicado de Financial App; nunca al Supabase compartido actual.
5. Ejecutar `supabase/tests/foundation_integrity.sql` y comprobar el resultado real.
6. Ejecutar advisors de base de datos/seguridad y corregir cualquier hallazgo aplicable.
7. Solo entonces considerar la persistencia física de Fundamentos validada.

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

La opción arquitectónica recomendada continúa siendo un **proyecto Supabase dedicado exclusivamente a Financial App**. Crear el proyecto puede consumir cuota o generar coste según el plan, por lo que la creación real requiere autorización explícita. Hasta entonces, los blueprints permanecen versionados en Git sin tocar infraestructura compartida.

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
2. Generar la migración oficial con el flujo Supabase vigente e incorporar los blueprints revisados.
3. Aplicar y verificar la estructura en el proyecto nuevo, ejecutar la suite SQL y advisors.
4. Implementar los repositorios reales de cuentas y categorías contra esa persistencia.
5. Completar alta/edición/archivo/orden de cuentas y categorías sin borrados destructivos.
6. Probar que una relectura idéntica no duplica y que una corrección externa crea una revisión inmutable conservando overrides.
7. Validar preview, responsive y regresión antes de cerrar Fase 1.
