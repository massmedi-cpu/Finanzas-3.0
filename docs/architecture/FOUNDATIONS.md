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
- E2E protegido: harness Playwright y workflow de rama implementados; ejecución live pendiente exclusivamente del Automation Bypass de Vercel

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
24. La validación E2E del preview no rebaja SSO: usa el mecanismo oficial `x-vercel-protection-bypass` y solo ejecuta pruebas live cuando existe un secreto de Automation Bypass.
25. El workflow E2E espera a que `/api/build` devuelva exactamente el mismo SHA que el commit de GitHub antes de probar el preview, evitando validar un despliegue anterior por carrera de CI.
26. Las pruebas de interacción de Configuración usan respuestas controladas para no ensuciar PostgreSQL; la persistencia real se valida por separado mediante el health check de roundtrip con limpieza automática.

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

El E2E de preview tampoco desactiva Vercel Authentication. `playwright.config.ts` exige `VERCEL_AUTOMATION_BYPASS_SECRET` cuando el destino es `*.vercel.app` y envía exclusivamente los headers oficiales de bypass para automatización.

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

La suite automática de build contiene **26 comprobaciones**: 20 invariantes base de Fundamentos, 5 controles del contrato de API y 1 regresión específica que impide separar el tipo de una categoría del tipo de sus subcategorías. La home usa esta suite durante prerender y aborta la build si cualquier control falla.

También está implementado el harness `tests/e2e/configuration.spec.ts` con Playwright para:

- verificar navegación y formato monetario español;
- comprobar que la UI no ofrece jerarquías ni fusiones imposibles;
- comprobar ausencia de scroll horizontal en escritorio y móvil;
- consultar `/api/health/foundations` en el preview real;
- ejecutar `/api/health/configuration-persistence`, que realiza alta, edición, archivo, orden, fusión, relectura y limpieza de los datos temporales.

El workflow `.github/workflows/preview-e2e.yml` se dispara con cada `push` a `rebuild/phase-1-foundations`, espera al SHA exacto mediante `/api/build` y ejecuta los proyectos `chromium-desktop` y `chromium-mobile` cuando el secreto de bypass está disponible.

Último bloque compilado y desplegado:

- commit: `b8bcf8587e663886f2424fb83f2f06bf12e3a628`;
- deployment preview: `dpl_Dz7tLqG96sFGtuUiKqzXqiEc6Tbf`;
- estado Vercel: `READY`;
- Next.js 16.3.1: compilación correcta;
- TypeScript: correcto;
- generación estática: 4/4 correcta;
- rutas incluidas: `/`, `/configuration`, `/api/configuration`, `/api/health/foundations`, `/api/health/persistence`, `/api/health/configuration-persistence`.

GitHub Actions ha confirmado que el workflow de rama sí se dispara. La ejecución `33835088785` detectó que `VERCEL_AUTOMATION_BYPASS_SECRET` todavía no está configurado y, por diseño seguro, dejó los pasos de Playwright en `skipped`. Por tanto, **no se considera todavía ejecutado el E2E live**.

La integración Vercel disponible en esta sesión permite inspección, despliegues y enlaces temporales compartibles, pero no expone una acción autenticada para generar/configurar el Automation Bypass ni para escribir el secreto de GitHub. No se inventa ni se almacena ningún secreto en el repositorio.

## Responsive base

Breakpoints compartidos:

- 360 px móvil pequeño
- 480 px móvil grande
- 768 px tablet vertical
- 1024 px tablet horizontal
- 1280 px portátil
- 1440 px escritorio
- 1728 px pantalla ancha

El harness de Fundamentos ya comprobó ausencia de scroll horizontal, controles de al menos 44 px y lectura/labels de 16/14 px en la matriz prevista. Playwright amplía esta puerta con ejecución real de Chromium desktop y móvil cuando el preview protegido pueda atravesarse mediante Automation Bypass.

## Siguiente bloque de Fase 1

1. Mantener todas las suites verdes y sin residuos de prueba.
2. Configurar de forma segura el Automation Bypass de Vercel y disponibilizarlo al workflow como `VERCEL_AUTOMATION_BYPASS_SECRET`, sin escribirlo en Git ni exponerlo al cliente.
3. Ejecutar el workflow E2E contra el SHA exacto del preview y exigir éxito en desktop + móvil + health checks de persistencia.
4. Solo entonces cerrar Fase 1 y pasar a Fase 2.
5. Seguir sin iniciar Inicio ni OCR antes de sus fases oficiales.
