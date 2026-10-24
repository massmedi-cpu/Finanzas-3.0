# REC-OWNER-300–302 · Financial App exclusivamente personal
Fecha: 22/10/2026 · Decisión explícita del propietario: no existe producto multiusuario.

## Alcance de la simplificación visible

- Navegación principal y navegación de Configuración revisadas: no muestran invitaciones, miembros, equipos, colaboración, roles ni cambio de espacios. **Cuentas** y **Crear cuenta** se refieren a cuentas **bancarias**, no a usuarios; se conservan.
- Datos y privacidad: la tarjeta de seguridad se presenta como «Acceso privado a mis datos» y desaparecen del texto explicativo «multiusuario», «cuentas compartidas», «equipos» y «espacios de trabajo».
- Fuente bancaria: en los tres estados de autorización fallida, el mensaje pasa a «La sesión actual no tiene acceso a esta fuente bancaria»; no sugiere que puedan elegirse otros espacios de trabajo.
- Borrado de datos personales: etiqueta «Borrado definitivo de mis datos», sin cambio del contrato interno ni activación de la operación. La política de ejecución y confirmaciones continúan intactas.
- No se han añadido gestores de perfiles, invitaciones o menús de colaboración. Ninguna acción bancaria ni borrado se ha invocado.

## Seguridad conservada

- Continúan el inicio/cierre de sesión, cookies seguras, verificaciones de propiedad y contexto en servidor, controles de fuente bancaria oficial en **solo lectura**, límites del gateway, RLS y restricciones de documentos originales.
- `workspace`, `tenant` y las tablas internas pueden seguir existiendo como garantías técnicas; **no** constituyen opciones para varios usuarios ni requieren contratar más servicios.
- No se modifica Google Sheets, Supabase productivo, claves, cuentas bancarias o documentos privados. No se despliega ni fusiona PR #619.

## Regresiones obligatorias

- **REC-OWNER-300**: menús principal y configuración sin rutas/etiquetas de multiusuario, conservando «Cuentas» bancarias.
- **REC-OWNER-301**: página real «Datos y privacidad» sin controles ni textos multiusuario; acceso a exportación personal conservado.
- **REC-OWNER-302**: mensajes de autenticación y borrado usan lenguaje personal, manteniendo la autorización en el servidor y el cierre de sesión.
- La suite `tests/e2e/data-trust.spec.ts` queda incluida en la fase **Integrated module regressions** de `.github/workflows/product-recovery-ui.yml`, y el guard `scripts/verify-recovery-visual-suite-gate.mjs` verifica la selección de las tres regresiones.

## Aceptación pendiente

La eliminación de requisitos multiusuario **no** elimina la autenticación ni sustituye los ensayos del OCR privado G5, restore y rollback aislados, gateway postflight real y conciliación bancaria con importación segura. La prueba exacta de CI para el commit de este cambio solo puede declararse PASS tras su finalización; el commit anterior `fbbe613e` sí acabó en 86 SUCCESS, 1 SKIPPED, 0 FAILURE.

## Barrido adicional de componentes financieros

- Revisión de pantallas de movimientos, análisis, presupuestos, documentos, OCR, cuentas bancarias, previsión, comparador, inicio, navegación móvil y menús de Configuración: sin menús ni botones para miembros, invitaciones o cambios de espacio. Las clases CSS `workspace` y el estado técnico `workspaceSessionMissing` no se muestran al usuario y se preservan por compatibilidad.
- Encontrados dos mensajes adicionales en la pantalla alternativa `app/configuration/source/source-client.tsx`. Ambos pasan a «La sesión actual no tiene acceso a esta fuente bancaria». REC-OWNER-302 ahora protege también esa pantalla.
