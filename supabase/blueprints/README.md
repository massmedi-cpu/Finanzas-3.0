# Financial App — SQL blueprints de Fundamentos

Estos archivos son **blueprints previos a migración**, no entradas del historial de migraciones de Supabase.

## Motivo

La base dedicada de Financial App todavía no existe y no hay Supabase CLI local disponible en el entorno actual. Por seguridad y trazabilidad, no se inventan nombres de migración ni se escribe historial de migraciones antes de poder generarlo con el flujo oficial.

## Flujo obligatorio cuando exista el Supabase dedicado

1. Verificar la versión y comandos disponibles de Supabase CLI/MCP.
2. Crear la migración con el mecanismo oficial vigente (`supabase migration new ...` si CLI está disponible, o el flujo MCP/documentado equivalente).
3. Copiar/revisar el SQL de estos blueprints en la migración recién generada.
4. Ejecutar primero contra el proyecto dedicado, nunca contra el Supabase compartido actual.
5. Ejecutar `supabase/tests/foundation_integrity.sql` dentro de una transacción con rollback.
6. Ejecutar advisors de base de datos/seguridad y resolver cualquier advertencia aplicable.
7. Solo después considerar la persistencia física de Fundamentos validada.

## Blueprints

- `financial_app_foundations.sql`: estructura inicial, constraints, índices, permisos y metadatos regionales.
- `source_snapshot_history.sql`: historial inmutable para correcciones externas de filas bancarias.

La fuente bancaria oficial continúa siendo estrictamente de solo lectura para Financial App.
