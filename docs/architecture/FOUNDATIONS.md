# Financial App — Fundamentos 0.0.1

## Estado

- Versión: `0.0.1`
- Fase: `1 — Fundamentos`
- Rama de trabajo: `rebuild/phase-1-foundations`
- Producción: no modificar hasta validación de preview
- OCR: fuera del camino crítico; Fase 11
- Supabase dedicado: `financial-app` (`btzukbfesxdratqnxuoj`) en `eu-west-3`
- Persistencia física: creada y validada sobre el proyecto Supabase dedicado
- Persistencia de Configuración: repositorios PostgreSQL + servicio de aplicación implementados y compilados

## Principios ya materializados en código y base de datos

1. La fuente bancaria es externa, inmutable y de solo lectura.
2. Los movimientos se modelan en tres capas: instantáneas originales de origen, transacción procesada/normalizada y modificación explícita del usuario.
3. Las modificaciones del usuario no sobrescriben el dato bancario original.
4. El usuario puede corregir o vaciar expresamente categoría/comercio sin perder la distinción entre “sin override” y “valor borrado por el usuario”.
5. Si una fila histórica cambia en la fuente externa, Financial App añade una nueva instantánea inmutable enlazada a la anterior.
6. Las transferencias internas no se consideran ingreso/gasto por defecto.
7. La sincronización se diseña incremental, idempotente y conservadora de overrides.
8. Identidad de fila + fingerprint SHA-256: repetición idéntica se omite; contenido corregido crea una revisión inmutable.
9. Formato regional único: es-ES, EUR, Europe/Madrid, DD/MM/AAAA y dos decimales monetarios.
10. Dinero en lógica de aplicación: céntimos enteros seguros.
11. Diseño/responsive nacen desde el primer componente mediante tokens globales.
12. Build, rama y commit son identificables desde la aplicación y `/api/build`.
13. Cuentas y categorías tienen validación, unicidad, orden e integridad jerárquica antes y durante la persistencia.
14. La fusión de categorías prohíbe destino igual, tipo incompatible y fusión de una categoría dentro de una descendiente.
15. Los comandos y el servicio de Configuración centralizan alta, edición, archivo, reordenación y fusión sin borrados destructivos.
16. Los repositorios PostgreSQL traducen el dominio a `financial_app.accounts` y `financial_app.categories` sin introducir reglas financieras paralelas.
17. La build ejecuta las comprobaciones de Fundamentos y falla si alguna deja de cumplirse.
18. PostgreSQL ejecuta suites de integridad con rollback y sin dejar datos ficticios.
19. Las funciones de base fijan `search_path`; Security Advisor queda sin lints.
20. Las claves foráneas relevantes disponen de índices de cobertura.

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

La proyección efectiva del movimiento sigue siendo responsabilidad única del dominio (`resolveEffectiveTransaction`).

## Supabase dedicado y migraciones aplicadas

Proyecto exclusivo:

- Nombre: `financial-app`
- Project ref: `btzukbfesxdratqnxuoj`
- Región: `eu-west-3`
- Coste confirmado al crearlo: `0 €/mes`
- El Supabase compartido anterior no se ha modificado.

Historial oficial remoto y archivos en `supabase/migrations/`:

1. `20260903200004_financial_app_foundations.sql`
2. `20260903200023_source_snapshot_history.sql`
3. `20260903200134_harden_function_search_paths.sql`
4. `20260903200201_index_foreign_keys.sql`

La estructura física incluye 17 tablas en el esquema privado `financial_app`, metadata `0.0.1 → 10.0.0`, `es-ES`, `EUR`, `Europe/Madrid`, claves, constraints, auditoría, cursores, índices y protección bancaria.

## Validación física

### Suite general

`supabase/tests/foundation_integrity.sql` se ejecutó contra PostgreSQL real dentro de `BEGIN`/`ROLLBACK` y terminó sin excepción. Verifica metadata regional, unicidad, jerarquía, inmutabilidad bancaria, revisiones de origen, idempotencia y overrides explícitos.

### Suite de Configuración

`supabase/tests/configuration_persistence.sql` también se ejecutó sobre PostgreSQL real con rollback. Verifica:

- alta, edición y archivo de cuenta conservando EUR;
- creación de categorías y jerarquía;
- fusión de categorías sin borrar el origen: el origen queda archivado;
- traslado de hijos al destino;
- traslado de referencias de comercio, movimiento, override, regla, recurrente, presupuesto y previsión;
- ausencia total de residuos tras el rollback.

Después de ejecutar ambas suites se comprobó que las tablas operativas usadas por las pruebas permanecen con `0` filas.

### Privilegios

Comprobación PostgreSQL real:

- `anon`: sin `USAGE` sobre `financial_app` y sin `SELECT` en cuentas;
- `authenticated`: sin `USAGE` sobre `financial_app` y sin `SELECT` en cuentas;
- `service_role`: acceso ordinario al esquema privado;
- `service_role`: sin `UPDATE` ni `DELETE` sobre `transaction_source_records`.

## Seguridad

El Security Advisor quedó en **0 lints** tras fijar `search_path` en las funciones de Fundamentos.

Supabase sigue señalando que RLS está desactivado en las 17 tablas. No se activa automáticamente: el propio asesor advierte que RLS sin políticas bloquearía acceso y requiere definir el modelo real de autorización. La exposición directa está actualmente cerrada porque `anon` y `authenticated` no tienen uso del esquema ni privilegios sobre las tablas. Ninguna clave `service_role` debe llegar al navegador.

El acceso definitivo Vercel → Supabase seguirá siendo exclusivamente server-side. Aún falta materializar el secreto/conexión de ejecución en Vercel; el conector disponible permite inspeccionar despliegues pero no escribir variables de entorno, por lo que no se inventa ni incrusta ninguna credencial en Git.

## Rendimiento

El Performance Advisor detectó inicialmente claves foráneas sin índice. Se corrigieron mediante `index_foreign_keys`. La repetición del advisor ya no muestra FKs sin cubrir; solo informa de índices todavía no usados, normal en una base recién creada y sin datos reales.

## Cuentas y categorías

Implementado:

- `SqlExecutor`: puerto mínimo de PostgreSQL con transacciones;
- `PostgresAccountRepository`: listar, obtener, persistir y reordenar;
- `PostgresCategoryRepository`: listar, obtener, persistir, reordenar y fusionar atómicamente;
- preflight de fusión para no inventar cómo combinar presupuestos incompatibles ni subcategorías duplicadas;
- `ConfigurationService`: crear/editar/archivar/reactivar/reordenar cuentas y categorías, y fusionar categorías;
- composition root `createConfigurationService` sobre el ejecutor SQL;
- UUID y reloj desacoplados para testabilidad.

El código compila correctamente en Vercel. Falta el adaptador concreto que abra la conexión PostgreSQL desde una función server-only de Vercel usando una credencial secreta del proyecto dedicado. Esa credencial no se expone ni se guarda en el repositorio.

## Validación de aplicación

La comprobación runtime de preview devuelve **20/20 controles de Fundamentos superados** en `/api/health/foundations`, incluyendo la nueva protección contra fusionar una categoría dentro de una descendiente.

## Responsive base

Breakpoints compartidos:

- 360 px móvil pequeño
- 480 px móvil grande
- 768 px tablet vertical
- 1024 px tablet horizontal
- 1280 px portátil
- 1440 px escritorio
- 1728 px pantalla ancha

La matriz visual real multidispositivo sigue pendiente; no se declara validada aún.

## Siguiente bloque de Fase 1

1. Materializar de forma segura la conexión server-only Vercel → PostgreSQL dedicado, sin credenciales en cliente/Git.
2. Ejecutar desde la propia aplicación pruebas CRUD persistentes de Cuentas/Categorías y relectura tras nueva petición.
3. Conectar la UI funcional de Configuración a esos casos de uso.
4. Validar matriz responsive real y regresión de preview.
5. Cerrar Fase 1 solo cuando lo anterior esté probado.
6. Seguir sin iniciar Inicio ni OCR.
