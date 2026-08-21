# Release Gate — V2.9.0

## Funcionalidad

- [x] Exportación JSON de capa privada.
- [x] Checkpoints internos.
- [x] Importación con preview obligatorio.
- [x] Compatibilidad ligada al checksum y número de movimientos.
- [x] Validación de referencias a movimientos.
- [x] Confirmación explícita antes de restaurar.
- [x] Restauración transaccional sin modificar la fuente bancaria.

## Evidencia de datos

- [x] Preview real: safe=true.
- [x] 3.135 filas backup / 3.135 filas actuales.
- [x] Checksum idéntico.
- [x] 0 referencias inválidas.
- [x] Round-trip real PostgreSQL completado y revertido sin residuos.

## Seguridad

- [x] RLS deny-by-default en backups internos.
- [x] Service role no expuesta al navegador.
- [x] `/copias` privada.
- [x] `/api/private/backup` privada.
- [x] Restauración fail-closed.

## Gates de código

- [ ] Invariantes finales.
- [ ] Regresiones financieras.
- [ ] Regresiones horizonte largo.
- [ ] Regresiones cierre mensual.
- [ ] Regresiones reglas.
- [ ] Regresiones explicabilidad.
- [ ] Regresiones auditoría.
- [ ] Regresiones backup/portabilidad.
- [ ] TypeScript.
- [ ] Build producción.
- [ ] Smoke del servidor compilado.

El preview de Vercel se reserva para el release acumulado V3.0.0.
