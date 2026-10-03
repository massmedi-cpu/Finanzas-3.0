# 10a · Continuidad y recuperación UX · Financial App 10.0.66

## Objetivo

Revalidar la auditoría UX histórica contra el producto acumulado hasta 10.0.65 y cerrar únicamente la deuda operativa que sigue viva, sin reimplementar mejoras ya absorbidas por releases posteriores.

## Revalidación UX-001…UX-009

| Hallazgo | Estado al iniciar REL-066 | Evidencia / decisión |
| --- | --- | --- |
| UX-001 · onboarding orientado a resultado | ABIERTO | No existe todavía una activación progresiva de primer uso. Se separa de REL-066 porque afecta arquitectura de activación, estados y contenido de varias áreas. |
| UX-002 · cola unificada “Para revisar” | CERRADO previamente | `/review` ya agrega movimientos por revisar, signos, duplicados, recurrentes, documentos, presupuestos, previsiones y estado de fuente con deep-links. |
| UX-003 · navegación persistente | CERRADO previamente | AppShell ofrece navegación primaria persistente en escritorio y dock móvil entre áreas. |
| UX-004 · Recurrentes → Previsión | CERRADO previamente | El flujo conserva contexto de previsión y, tras confirmar una recurrencia, ofrece `Actualizar y ver impacto en Previsión`. |
| UX-005 · continuidad tras guardar en Movimientos | ABIERTO | El guardado recargaba la primera página y perdía el ancla del movimiento. |
| UX-006 · recuperación global de errores | CERRADO previamente | `app/error.tsx` ofrece reintento y vuelta segura a Inicio sin afirmar cambios en la fuente. |
| UX-007 · cambios de filtros sin aplicar | ABIERTO | `draftFilters` y `appliedFilters` existían, pero el usuario no veía si la tabla correspondía a los controles editados. |
| UX-008 · explicación técnica compite con la acción | PENDIENTE DE BLOQUE ESPECÍFICO | Requiere revisión transversal de copy/divulgación progresiva y se abordará junto con onboarding para no fragmentar la arquitectura de información. |
| UX-009 · error de login no asociado/focalizado | ABIERTO | El mensaje usaba `role=alert`, pero no tenía relación ARIA con los campos ni foco predecible. |

## Cambios REL-066

### UX-005 · mantener contexto al guardar

Movimientos conserva el identificador del elemento que originó una edición o revisión antes de refrescar los datos. Tras la recarga:

- si el movimiento sigue en el tramo visible, la fila recupera foco y se centra suavemente en viewport;
- si ya no aparece —porque cambió el filtro efectivo o salió del tramo visible— el aviso de éxito explica expresamente qué ha ocurrido;
- la fila expone un ancla estable `data-transaction-id` y puede recibir foco programático sin entrar en el orden normal de tabulación.

### UX-007 · filtros editados vs aplicados

Se deriva `filtersDirty` comparando el borrador de filtros con el estado aplicado. La interfaz ahora:

- anuncia `Cambios sin aplicar` cuando la tabla todavía refleja el filtro anterior;
- confirma `La tabla refleja estos filtros` cuando ambos estados coinciden;
- desactiva la acción principal cuando no existe nada nuevo que aplicar;
- cambia el texto a `Filtros aplicados` para evitar una acción redundante.

### UX-009 · recuperación accesible del login

El formulario mantiene mensajes genéricos para no enumerar cuentas o credenciales, pero mejora la relación semántica:

- el error tiene id estable `login-error`;
- formulario y campos lo referencian mediante `aria-describedby`;
- solo los fallos de credenciales/autorización marcan los campos con `aria-invalid`;
- fallos temporales o de red no culpan visualmente a las credenciales;
- cuando aparece un error, el aviso recibe foco programático y se anuncia como `role=alert`.

## Gates permanentes

`scripts/verify-ux-continuity-10.0.66.mjs` comprueba la continuidad de UX-002/003/004/005/006/007/009 y evita que se pierdan los cierres ya consolidados.

`tests/e2e/ux-continuity-10.0.66.spec.ts` verifica en navegador que:

- un fallo de credenciales se anuncia, recibe foco y queda asociado a ambos campos;
- un 503 se anuncia y recibe foco sin marcar las credenciales como inválidas.

## Evidencia de cierre REL-066

- candidato funcional certificado: `f68e87018a76e4a851db5a7d0a4663fe9b9b909e`;
- PR de release: `#528`;
- candidatura exacta previa al merge: `3f6d20516a48e93e86ee0a3e0291043d89226755`;
- los 22 workflows de certificación de la candidatura terminaron en `success`, incluido `Release 10.0.66` (run `37133349242`) y `UX 15 User Value`;
- `Production Backup v2` ejecutado sobre el commit funcional exacto, run `37133779151`: validación de identidad, backup, cifrado, Storage y restauración aislada en PostgreSQL 17 completados con éxito;
- commit de publicación: `a97545ef75d654467e4a466b737089c6d98130e9`;
- deployment de producción: `dpl_934XNmy4wzaJ4Vs5PaYD7teH9b2J`;
- URL estable: `https://financialapp-home.vercel.app/`;
- `/api/build` certificó `version=10.0.66`, `targetVersion=10.0.66`, `branch=main`, el commit de publicación y el deployment exacto, con `releaseDeployable=true`;
- Git deployments se cerraron de nuevo tras verificar Producción en el commit `1b0dfb22ae7bfe2f374050cd0b7f4a3122b2fcd2`;
- `Production Postflight` exacto, run `37134103874`: identidad, recorrido desktop/móvil/PWA, seguridad y lectura de datos reales con sesión forzada a solo lectura terminaron en `success`;
- los dispatchers temporales de backup y postflight fueron retirados después de su uso.

## Próximo bloque UX

UX-001 y UX-008 se mantienen explícitamente fuera de esta release para tratarlos juntos como arquitectura de activación y divulgación progresiva, no como parches de copy aislados.

## Estado

REL-066: **CERRADA, CERTIFICADA Y PUBLICADA EN PRODUCCIÓN**.
