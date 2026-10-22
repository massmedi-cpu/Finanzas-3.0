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
