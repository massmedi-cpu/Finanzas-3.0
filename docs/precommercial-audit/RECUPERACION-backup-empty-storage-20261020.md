# Respaldo v2: coherencia de Storage vacío

Bloque del 20/10/2026 sobre `869be8e123507435eb8c27a524f8f4ca5b150606`,
en la rama de PR #619. La candidata sigue en borrador. Este bloque no acredita
un respaldo actual de producción ni cierra AP1–AP8.

## Defectos y reproducción

El creador solo incorporaba `FINANCIAL_APP_STORAGE_ARCHIVE` cuando el inventario
tenía objetos. Sin embargo, Production Backup v2 exige siempre la evidencia del
archivo y su recuperación. Un Storage realmente vacío perdía el archivo y no
podía completar ese flujo.

Además, el validador financiero cotejaba la identidad de los objetos solo si
`objectCount > 0`. Con inventario vacío aceptaba un archivo obsoleto con un objeto,
otro recuento de buckets o un tar ilegible, siempre que su tamaño y hash externo
coincidieran con el manifiesto financiero.

La reproducción usa exclusivamente SQL, inventarios, documentos y archivos tar
sintéticos. Antes de modificar el validador: 4/6 grupos de pruebas PASS y dos
FAIL, porque devolvía `status: ok` ante paquetes incoherentes que debían rechazar.
No se atribuye esta reproducción a un incidente observado en datos reales.

## Cambio

- El creador conserva el archivo indicado también con cero objetos.
- Todo archivo declarado pasa el mismo cotejo de inventario, tenga cero o más
  objetos. Con objetos sigue siendo obligatorio proporcionar un archivo.
- Se mantiene la compatibilidad con respaldos vacíos que no incluyen archivo.
- El ensayo existente de PostgreSQL 17 prepara un archivo vacío a partir del
  recuento real de buckets de su base desechable; lo incorpora mediante el
  creador real, comprueba su evidencia y restaura el resultado con los mismos
  verificadores utilizados por el contrato de producción.

La CLI se prueba con diez casos: cuatro combinaciones válidas de cero/uno
buckets y con/sin archivo; archivo obsoleto; bucketCount distinto; tar ilegible;
versión inválida del manifiesto; inventario no vacío sin/con archivo coherente.
Los contratos anteriores de identidad, tamaños y credenciales siguen activos.

## Validación y límites

| Comprobación local | Resultado |
| --- | --- |
| `node --test tests/backup/*.test.mjs` | 14/14 PASS |
| Contratos de respaldo v1/v2 bajo las dos configuraciones Playwright | 34/34 PASS; sin fixture de navegador |
| Sintaxis Node de creador y validador | PASS |
| `bash -n scripts/phase13-restore-rehearsal-v2.sh` | PASS |
| `git diff --check` | PASS |
| Ensayo de cifrado GPG | No completado: gpg-agent no arranca en este entorno; se mantiene el contrato de CI sin modificar el cifrado |

PostgreSQL no está instalado localmente. La generación desde una base real
desechable, restauración, conteos, exclusión de controles de acceso y prueba
de cifrado deben verificarse en CI para el SHA exacto que contiene este informe.
Los resultados del padre no certifican este cambio. Los contratos estáticos de
Playwright no equivalen a usar la aplicación con un navegador o usuarios reales.

## Pendiente operativo independiente

No se ha disparado un nuevo Production Backup v2. La API disponible de GitHub
no expone workflow_dispatch y la conexión Browser falló al navegar y al volver a
inicializarse, antes de poder pulsar Run workflow. No se reutilizan ejecuciones
antiguas como evidencia de un respaldo actual.

El último respaldo manual SUCCESS localizado es el run `37877870394`, del
09/10/2026 a las 03:08:11 UTC, anterior al commit publicado actual. Para respaldar
la publicación vigente, el procedimiento existente usa main y estos inputs:

- `source_commit`: `6dad59c6c2db3575618a7c91c49c3060a93bbba1`
- `expected_app_version`: `10.0.103`

Workflow: https://github.com/massmedi-cpu/Finanzas-3.0/actions/workflows/production-backup-v2.yml

El flujo manual de main extrae los scripts del commit publicado, no los de esta
candidata. Esta corrección quedará disponible en una publicación futura; no se
promueve código ni se cambia el workflow de main para anticipar una entrega.
El estado publicado permanece en 10.0.103, commit `6dad59c6c2db3575618a7c91c49c3060a93bbba1`.
