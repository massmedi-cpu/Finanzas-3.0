# Financial App — código de sincronización

La función activa se encuentra en `supabase/functions/financial-app-sync/index.ts` y se despliega en Supabase con JWT obligatorio.

Reglas invariantes:
- Google Drive solo lectura.
- Archivo oficial fijo: `Movimientos bancarios - fuente`.
- Comprobación por `modifiedTime` antes de descargar.
- Dos hojas oficiales: cuenta corriente 3967 y cuenta ahorro 2504.
- Esquema estricto de 22 columnas.
- `ID origen` como identidad primaria.
- Duplicados compatibles entre hojas se resuelven con prioridad de la última hoja; conflictos incompatibles abortan.
- La Edge Function nunca modifica Google Drive.
- La aplicación de snapshot se delega a RPC de `service_role` que preserva overrides de usuario.

La identidad de servicio actual conserva por razones históricas el nombre de otro proyecto; debe sustituirse por una identidad propia de Financial App antes de considerar completado el aislamiento de producción.
