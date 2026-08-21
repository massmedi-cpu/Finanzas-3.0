# Finanzas 3.0 — Axiomas permanentes del proyecto

Estado: vigente desde V2.0.1 y aplicable a cualquier cambio futuro.

## 1. Jerarquía

Este documento consolida las reglas técnicas que deben acompañar siempre al Prompt Maestro/Axioma de Finanzas 3.0 y al prompt permanente de auditoría y protección de regresiones. Una mejora nueva no puede invalidar silenciosamente una función, decisión financiera, requisito visual o garantía técnica ya validada.

## 2. Integridad financiera

- La fuente bancaria original es de solo lectura y nunca se modifica desde la aplicación.
- Categorizaciones, notas, conciliación, exclusiones, divisiones, presupuestos, objetivos y planificación viven en una capa privada reversible.
- Los traspasos internos no son ingreso ni gasto y quedan fuera del cash flow.
- Una transferencia bancaria externa no puede clasificarse como traspaso interno solo por contener la palabra “transferencia”.
- Si falta una capa necesaria para calcular una cifra, la aplicación debe detener ese cálculo antes que mostrar una aproximación silenciosa.
- No se inventan datos, saldos, fechas, categorías, previsiones ni conclusiones.
- Las divisiones deben cuadrar con el importe original con tolerancia máxima de 0,01 EUR y nunca alteran el movimiento bancario de origen.
- Informes y presupuestos usan la vista efectiva: fuente + ajustes privados + divisiones válidas − exclusiones.

## 3. Seguridad y privacidad

- Acceso privado obligatorio antes de mostrar datos financieros.
- Credenciales, contraseñas, service-role keys, claves privadas, identificadores privados y datos bancarios no se versionan.
- Los secretos se gestionan fuera del repositorio.
- RLS permanece habilitado en las tablas privadas. En el diseño actual no existen políticas públicas: el acceso directo de `anon` y `authenticated` está deliberadamente denegado y el backend autorizado usa `service_role`.
- Las RPC privilegiadas no pueden ser ejecutables por `anon` ni `authenticated`.
- Las cookies de sesión deben ser `HttpOnly`, `SameSite=Strict` y `Secure` en producción.
- El repositorio no puede incluir exportaciones CSV/XLSX/PDF, bases de datos, backups privados ni ZIP históricos de la aplicación.

## 4. Rendimiento

- Evitar descargas/reprocesado de la fuente cuando el fichero de origen no ha cambiado.
- Deduplicar peticiones concurrentes equivalentes.
- Paralelizar lecturas independientes.
- No precargar rutas privadas pesadas sin una razón medida.
- No provocar una recarga completa de servidor cuando el estado local ya contiene la respuesta válida.
- No renderizar miles de filas simultáneamente; el histórico debe poder evolucionar a paginación/virtualización real.
- La arquitectura debe poder evolucionar a decenas o cientos de miles de movimientos sin rehacer el dominio financiero.

## 5. Desarrollo y regresiones

- Flujo obligatorio: rama de trabajo → pruebas → typecheck → build → preview → validación → producción.
- `main` es producción; el trabajo se realiza fuera de `main`.
- Mantener un checkpoint recuperable antes de cambios de riesgo.
- Versionado SemVer MAJOR.MINOR.PATCH.
- Cada corrección funcional debe incorporar una prueba de regresión cuando sea razonablemente automatizable.
- CI debe utilizar dependencias reproducibles mediante lockfile.
- No se declara una versión validada si CI o la comprobación funcional correspondiente falla.

## 6. UX y diseño

- Responsive real, mobile-first y legible en móvil, tablet y escritorio.
- No sacrificar legibilidad para mostrar más densidad.
- Estados de carga, vacío, error y recuperación deben ser visibles y coherentes.
- La aplicación debe explicar cuándo un dato no puede calcularse con garantías.
- Diseño profesional y consistente, sin duplicar información de manera incoherente entre páginas.

## 7. Auditoría continua

Antes de cerrar cualquier mejora se comprueba:
1. integridad financiera;
2. seguridad y exposición de datos;
3. regresiones sobre funciones anteriores;
4. rendimiento y peticiones redundantes;
5. responsive y legibilidad;
6. CI/typecheck/build;
7. documentación y changelog;
8. posibilidad de rollback.
