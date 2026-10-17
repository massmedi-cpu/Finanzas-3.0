# AP-6 · Lecturas autenticadas con 10.000 y 50.000 movimientos

Requisito: Axioma §§38, 107–108 y encargo RECUPERACION-PRODUCTO-20261009 §12.

## Punto de partida comprobado

La candidata `f91aab29947fc86aeb5b523cba836355e8f03fb2`, PR #619, tiene
81 workflows terminados: 80 SUCCESS y 1 SKIPPED condicional. No se ha
fusionado ni publicado. Los resultados solo acreditan ese SHA.

El laboratorio SQL existente mide funciones PostgreSQL; el de proyección mide
CPU. La batería HTTP autenticada existente usa `next dev` y un conjunto pequeño.
Ninguna de estas mediciones acredita el recorrido optimizado API → gateway →
PostgreSQL → respuesta con grandes volúmenes.

## Ensayo añadido

Se reutiliza `scripts/aud-e2e-authenticated-isolation.sh` en modo `capacity`.
Arranca Auth, Storage y PostgreSQL locales desechables, aplica las migraciones
versionadas, crea identidades reales de ensayo y utiliza el entrypoint real de
la pasarela con un firmante OIDC exclusivo del proceso de prueba. No utiliza
secretos externos ni crea un proyecto cloud. La autenticación no se desactiva.

Se incorporan dos cuentas sintéticas, con 10.000 y 50.000 movimientos y sus
originales correspondientes, fechas de varios años, ingresos, gastos,
devoluciones, transferencias y duplicados confirmados. La carga de fixture
pausa triggers de replicación únicamente dentro de la transacción local
del propietario; los restaura antes de COMMIT. No cambia RLS ni grants.
**No es una prueba de ingestión de 50.000 filas con triggers.**

`npm run build` y `next start` usan la misma aplicación, con el tráfico del
servidor dirigido solo a la pila local. El ensayo mide, para ambos volúmenes:

- Agregado financiero, listado paginado y búsqueda, en histórico y un mes.
- Dos calentamientos y doce muestras; p95 de laboratorio por rango más próximo.
- Transferencia del cuerpo y decodificación JSON incluidas en la API.
- Tiempo del handler separado cuando existe Server-Timing.
- Lista realmente renderizada e interactiva en 1.440 y 390 px, con un primer
  acceso de caché fría separado y doce navegaciones de documento con caché
  caliente. No se confunden con navegación SPA en memoria.
- Totales y recuentos contrastados con un cálculo JavaScript independiente
  del motor financiero. Se comprueba que cada fila conserva cuenta y periodo.
- Un usuario de otro workspace no obtiene filas de las cuentas de ensayo.
- Relectura SQL en conexión independiente: huellas de originales y movimientos
  idénticas antes y después de las lecturas.

El umbral previo es p95 API ≤ 2.000 ms. Un incumplimiento falla el ensayo;
no se elimina la muestra ni se aumenta el umbral para darlo por aprobado.
No hay reintentos automáticos de pruebas.

El informe JSON conserva tiempos, condiciones, volumen, versión de motores y
SHA. Solo se sube ese informe sintético: no contiene IDs de cuentas, cookies,
contraseñas, tokens, documentos ni trazas de peticiones.

## Alcance que permanece abierto

Este laboratorio usa red loopback y Chromium sin limitación de CPU/red;
390 px es una emulación de viewport, no un móvil físico. No acredita
latencia cloud, p75 de Core Web Vitals, guardados, ingestión con triggers,
comparación equivalente con Producción ni la aceptación completa de AP-6.
La navegación SPA en memoria y búsqueda ya cargada tienen criterios propios.

AP-1 a AP-8 permanecen abiertas en su alcance pendiente. La autorización del
propietario permite una única publicación final cuando cumpla las puertas;
este bloque no constituye permiso para publicar una candidata parcial.

## Ejecución y continuidad

Workflow: `.github/workflows/authenticated-read-capacity.yml`.
Resultado del commit nuevo: pendiente de ejecución remota exacta al crear
este bloque. La compilación o el listado de Playwright no sustituyen esa
ejecución. Consultar el resultado del workflow y su informe antes de atribuir
una mejora de rapidez; investigar el primer límite que falle.

Validación local realizada: typecheck de la aplicación, build optimizada con
todos los guards de postbuild, typecheck estricto del ensayo, sintaxis Node de
los dos archivos TypeScript nuevos de configuración/carga, sintaxis Bash,
YAML, colección de Playwright (un recorrido) y `git diff --check`: PASS.
Los preflights también rechazan un proceso fuera de CI y credenciales externas
antes de intentar arrancar servicios.

La ejecución autenticada 10k/50k **no se ha realizado**: este entorno no tiene
Docker y la revisión automática ha rechazado el push. El rechazo reconoce el
repositorio del propietario y el alcance de rama, pero no acepta como permiso
válido la autorización recuperada mediante contexto de una sesión anterior.
Se conserva un único commit local revisable, pendiente de aprobación explícita
en este chat. No se ha eludido el bloqueo con herramientas de escritura GitHub.
La rama remota y PR #619 permanecen en `f91aab29`, ya certificada.

Siguiente acción concreta: subir el commit local a la misma rama de PR #619,
sin force push, merge ni producción. Después ejecutar y revisar el nuevo
workflow, conservar el informe y corregir el primer incumplimiento real sin
relajar los 2.000 ms. La autorización de publicación final sigue condicionada
a las puertas del encargo; este permiso de push no las sustituye.
