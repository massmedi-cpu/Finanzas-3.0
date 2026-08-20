# Finanzas 3.0

Aplicación financiera personal privada para control de movimientos, presupuestos y previsión financiera.

## Principios permanentes

- Google Sheets como fuente maestra histórica en modo solo lectura.
- La fuente original nunca se modifica desde la aplicación.
- Datos originales y datos enriquecidos separados.
- No se inventan cifras financieras cuando falta información.
- Traspasos internos excluidos de ingresos, gastos y cash flow.
- Acceso privado obligatorio antes de mostrar datos reales.
- Responsive mobile-first y control de regresiones mediante CI.

## V1.1.0

La rama de desarrollo incorpora:

- contrato exacto de 22 columnas de la hoja bancaria;
- adaptador Google Sheets con alcance `spreadsheets.readonly`;
- validación del esquema antes de procesar movimientos;
- cálculo mensual de ingresos, gastos y flujo neto;
- detección de duplicados probables;
- lectura de último saldo conocido por cuenta;
- buscador y filtros de movimientos;
- gasto por categoría;
- detección de recurrencias y previsión a 30 días, 6 meses y 12 meses;
- acceso privado mediante contraseña y cookie de sesión HTTP-only;
- endpoints de salud y validación de sincronización;
- typecheck y build automático en GitHub Actions.

## Seguridad

Nunca deben subirse al repositorio:

- credenciales;
- claves privadas;
- identificadores privados de hojas;
- bases de datos personales;
- CSV/XLSX/PDF con movimientos;
- exportaciones o copias de seguridad financieras.

Las variables necesarias se documentan en `.env.example` y deben configurarse únicamente en el entorno privado de despliegue.
