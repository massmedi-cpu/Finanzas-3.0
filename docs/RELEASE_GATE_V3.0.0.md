# Release Gate — V3.0.0

V3.0.0 solo puede considerarse liberada cuando todos los puntos siguientes estén validados sobre el mismo HEAD.

## 1. Integridad financiera
- 3.135 movimientos normalizados frente al snapshot actual o igualdad con el conteo vigente si la fuente cambia legítimamente.
- Checksum snapshot/normalizado idéntico.
- Sin diferencias financieras respecto al motor validado para ingresos, gastos, neto y traspasos excluidos.
- Splits, overrides y reglas mantienen precedencia `split > manual > regla > fuente`.

## 2. Seguridad
- `finanzas-v3-data`, `finanzas-v3-recurring` y `finanzas-v3-splits` están ACTIVE con autorización fail-closed.
- CI prohíbe el patrón `response.status !== 401 && response.status !== 403` en esas funciones.
- Tablas privadas mantienen RLS deny-by-default.
- No se expone service role en cliente/repositorio.
- Advisories de Supabase: ningún WARN nuevo atribuible a Finanzas 3.0 sin resolver.

## 3. Recuperación
- Exportación privada no contiene snapshot bancario.
- Preview exige esquema/checksum/referencias compatibles.
- Restore exige confirmación explícita y es atómico.
- La prueba round-trip V2.9 permanece verde.

## 4. Rendimiento y arquitectura
- Superficies protegidas no usan `loadValidatedSource`.
- Movimientos conserva paginación/cursor.
- Analítica principal se sirve mediante RPC agregados.
- Índice FK de eventos de reglas aplicado.

## 5. CI
Debe pasar en verde: invariantes, regresión financiera, horizonte largo, cierre mensual, reglas, explicabilidad, auditoría, backup/restore, seguridad V3, TypeScript, build de producción y smoke del servidor compilado.

## 6. Vercel
- Un único preview del HEAD final V3.0.0.
- Deployment READY.
- `/api/health` devuelve `3.0.0`.
- Sin errores/fatales de runtime durante la validación.
- Solo después del preview se permite promoción a `main` y producción.

## 7. Producción
- Deployment de producción corresponde al SHA fusionado de V3.0.0.
- `/api/health` 200 y versión `3.0.0`.
- Login, Inicio, Movimientos, Plan, Previsión, Control y Copias cargan sin error.
- Rollback/checkpoint conservado.
