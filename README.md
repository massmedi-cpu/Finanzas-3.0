# Financial App

Construcción desde cero de una nueva Financial App.

## Versión actual

El código toma su versión de `package.json`. La versión publicada se comprueba en
`https://financialapp-home.vercel.app/api/build`; una rama candidata no equivale a Production.

## Objetivo de versión

La reconstrucción comenzó en `0.0.1`. A partir de `10.0.0`, cada mejora publicada
incrementa la versión conforme a `docs/precommercial-audit/21-production-versioning-policy.md`.

## Regla de reconstrucción

La rama activa no reutiliza código funcional heredado de la aplicación anterior salvo decisión explícita. El proyecto y el dominio de producción de Vercel sí se conservan para mantener continuidad de infraestructura y URL.
