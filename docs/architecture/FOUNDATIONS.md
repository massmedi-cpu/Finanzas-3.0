# Financial App — Fundamentos 0.0.1

## Estado

- Versión: `0.0.1`
- Fase: `1 — Fundamentos`
- Rama de trabajo: `rebuild/phase-1-foundations`
- Producción: no modificar hasta validación de preview
- OCR: fuera del camino crítico; Fase 11
- Supabase dedicado: `financial-app` (`btzukbfesxdratqnxuoj`) en `eu-west-3`
- Persistencia física: creada y validada sobre el proyecto Supabase dedicado
- Persistencia de Configuración: repositorios PostgreSQL + servicio de aplicación + gateway OIDC + API + UI implementados y compilados

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
17. La build ejecuta las comprobaciones completas de Fundamentos y falla si alguna deja de cumplirse.
18. PostgreSQL ejecuta suites de integridad con rollback y sin dejar datos ficticios.
19. Las funciones de base fijan `search_path`; Security Advisor queda sin lints.
20. Las claves foráneas relevantes disponen de índices de cobertura.
21. La API de Configuración valida entrada desconocida antes del dominio: operación, forma exacta, UUID, booleanos exactos, enums, enteros seguros y listas sin duplicados.
22. El endpoint no usa coerciones ambiguas como `Boolean("false")`; una petición con tipo incorrecto se rechaza antes de persistir.
23. El tipo de una categoría no puede cambiar si dejaría subcategorías de un tipo distinto; esta invariante se aplica tanto en dominio como en PostgreSQL.

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
- El Supabase compartido anterior no se modifica.

Historial oficial remoto y archivos en `supabase/migrations/`:

1. `20260903200004_financial_app_foundations.sql`
2. `20260903200023_source_snapshot_history.sql`
3. `20260903200134_harden_function_search_paths.sql`
4. `20260903200201_index_foreign_keys.sql`
5. `20260904034944_enforce_category_child_kind.sql`

La estructura física incluye 17 tablas en el esquema privado `financial_app`, metadata `0.0.1 → 10.0.0`, `es-ES`, `EUR`, `Europe/Madrid`, claves, constraints, auditoría, cursores, índices y protección bancaria.

## Validación física

### Suite general

`supabase/tests/foundation_integrity.sql` se ha ejecutado contra PostgreSQL real dentro de `BEGIN`/`ROLLBACK` y termina sin excepción. Verifica metadata regional, unicidad, jerarquía, inmutabilidad bancaria, revisiones de origen, idempotencia y overrides explícitos.

### Suite de Configuración

`supabase/tests/configuration_persistence.sql` también se ha ejecutado sobre PostgreSQL real con rollback. Verifica:

- alta, edición y archivo de cuenta conservando EUR;
- creación de categorías y jerarquía;
- fusión de categorías sin borrar el origen: el origen queda archivado;
- traslado de hijos al destino;
- traslado de referencias de comercio, movimiento, override, regla, recurrente, presupuesto y previsión;
- ausencia total de residuos tras el rollback.

Además se reprodujo explícitamente el caso padre `expense` + hijo `expense`: antes de la corrección PostgreSQL permitía cambiar solo el padre a `income`. Tras `20260904034944_enforce_category_child_kind.sql`, la misma operación queda bloqueada y la prueba con rollback conserva ambos tipos en `expense`.

Tras la última revalidación, las pruebas temporales no dejan datos ficticios persistidos.

### Privilegios

Comprobación PostgreSQL real:

- `anon`: sin `USAGE` sobre `financial_app` y sin `SELECT` en cuentas;
- `authenticated`: sin `USAGE` sobre `financial_app` y sin `SELECT` en cuentas;
- `service_role`: acceso ordinario al esquema privado;
- `service_role`: sin `UPDATE` ni `DELETE` sobre `transaction_source_records`.

## Seguridad

El Security Advisor queda en **0 lints** después del endurecimiento jerárquico.

La exposición directa está cerrada porque `anon` y `authenticated` no tienen uso del esquema privado ni privilegios sobre sus tablas. Ninguna clave `service_role` llega al navegador.

El acceso Vercel → Supabase está materializado como canal server-only mediante OIDC efímero firmado por Vercel hacia `financial-app-db-gateway`. La función valida emisor, audiencia, equipo, proyecto, entorno y subject antes de abrir PostgreSQL; la URL de base de datos vive en el entorno privado de la Edge Function y no en Git ni en el cliente.

## Rendimiento

El Performance Advisor detectó inicialmente claves foráneas sin índice. Se corrigieron mediante `index_foreign_keys`. La repetición del advisor ya no muestra FKs sin cubrir; solo informa de índices todavía no usados, normal en una base recién creada y sin datos reales. No se eliminan prematuramente esos índices solo por no haber acumulado uso todavía.

## Cuentas y categorías

Implementado:

- `SqlExecutor`: puerto mínimo de PostgreSQL con transacciones;
- `PostgresAccountRepository`: listar, obtener, persistir y reordenar;
- `PostgresCategoryRepository`: listar, obtener, persistir, reordenar y fusionar atómicamente;
- repositorios edge que consumen el gateway server-only autenticado;
- preflight de fusión para no inventar cómo combinar presupuestos incompatibles ni subcategorías duplicadas;
- `ConfigurationService`: crear/editar/archivar/reactivar/reordenar cuentas y categorías, y fusionar categorías;
- API `/api/configuration` con contrato estricto de entrada;
- interfaz `/configuration` para alta, edición, archivo/reactivación, orden y fusión;
- orden de categorías limitado en UI a categorías hermanas del mismo tipo y padre;
- orden de cuentas limitado visualmente al mismo grupo de ciclo de vida para evitar movimientos sin efecto entre activas y archivadas;
- la UI reutiliza las políticas del dominio para no ofrecer una descendiente como padre ni como destino de fusión;
- los cambios de tipo incompatibles con subcategorías quedan deshabilitados en la UI y rechazados igualmente por dominio y PostgreSQL;
- UUID y reloj desacoplados para testabilidad.

## Validación de aplicación

La suite automática completa contiene **26 comprobaciones**: 20 invariantes base de Fundamentos, 5 controles del contrato de API y 1 regresión específica que impide separar el tipo de una categoría del tipo de sus subcategorías. La home usa esta suite durante prerender y aborta la build si cualquier control falla.

Último bloque funcional validado:

- commit: `87e808f8fffa5cb5fc0b813c4939995569ed973c`;
- deployment preview: `dpl_eEJCLRUrgNdeyDuomPMRJb8zxJKa`;
- estado Vercel: `READY`;
- Next.js 16.3.1: compilación correcta;
- TypeScript: correcto;
- generación estática: 4/4 correcta;
- rutas incluidas: `/`, `/configuration`, `/api/configuration`, `/api/health/foundations`, `/api/health/persistence`, `/api/health/configuration-persistence`.

La protección SSO del preview sigue impidiendo completar desde esta sesión una navegación interactiva real con conservación de cookie. No se desactiva la protección para facilitar una prueba. Por tanto, no se declara todavía cerrada la validación interactiva del preview.

## Responsive base

Breakpoints compartidos:

- 360 px móvil pequeño
- 480 px móvil grande
- 768 px tablet vertical
- 1024 px tablet horizontal
- 1280 px portátil
- 1440 px escritorio
- 1728 px pantalla ancha

El harness ya comprobó ausencia de scroll horizontal, controles de al menos 44 px y lectura/labels de 16/14 px en la matriz prevista. Falta únicamente la interacción real completa contra el preview protegido para considerar cerrado el criterio final de Fase 1.

## Siguiente bloque de Fase 1

1. Mantener todas las suites verdes y sin residuos de prueba.
2. Completar la validación interactiva real de `/configuration` contra el preview protegido cuando exista una sesión de navegador que conserve el SSO de Vercel.
3. Solo entonces cerrar Fase 1 y pasar a Fase 2.
4. Seguir sin iniciar Inicio ni OCR antes de sus fases oficiales.
