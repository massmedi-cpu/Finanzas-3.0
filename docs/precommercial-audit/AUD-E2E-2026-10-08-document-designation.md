# AUD-E2E · Documentos y colas · 08/10/2026

Continuación de la candidata `audit/work-findings-prep-20261007`, PR [#561](https://github.com/massmedi-cpu/Finanzas-3.0/pull/561), sobre el commit previo `f666a3897827517664a9440fee43b2600426872d`. Base/main: `0d278a361ba8c0dfef0c116374a21af20782abdb`, versión 10.0.102. Este bloque prepara código y migraciones para revisión; no instala ni publica nada en Producción.

## Comportamiento preparado

- DOC-002: el propietario puede designar un documento como Prueba o devolverlo al tratamiento ordinario después de confirmar su revisión y aportar un motivo de 1–500 caracteres. La autorización se comprueba en SQL con el contexto autenticado del gateway. Se conservan fecha, revisor, motivo y cambios auditados; repetir la misma designación no reescribe su procedencia.
- Documentos ofrece vistas Ordinarios, Pruebas y Todos. Alertas y Para revisar consultan exclusivamente ordinarios. Las notas explícitas siguen mostrando una advertencia provisional y ningún nombre, nota o lectura clasifica un documento automáticamente.
- NAV-001: el filtro Sin asociar y su total se calculan antes de paginar, excluyendo archivados y asociaciones confirmadas. La interfaz ofrece páginas de 50, conserva vista/página al recargar, vuelve al inicio al cambiar filtros y recupera una página que ha dejado de existir.
- DOC-001: el diálogo de metadatos pendientes contiene el foco con Tab/Mayús+Tab; Escape o Seguir editando devuelven el foco al control que inició la salida. Un guardado fallido mantiene el borrador. La designación también conserva motivo y confirmación ante un error o una respuesta que no corresponde al documento seleccionado.
- Drive compara todas las vistas, incluidas Pruebas, para reconocer originales ya importados. Su configuración se comprueba antes de iniciar consultas, evitando un rechazo sin capturar cuando faltan credenciales.

## Migraciones candidatas

`20261008154928_aud_e2e_document_test_designation.sql` añade procedencia de la designación, el listado filtrado y la acción reversible. Mantiene `SECURITY INVOKER`, RLS y el contexto del espacio. Conserva la interfaz SQL anterior de listado y el detalle canónico de OCR/asociaciones. No contiene backfill de documentos reales.

`20261008155833_aud_e2e_category_leaf_permissions.sql` concede únicamente al gateway la ejecución de dos helpers invoker ya existentes: resolución de categoría hoja y nombre de categoría. El ensayo desde una DB nueva detectó sus permisos ausentes al ejecutar los triggers y el snapshot de reparto. Los clientes públicos, autenticados y service_role no reciben esos permisos.

## Validación

- TypeScript, build completo, verificadores postbuild y comprobación de whitespace superados tras la paginación.
- PostgreSQL 17.5 mediante PGlite local: 100 migraciones aplicadas, incluidos los dos cambios nuevos. Se conserva el snapshot anterior ejecutable para comparar JSON completo de Presupuestos en siete meses. Pasan saldo canónico, cero válido, reparto, guardado/replay/rechazo/restauración e inmutabilidad del origen bancario.
- SQL documental: motivo/confirmación obligatorios, rechazo de miembros y escrituras entre espacios, vistas y contadores ordinarios, exclusión de archivados, búsqueda por notas, paginación 50+7, replay sin duplicar auditoría, reversión, metadatos originales intactos y ausencia de OCR/asociaciones nuevos. Los fixtures se revierten con ROLLBACK. Se comprueba que la acción no es ejecutable por anon/authenticated/service_role.
- Regresiones de navegador: designación y reversión en ambos temas a 360, 390, 768, 820, 1024, 1348 y 1440 px; errores, borradores, confirmación de propietario, entradas API inválidas, paginación/recarga y teclado. El resultado final se registra en PR/Trello/Notion con el SHA exacto.

Los ensayos SQL usan stubs de auth/storage/vault; comprueban los contratos y permisos ejercitados, no la autenticación completa de Supabase. Las regresiones de interfaz usan respuestas aisladas y no certifican OCR real. Los intentos locales con caché dañada o compilación concurrente se descartaron y las comprobaciones se separaron.

## Pendientes de aceptación

El documento observado `93000000-0000-4000-8000-000000000094` conserva su tratamiento en Producción. Su propietario debe revisar el original antes de usar la nueva acción; esta migración no lo designa, archiva ni modifica. DOC-002 no se cierra con la sola implementación.

VAL-001 requiere una candidata de aplicación y backend realmente aislados, autenticación de propietario/miembro, persistencia y recarga real, y un fixture OCR apto mediante `OCR_LIVE_FIXTURE_DOCUMENT_ID`. Un Preview conectado a la DB de Producción no satisface ese aislamiento. La aceptación restante de exportación/PWA y la instalación de Saldo/Presupuestos se verifican allí antes de un release autorizado. PRE-019 sigue fuera de alcance.

Continuidad: [informe maestro](https://app.notion.com/p/3e622033bf5d812594d0c9713d0b8f29?pvs=204) y las tarjetas existentes del [tablero](https://trello.com/b/hWW3sQWu/financial-app). Conservar la PR en borrador y main/Producción intactos.
