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

Estado anterior a la autorización de este chat: la ejecución autenticada
10k/50k no se había realizado porque este entorno no tiene Docker y la
revisión automática había rechazado el push. El rechazo reconoce el
repositorio del propietario y el alcance de rama, pero no acepta como permiso
válido la autorización recuperada mediante contexto de una sesión anterior.
Se conservó un único commit local revisable hasta recibir aprobación explícita
en este chat. La rama remota y PR #619 permanecieron en `f91aab29` durante
ese bloqueo. Las secciones siguientes registran el envío autorizado y sus
resultados posteriores.

Siguiente acción concreta: subir el commit local a la misma rama de PR #619,
sin force push, merge ni producción. Después ejecutar y revisar el nuevo
workflow, conservar el informe y corregir el primer incumplimiento real sin
relajar los 2.000 ms. La autorización de publicación final sigue condicionada
a las puertas del encargo; este permiso de push no las sustituye.

## Autorización recibida y primera medición real

El propietario autorizó el envío en este chat. La terminal carecía de
credenciales; la conexión GitHub creó `f80be203d45b015b223767dd82ee6d8a55d45412`
con el árbol `dc0fa3b3a01ee8f875eea36f7cb830635599cf57`, idéntico al commit local
`ff2d682` aprobado. PR #619 permaneció DRAFT y sin merge.

Ensayo [39046061667](https://github.com/massmedi-cpu/Finanzas-3.0/actions/runs/39046061667),
job `117434909253`: **FAIL real por rendimiento**, no por cifras. Se conservan
las 20 mediciones y condiciones del artefacto `12105463211` en
`evidence/ap6-authenticated-f80be203-baseline.json`.

Condiciones: Ubuntu de GitHub, Intel Xeon 6973P-C, unos 16 GB RAM, Node
24.21.0, PostgreSQL 17.11 y Chromium 151.0.7922.34; loopback sin limitación
de CPU/red, SW bloqueado; mismo pipeline auténtico y build optimizada.

| Lectura, 50.000 filas | p95 laboratorio |
| --- | ---: |
| Agregado del histórico | 729,63 ms |
| Listado del histórico | 1.931,26 ms |
| Búsqueda en el histórico | **2.443,32 ms: supera 2.000 ms** |
| Agregado de un mes | 105,00 ms |
| Listado de un mes | 163,04 ms |
| Búsqueda en un mes | 164,70 ms |

Los controles de céntimos, recuentos, cuenta, periodo y aislamiento de usuario
pasaron. La relectura en conexión SQL independiente confirmó huellas bancarias
y de movimientos idénticas. La lista del mes fue interactiva en 1.440 y 390 px;
estos datos no certifican navegación SPA ni un móvil físico.

## Corrección de la consulta pendiente de acreditar

`query_effective_transactions_v4` invocaba `category_display_name` dos veces
por movimiento antes de materializar el resultado filtrado y contar filas.
La migración generada con Supabase CLI 2.120.0,
`20261017154629_optimize_transaction_category_labels.sql`, conserva la función
canónica de nombres y la resuelve una vez por categoría accesible en una CTE
materializada local a la sentencia. Dos joins reutilizan esos nombres.
También normaliza una vez el término de búsqueda y reutiliza su patrón en
los tres predicados existentes, conservando los comodines LIKE originales.
No hay caché compartida entre sesiones ni cambios de RLS, ACL, firmas,
filtros, cursores, importes o campos del resultado. CREATE OR REPLACE conserva
propietario y permisos. El cambio se limita a cómo se obtiene el nombre.

La regresión PostgreSQL real `transaction_category_label_batch_disposable.sql`
comprueba padre/hoja, categoría manual frente a original, nulo, búsqueda por
nombre, filtro de categoría, paginación e invisibilidad de categorías ajenas.
Solo puede ejecutarse en la base desechable exacta y termina con ROLLBACK.

La comparación estructural local confirma firma idéntica y las mismas reglas
de filtrado y paginación; solo se reutilizan nombres y término normalizado.
Sintaxis Bash, typecheck y
permisos read-only del workflow se conservan. La aplicación de migraciones y
el nuevo p95 deben comprobarse en CI. `migration list --local` no pudo
conectar: este entorno no tiene Postgres/Docker. No se ha tocado nube.

No rebajar el umbral ni declarar corregido hasta repetir el ensayo completo.
La migración anterior permite reconstruir el cuerpo original para una
reversión de función; no se transforman ni eliminan datos.

## Primera corrección insuficiente y segunda corrección en validación

La primera corrección llegó a `d6f467355cd8c4d217a4b43b92083b481c117bb2`.
El ensayo [39046897640](https://github.com/massmedi-cpu/Finanzas-3.0/actions/runs/39046897640)
siguió **FAIL**: a 50.000 movimientos, p95 del histórico fue 1.055,15 ms
en agregado, 1.884,05 ms en listado y **3.062,25 ms en búsqueda**. Los controles
financieros y las huellas independientes pasaron. También falló la segunda
ejecución de capacidad. No se atribuye una mejora a esta corrección.

La regresión de categorías detectó además un error de preparación del propio
ensayo: el trigger de categorización de INSERT sustituía su categoría
sintética. Ahora el ensayo asigna esa categoría mediante UPDATE de categoría
tras INSERT, con todos los triggers activos, y comprueba el resultado esperado.

El plan SQL mostró dos costes adicionales: agregados laterales de reparto por
movimiento y llamadas repetidas al contexto de espacio de trabajo en las
políticas de las dos tablas bancarias. Las nuevas migraciones, generadas con
la misma CLI fijada, corrigen ambos puntos:

- `20261017160009_batch_transaction_split_facts.sql` calcula las asignaciones
  de reparto en un agregado para la cuenta y fechas solicitadas. Conserva la
  proyección canónica de importes personales, categorías, transferencias,
  duplicados, exclusiones y la comprobación de importe original del reparto.
- `20261017160345_statement_workspace_policy_context.sql` conserva los
  predicados USING y WITH CHECK existentes y evalúa su función de contexto
  mediante subconsulta escalar una vez por sentencia. Verifica antes la
  definición esperada y no cambia roles, grants ni activación de RLS. No hay
  caché entre sentencias o sesiones.

La regresión independiente nueva comprueba ocho casos con céntimos literales:
sin reparto, personal/otro, todo ajeno, varias categorías, reparto antiguo,
duplicado confirmado, exclusión manual y transferencia. Valida también el
agregado (33.000 céntimos de gasto), fecha y sumas originales sin modificar.
La prueba de categorías cambia A→B→A en la misma conexión y comprueba el
aislamiento en cada sentencia.

Diagnóstico local: las 104 migraciones y ambas regresiones pasan en PGlite
0.5.10/PostgreSQL 18.6 WASM. Es una comprobación SQL auxiliar; no certifica
PostgreSQL 17 nativo ni el presupuesto API. El plan local orientó la corrección,
sin sustituir el ensayo autenticado ni aportar una comparación de p95 válida.
Typecheck, sintaxis Bash y `git diff --check`: PASS. Quedan pendientes el CI
nativo y el nuevo p95 completo. Se conserva el límite de 2.000 ms.
