# Modelo de datos inicial
`source_movements` conserva el dato original y su hash. `movement_overrides` conserva las modificaciones sin destruir el origen. `sync_runs` documenta cada sincronización. El SQL es diseño de fase 0/1 y no debe aplicarse al Supabase compartido detectado; se convertirá en migración al disponer de un proyecto dedicado.
