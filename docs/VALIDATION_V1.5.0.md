# Validación V1.5.0

La versión solo puede pasar a `main` cuando se cumplan estos controles:

- TypeScript sin errores.
- Build de producción correcto.
- Preview Vercel en estado READY.
- Endpoint de salud devuelve V1.5.0.
- Capa privada de recurrentes activa.
- RLS activado en la tabla de preferencias.
- La fuente bancaria original permanece en modo solo lectura.
- Las preferencias de recurrentes afectan a dashboard y previsión sin modificar movimientos históricos.
