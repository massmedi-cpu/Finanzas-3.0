# AUD-E2E · sesiones, almacenamiento y OCR aislados

La candidata 10.0.103 tenía CI y PostgreSQL descartable aprobados, pero esos
ensayos utilizaban stubs de Auth/Storage. Esta comprobación añade GoTrue,
PostgREST, Storage y PostgreSQL reales, temporales y locales al runner de GitHub.
No crea un proyecto Supabase remoto ni necesita secretos de producción.

## Recorrido añadido

- Aplica las migraciones originales a Supabase local con sus esquemas administrados.
- Crea cuatro usuarios sintéticos: propietario, miembro, propietario de otro
  espacio y usuario sin acceso a la aplicación.
- Comprueba el login real de Next/Supabase, cookies HttpOnly, renovación desde
  refresh y logout. La ruta protegida de diagnóstico no existe: se comprueba
  exclusivamente la diferencia entre 401 del proxy y 404 autenticado, sin
  invocar la persistencia productiva.
- Resuelve cada sesión con `resolveWorkspaceContext` y ejecuta los handlers
  documentales/presupuestarios originales mediante conexiones nuevas.
- Guarda y relee metadatos, designación reversible Prueba y presupuesto 17,32 €,
  cero y automático. Rechaza la designación por un miembro y escrituras/lecturas
  documentales o presupuestarias entre espacios.
- Sube un PNG sintético a Storage privado mediante la URL firmada por el handler
  original, verifica firma/contenido al finalizar y compara el SHA-256 de descarga.
- Ejecuta el OCR Tesseract original, verifica importe/geometría, persiste el
  resultado y su interpretación, relee ambos íntegros y comprueba que el original
  y el número de filas bancarias permanecen iguales.

## Alcance de la evidencia

El resultado se vincula al SHA exacto con `AUD_AUTH`. Nunca se suben tokens,
cookies, URLs firmadas, volcados ni trazas de navegador. El stack se destruye
al terminar. No hay mocks de Auth ni Storage en este ensayo.

Los handlers se invocan directamente después de resolver la sesión real; este
ensayo **no certifica la envoltura OIDC de Vercel ni el recorrido completo
browser → API financiera → Edge publicado**. Tampoco certifica Google Drive,
la revisión del propietario del documento F11 de producción, exportación/PWA
ni la matriz de aceptación completa de VAL-001. No cerrar esas tareas ni publicar
por este único resultado. El backup real de producción con Storage y su restore
sigue siendo un requisito separado del backup sintético ya aprobado.

La workflow no usa secrets, no hace DDL productivo y no modifica otros proyectos.
Un fallo o resultado pendiente no se registra como aprobación.
