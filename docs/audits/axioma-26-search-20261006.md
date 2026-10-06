# AUD-004 · Axioma §26 · buscador de Movimientos

Fecha: 2026-10-06  
Release candidata: Financial App 10.0.84  
Base al iniciar: Financial App 10.0.83

## Fuente normativa

El §26 del Prompt Maestro Axioma exige un buscador de Movimientos combinable que alcance datos bancarios y metadatos añadidos posteriormente.

## Estado comprobado antes del bloque

Financial App 10.0.83 ya permitía combinar:

- texto por concepto, comercio, categoría y cuenta;
- cuenta;
- categoría y subcategoría mediante el árbol común de categorías;
- comercio;
- tipo;
- estado de revisión;
- estado de duplicado;
- control de signo;
- fecha inicial y final.

No existía filtro de rango de importes y la búsqueda textual no consultaba la nota manual del movimiento.

## Implementación 10.0.84 · tramo 1

- Añade importe mínimo y máximo en EUR a la interfaz de Movimientos.
- Convierte el importe a céntimos enteros antes de enviarlo al backend.
- Valida en cliente, API, gateway y SQL que el rango sea coherente.
- Incorpora la nota manual y claves de trazabilidad de origen al buscador textual.
- Mantiene el motor anterior intacto y crea `query_effective_transactions_v2`.
- Mantiene la fuente bancaria estrictamente de solo lectura.
- Restringe la ejecución directa de la función a los roles internos autorizados.
- Incorpora un gate permanente de regresión en `postbuild`.

## Verificación de base de datos

La migración se ha aplicado de forma reproducible. Se comprobó en la base conectada:

- existencia de la función v2;
- resultados del rango dentro de los límites solicitados;
- búsqueda por una nota persistida;
- `anon` sin permiso de ejecución;
- `authenticated` sin permiso de ejecución;
- `financial_app_gateway` con permiso de ejecución.

## Alcance pendiente del §26

Este release no declara cerrado el §26 completo. Siguen pendientes de auditoría/implementación específica los criterios cuya semántica todavía no está normalizada en el modelo de Movimientos, entre ellos etiquetas generales, canal, recurrencia, conciliación, documentos/OCR y contraparte.

La 10.0.84 debe considerarse un avance acumulativo y no una sustitución del buscador existente.
