# Financial App — Fundamentos 0.0.1

## Estado

- Versión: `0.0.1`
- Fase: `1 — Fundamentos`
- Rama de trabajo: `rebuild/phase-1-foundations`
- Producción: no modificar hasta validación de preview
- OCR: fuera del camino crítico; Fase 11
- Supabase dedicado: `financial-app` (`btzukbfesxdratqnxuoj`) en `eu-west-3`
- Persistencia física: creada y validada sobre el proyecto Supabase dedicado

## Principios ya materializados en código y base de datos

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
18. La base real ejecuta constraints equivalentes y una suite SQL de integridad rollback-safe.
19. Las funciones de base fijan explícitamente `search_path` y el Security Advisor no reporta advertencias.
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

La proyección efectiva del movimiento sigue siendo una responsabilidad única del dominio (`resolveEffectiveTransaction`); la base de datos conserva las tres capas y no introduce una segunda lógica financiera paralela.

## Supabase dedicado y migraciones aplicadas

Proyecto exclusivo creado para esta reconstrucción:

- Nombre: `financial-app`
- Project ref: `btzukbfesxdratqnxuoj`
- Región: `eu-west-3`
- Coste confirmado por Supabase al crear el proyecto: `0 €/mes`
- El Supabase compartido anterior no se ha modificado.

Historial oficial remoto y archivos sincronizados en `supabase/migrations/`:

1. `20260903200004_financial_app_foundations.sql`
2. `20260903200023_source_snapshot_history.sql`
3. `20260903200134_harden_function_search_paths.sql`
4. `20260903200201_index_foreign_keys.sql`

La estructura física incluye 17 tablas en el esquema privado `financial_app`, metadata `0.0.1 → 10.0.0`, `es-ES`, `EUR`, `Europe/Madrid`, claves, constraints, auditoría, cursores, índices y protección de la fuente bancaria.

## Validación física realizada

La suite `supabase/tests/foundation_integrity.sql` se ha ejecutado contra PostgreSQL real con transacción y `ROLLBACK` y ha terminado sin excepción. Por tanto quedan verificadas físicamente:

- metadata regional y política bancaria `read_only`;
- unicidad normalizada de cuentas;
- coherencia padre/hijo y ausencia de ciclos de categorías;
- bloqueo de `UPDATE` y `DELETE` sobre instantáneas bancarias;
- conservación de una nueva instantánea cuando la fuente corrige una fila;
- rechazo de una observación idéntica repetida;
- persistencia del borrado explícito de categoría/comercio mediante overrides;
- ausencia de residuos de datos de prueba por rollback.

Además se comprobó mediante privilegios PostgreSQL que:

- `anon` no tiene `USAGE` sobre el esquema;
- `authenticated` no tiene `USAGE` sobre el esquema;
- ambos roles carecen de `SELECT` sobre `financial_app.accounts`;
- `service_role` sí dispone de lectura/escritura normal;
- `service_role` no dispone de `UPDATE` ni `DELETE` sobre `transaction_source_records`.

## Seguridad

El Security Advisor de Supabase quedó en **0 lints** tras fijar el `search_path` de las cuatro funciones de Fundamentos.

`list_tables` muestra RLS desactivado en el esquema privado y emite una advertencia genérica. No se ha activado RLS automáticamente porque Supabase indica que hacerlo sin políticas puede bloquear el acceso, y el conector exige decisión explícita para esa remediación. El riesgo de exposición directa está actualmente mitigado porque `anon` y `authenticated` no tienen uso del esquema ni privilegios de tabla. Antes de exponer cualquier API al cliente se definirá explícitamente el modelo de autenticación, grants y RLS.

## Rendimiento

El Performance Advisor detectó claves foráneas sin índice; se corrigieron mediante la migración `index_foreign_keys`. Tras repetir el advisor ya no aparecen FKs sin cubrir. Solo aparecen índices “unused”, comportamiento esperado en una base recién creada y vacía; no se eliminan de forma prematura.

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

La persistencia física que soportará estas operaciones ya existe y ha sido validada. Falta cerrar el adaptador de repositorio de la aplicación y su conexión segura desde Vercel preview antes de marcar Cuentas/Categorías como completadas.

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

1. Cerrar la estrategia de acceso seguro Vercel → Supabase privado sin exponer `service_role` al navegador.
2. Implementar repositorios reales de Cuentas y Categorías contra el Supabase dedicado.
3. Completar alta/edición/archivo/orden/fusión y verificar persistencia real.
4. Añadir pruebas de reinicio/relectura para confirmar que la persistencia y los overrides sobreviven.
5. Ejecutar matriz responsive real y regresión de preview.
6. Seguir sin iniciar Inicio ni OCR.
