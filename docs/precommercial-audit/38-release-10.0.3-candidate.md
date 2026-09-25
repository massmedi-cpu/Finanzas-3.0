# Financial App 10.0.3 · sello del candidato

Fecha: 2026-09-25

## Alcance

Este release agrupa todos los cambios acumulados y todavía no publicados desde Financial App 10.0.2:

- navegación y copy de Axioma;
- calendario, procedencia y recurrencias de Previsión;
- Cash Flow reconciliado con hechos bancarios y previsiones;
- separación histórica de límites y objetivos en Presupuestos;
- medición RUM y presupuestos de rendimiento;
- ampliación PRE-025 de límites, recuperación de sesión y edge cases;
- Comparador financiero reconciliado entre dos periodos;
- los contratos y ajustes compatibles del gateway Edge asociados a esos bloques.

No contiene migraciones de base de datos. Los archivos locales no versionados quedan expresamente fuera.

## Identidad

- versión anterior de Production: `10.0.2`;
- versión candidata: `10.0.3`;
- fuente canónica: `package.json`;
- tag inmutable previsto: `v10.0.3`;
- candidato exacto: el commit que contiene este sello.

El SHA se obtiene del propio objeto Git y no se escribe dentro de este archivo para evitar un ciclo autorreferente. `/api/build`, Vercel, Supabase Edge y el manifiesto final deben apuntar a ese SHA o, tras la fusión, al commit exacto de `main` que lo contiene.

## Gate previo a la promoción

Antes de fusionar en `main` deben quedar verdes, sobre el candidato exacto:

1. instalación reproducible, TypeScript y build de producción;
2. regresiones de contratos afectadas;
3. CI obligatorio de GitHub;
4. Vercel Preview READY y `/api/build` con `version=10.0.3` y el SHA candidato;
5. gateway `financial-app-db-gateway` ACTIVE y smoke compatible;
6. ausencia de errores 5xx atribuibles al candidato.

## Gate posterior a la promoción

La publicación sólo se considera terminada cuando:

1. `main` contiene el candidato aprobado;
2. Vercel Production está READY;
3. `https://financialapp-home.vercel.app/api/build` informa `10.0.3`, entorno `production` y el SHA exacto de `main`;
4. autenticación y rutas esenciales responden sin regresiones;
5. los logs de Vercel y Supabase no muestran errores nuevos atribuibles al release;
6. `Publish Verified Release` publica `v10.0.3` y su manifiesto inmutable contra esa misma identidad.

Hasta completar estos puntos, este documento representa un candidato y no una declaración de Production.
