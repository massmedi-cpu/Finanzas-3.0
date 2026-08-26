# Auditoría Financial App — progreso tras 3.8.1

Bloques cerrados:

- Archivo sin límite fijo de 100 documentos.
- Contrato API 401/403 coherente.
- Endurecimiento de permisos internos Supabase.
- Edición masiva atómica de hasta 200 movimientos.
- Historial por lote y deshacer seguro con control de cambios posteriores.
- Sincronización Google Drive read-only de documentos financieros.
- Cola de revisión de asociaciones documentales ambiguas.
- PATCH parcial de Archivo con semántica correcta: omitido conserva, null explícito vacía.
- Preflight vivo código ↔ Supabase antes de build: versión y RPCs requeridos.

Siguiente bloque de auditoría:

- E2E autenticado de preview mediante token efímero y host-bound.
- Frontera API común y sanitización homogénea de errores.
- Optimización del autoenlace y observabilidad de sincronización/matching.
