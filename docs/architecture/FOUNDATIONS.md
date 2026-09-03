# Financial App — Fundamentos 0.0.1

## Estado

- Versión: `0.0.1`
- Fase: `1 — Fundamentos`
- Rama de trabajo: `rebuild/phase-1-foundations`
- Producción: no modificar hasta validación de preview
- OCR: fuera del camino crítico; Fase 11

## Principios ya materializados en código

1. La fuente bancaria es externa, inmutable y de solo lectura.
2. Los movimientos se modelan en tres capas:
   - registro original de origen;
   - transacción procesada/normalizada;
   - modificación explícita del usuario.
3. Las modificaciones del usuario no sobrescriben el dato bancario original.
4. Las transferencias internas no se consideran ingreso/gasto por defecto.
5. Sincronización futura: incremental, idempotente y conservadora de overrides.
6. Una sola capa central de formato regional es-ES.
7. Dinero en lógica de aplicación: céntimos enteros seguros.
8. Moneda visual: EUR con exactamente dos decimales.
9. Fecha visual: DD/MM/AAAA en zona Europe/Madrid.
10. Diseño y responsive nacen desde el primer componente mediante tokens globales.
11. Build, rama y commit son identificables desde la propia aplicación y `/api/build`.

## Fuente lógica de verdad

| Dominio | Fuente lógica |
| --- | --- |
| Cuentas | `accounts` |
| Registros bancarios originales | `transaction_source_records` |
| Movimientos procesados | `transactions` |
| Correcciones del usuario | `transaction_overrides` |
| Categorías | `categories` |
| Comercios | `merchants` |
| Presupuestos | `budgets` |
| Recurrentes | `recurrences` |
| Previsiones | `forecast_items` |
| Documentos | `documents` |
| Asociación documento/movimiento | `document_transaction_associations` |

Los nombres anteriores expresan el modelo lógico; no constituyen todavía una migración aplicada.

## Supabase

El proyecto Supabase actualmente conectado contiene tablas de otros desarrollos y un manifiesto previo de Financial App. No se ha reutilizado ninguna tabla ni se ha realizado ninguna modificación estructural durante este bloque.

Antes de materializar el esquema nuevo hay que elegir conscientemente entre:

- un proyecto Supabase dedicado a la nueva Financial App; o
- un aislamiento explícito dentro de la infraestructura existente.

Esta decisión afecta aislamiento de datos, costes, backup y seguridad, por lo que no debe tomarse de forma silenciosa.

## Responsive base

Breakpoints de referencia compartidos:

- 360 px: móvil pequeño
- 480 px: móvil grande
- 768 px: tablet vertical
- 1024 px: tablet horizontal
- 1280 px: portátil
- 1440 px: escritorio
- 1728 px: pantalla ancha

Los componentes pueden adaptarse de forma fluida entre estos puntos; no se usarán como fotografías aisladas.

## Siguiente bloque de Fase 1

1. Materializar modelo persistente reproducible.
2. Definir constraints, índices y auditoría.
3. Definir ownership/RLS según el modelo de autenticación elegido.
4. Implementar repositorios de cuentas y categorías.
5. Añadir pruebas automáticas de dinero, formato y validación.
6. Validar preview y regresión responsive del bootstrap técnico.
