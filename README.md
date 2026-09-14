# Financial App

Financial App es una aplicación personal de finanzas construida con Next.js, TypeScript, Supabase y Vercel.

## Estado actual

- Versión de aplicación: 10.0.2.
- Fuente bancaria oficial: estrictamente de solo lectura.
- Persistencia financiera y modificaciones manuales: Supabase.
- Catálogo de categorías: 64 categorías de sistema jerárquicas, editables mediante la configuración sin modificar la fuente bancaria.
- Categorización automática: prioridad manual > regla personalizada > comercio > catálogo integrado.
- OCR y documentos: aislados del núcleo financiero para evitar degradaciones cruzadas.

## Principios de implementación

- Datos monetarios en céntimos enteros y presentación `es-ES` / EUR.
- Zona horaria de producto: Europe/Madrid.
- Cambios acumulativos, verificables y reversibles.
- Responsive y accesibilidad como requisitos de base.
- La categorización automática puede recalcular decisiones del sistema, pero nunca debe sobrescribir una corrección manual del usuario.

## Verificación

Las migraciones y cambios funcionales deben comprobarse antes de integrarse en `main`. Las pruebas que escriben en base de datos deben ejecutarse dentro de transacciones con `ROLLBACK` o en entornos aislados, manteniendo la política que impide escrituras de Preview sobre Production.
