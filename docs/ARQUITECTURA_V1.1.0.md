# Finanzas 3.0 — Arquitectura V1.1.0

## Objetivo
Consolidar una arquitectura profesional preparada para evolución continua.

## Principios

- La fuente original financiera permanece protegida.
- Google Sheets/Drive actúa como origen de datos inicial solo lectura.
- La aplicación trabaja con datos internos optimizados.
- Toda modificación mantiene trazabilidad.
- Las mejoras deben evitar regresiones.

## Capas previstas

### App
Interfaz Next.js, navegación y experiencia de usuario.

### Domain
Reglas financieras del negocio:
- cuentas
- movimientos
- categorías
- presupuestos
- objetivos
- previsiones

### Services
Servicios externos e internos:
- sincronización
- procesamiento financiero
- análisis
- inteligencia artificial

### Database
Persistencia, migraciones y auditoría.

## Evolución V1.1.0

Prioridades:
1. Consolidar modelos financieros.
2. Evitar duplicidad entre estructuras existentes.
3. Preparar presupuestos inteligentes.
4. Preparar motor predictivo.
5. Mantener compatibilidad con V1.0.0.
