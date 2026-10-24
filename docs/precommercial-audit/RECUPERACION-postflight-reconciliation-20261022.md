# REC-POST-281–287 · Conciliación bancaria y postflight de solo lectura

Fecha: 22/10/2026. Continuidad de la PR #619 (borrador), sin actualización de
producción y sin creación de usuario, secreto o entorno de pago.

## 1. Evidencia real independiente

Acceso de Google Drive/Sheets **solo lectura** y Supabase **solo SELECT**
en la fuente oficial “Movimientos bancarios - fuente”:

- Fuente: 3.208 movimientos únicos; corriente 3.191 y ahorro 17.
- Persistencia: 3.188 registros `financial_app.transaction_source_records`;
  3.188 transacciones; 3.188 claves persistidas únicas.
- Cruce por `source_row_key` con comprobación independiente de
  `bank_date`, `amount_cents` y `balance_after_cents`: **3.188/3.188
  equivalencias** en cada uno de los tres campos; **0 discrepancias**.
- Los 134 saldos originales nulos permanecen NULL, nunca 0 por defecto.
- **20 altas pendientes:** 18 corriente / 2 ahorro. **0 duplicados**
  en fuente y **0 huérfanos** en persistencia.
- No se han impreso IDs de movimientos ni importes privados en los informes.
  No se han enviado movimientos a nuevos sistemas.
- La auditoría confirma una fotografía concreta de ambos sistemas, no
  garantiza que ningún registro haya cambiado después de la lectura ni
  sustituye preflight/postflight de una futura operación autorizada.

## 2. Motor puro para la comprobación posterior

`src/domain/source-postflight-reconciliation.ts` contiene un motor
determinista e independiente de conexión a redes o bases de datos. Recibe
**dos instantáneas completas aportadas explícitamente** y produce únicamente
recuentos agregados; no conoce ni publica identidades de movimientos:

1. Compara identidad compuesta archivo/pestaña/fila. No confunde el mismo ID
   entre pestañas o archivos distintos, ni tolera identidades repetidas.
2. Valida fechas ISO reales y valores monetarios enteros seguros; no emplea
   float para comparar importes ni convierte saldo desconocido a cero.
3. Detecta altas pendientes, registros persistidos sin correspondencia,
   diferencias de cuenta, fecha, importe y saldo, por cuenta y globalmente.
4. Distingue estado `verified` (coincidencia de las instantáneas aportadas),
   `pending` (solo filas sin importar) y `blocked` (discrepancias, huérfanos
   o falta total de evidencia). Cero filas en ambos lados jamás es éxito.
5. Cierra ante datos corruptos, claves duplicadas o más de 10.000 registros
   por instantánea; los errores contienen solo códigos sin datos bancarios.
6. Su resultado conserva `scope=supplied_snapshots_only`. No afirma
   integridad de otros archivos, cuentas o períodos no observados.

El motor NO está conectado aún a un endpoint servidor que obtenga
dos instantáneas autentificadas en nube: **su incorporación no cierra AP1–AP8
ni constituye un postflight productivo**.

## 3. Siete regresiones obligatorias

Archivo `tests/e2e/source-postflight-reconciliation.spec.ts`, pruebas
REC-POST-281–287:

- Igualdad exacta y conservación de NULL.
- 3.208 filas sintéticas = 3.188 persistidas más 20 pendientes (18+2),
  incluidos 134 NULL.
- Diferencias en cuatro campos (cuenta/fecha/importe/saldo) y registro huérfano.
- IDs repetidos, alias con espacios, fechas inexistentes, decimales no exactos,
  números inseguros, ausencia de evidencias.
- Identidades de la misma fila en varias pestañas y archivos independientes.
- 10.000 observaciones deterministas, sin truncamientos.
- Sin mutación de los arrays de entrada ni datos originales reales.

Se han integrado en `Product recovery browser matrix` con Chromium
desktop/móvil, `Source Trust CI Gates` y el guard
`verify-recovery-visual-suite-gate.mjs` que exige su presencia *y ejecución*.
Para certificar el nuevo SHA se requieren de nuevo typecheck, build, todas
las pruebas y resultados terminales sin fallos/flaky. Los verdes de SHA
`ab952c72` (**86 SUCCESS + 1 SKIPPED**) son evidencia histórica del bloque
anterior, no del motor nuevo.

## 4. Bloqueos reales comprobados en Supabase

Consulta SELECT en `financial_app`: **un usuario**, un workspace y una
membership. Por tanto AP2 requiere todavía dos sesiones reales segregadas en
un entorno autorizado y aislado; no crear cuentas artificiales en producción.

El trigger `documents_private_original_rewrite_guard` en la base
productiva aparece **sin instalar (0)**. Sus pruebas en PostgreSQL efímero
no equivalen a certificar la migración productiva. No aplicar migraciones
sin terminar AP8 y su plan de recuperación.

OCR G5: inventario privado por nombres, sin acceder al contenido ni al
holdout, todavía insuficiente para certificar las cuotas y lectura/persistencia
real de los 24 originales. Falta raíz autorizada para la identidad del servidor.

## 5. Criterio de continuación y publicación

- Terminar CI del SHA exacto y probar preview identificada mediante
  `/api/build`, ambiente preview, permisos anónimos restringidos.
- Diseñar endpoint de postflight solo con lectura autenticada, límites
  y respuesta agregada, conectado al gateway canónico, no a claves privadas
  del navegador. No crear persistencia alternativa ni API sin autorización.
- Completar G5 privado, AP2 cloud segregado, AP8 restore+upgrade aislados.
- Exigir sync real autorizada de 20 filas con preflight/postflight y rollback
  documentado antes de promover. Sin garantía de rollback después de respuesta
  incierta. Ninguna publicación ni merge de PR #619 hasta cierre de aceptación.


## 6. Continuación implementada: REC-POST-288–295

**Código añadido y versionado en la misma PR acumulativa** (la PR #619
permanece DRAFT, sin merge ni actualización productiva):

- **Gateway**: `source.postflight_rows` en `source-sync.ts`, exclusivamente
  SELECT de las columnas autorizadas de `transaction_source_records`,
  filtrado explícito por `source_file_id` y el workspace cuyo contexto fue
  comprobado mediante token de usuario + membresía en `index.ts`. La
  identidad de Vercel OIDC se verifica igualmente en el gateway. Límite
  SQL real 10.001: rechaza más de 10.000 registros en lugar de truncar
  discretamente. Fechas y BIGINT salen en texto exacto y sólo viajan al
  servidor Next.js; la ruta pública no entrega listas de movimientos.
- **Decodificación**: `source-postflight-report.ts` valida el origen de
  cada registro, formato exacto de enteros en céntimos, NULL auténtico,
  límite, completitud del array y campos permitidos. `buildSourcePostflightReport`
  compara esas filas con el lote autoritativo recién leído y validado.
- **API**: `GET /api/source/google/postflight` autentica la sesión y la
  membresía ANTES de recuperar siquiera la conexión Google; lee una
  instantánea actual, exige baseline histórico, invoca exclusivamente
  `source.postflight_rows` y devuelve **solo agregados** con
  `scope=supplied_snapshots_only` y
  `readConsistency=sequential_non_atomic`. Si gateway/credenciales
  fallan, contesta error estable HTTP 503/409/422 sin cifras inventadas.
- **Interfaz**: botón «Conciliar con datos guardados» y panel claro con
  filas oficiales, guardadas, coincidentes, pendientes, huérfanas y
  discrepantes. Sin falsear un estado pendiente como completado; la sesión
  caducada borra inmediatamente datos y botones. Un validador de dominio
  único `isConfirmedSourcePostflightReport` comprueba cuentas, sumas,
  estados y límites antes de mostrar el resultado.
- **Regresiones nuevas**: REC-POST-288 a REC-POST-295, incluyendo lectura
  BIGINT exacta, cruce sintético, contraseguridad anónima, orden
  verificación usuario→fuente→DB, selección tenant, límite y ausencia
  de SQL mutante, UI de pendientes y errores, revocación por 401 y
  rechazo de agregados contradictorios. Se añadieron a la matriz
  obligatoria Chromium desktop/móvil, `Source Trust CI Gates` y guard
  de ejecución (no solamente existencia de los archivos).

### Dependencia ineludible de activación cloud

El gateway Supabase actualmente productivo NO incluye la nueva acción
`source.postflight_rows` hasta que se despliegue la Edge Function
correspondiente bajo el proceso de publicación con verificación de
identidad y respaldo. La preview Next.js compila el código propuesto,
pero **no debe anunciar la conciliación real como operativa** si devuelve
503 por ausencia del nuevo gateway. No se actualizó Edge ni permisos en
producción durante este bloque, para no adelantar AP1–AP8.

Cada operación es de solo lectura: la ruta no ofrece POST mutante; no
se ha importado ninguno de los 20 movimientos pendientes ni cambiado
documentos, saldo inicial, migraciones ni ACL. Dos instantáneas
secuenciales no garantizan una transacción atómica intersistema.

**Estado de entrega**: implementado en GitHub; las nuevas suites y el
nuevo SHA requieren evidencias terminales independientes; AP1–AP8
siguen abiertas.


## 22/10/2026 · REC-POST-296/297 · privacidad de identificadores en la respuesta

Auditoría de frontera HTTP: el informe agregado interno contenía
`accounts[].accountExternalKey` y el endpoint lo serializaba sin retirar
la clave del producto bancario. Además enviaba la revisión y la huella
SHA-256 de la fuente, que no son necesarias para la pantalla de conciliación.

Se introduce un contrato público explícito con etiquetas genéricas
`Cuenta 1`, `Cuenta 2`, etc. El servidor conserva los identificadores
originales solo durante el cruce en memoria y devuelve los mismos contadores
por cuenta, sin identificadores, revisión ni huella de la fuente. El cliente
rechaza respuestas que contengan `accountExternalKey` y verifica que
las sumas y el estado sean coherentes. Nuevas regresiones REC-POST-296 y
REC-POST-297, obligatorias en la matriz de navegador y su guard.

**Limitación:** por diseño las etiquetas genéricas no sustituyen la
identificación bancaria interna ni equivalen a pruebas con dos usuarios
reales. No se publica, fusiona ni sincroniza mientras AP1–AP8 sigan abiertas.
