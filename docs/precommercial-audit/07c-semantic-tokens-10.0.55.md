# Financial App 10.0.55 · ART-001 · contrato de tokens semánticos

Estado: **candidato en construcción**.

## Objetivo

Cerrar ART-001 sobre el código real actual sin introducir deriva visual: los valores que ya definían superficies, bordes, estados, radios, gradientes y sombras se centralizan en roles semánticos reutilizables y verificables.

## Alcance

- `app/semantic-tokens.css` concentra el contrato semántico de REL-055.
- `app/layout.tsx` carga el contrato inmediatamente después de `globals.css`, de modo que parte de los tokens base existentes y los especializa por función visual.
- `app/app-shell.module.css` migra navegación de escritorio, estados activos/pendientes, instalación PWA, dock móvil y panel móvil.
- `app/net-worth/net-worth.module.css` migra Patrimonio.
- `app/configuration/source/source-overview.module.css` migra la vista simple de Fuente.
- `app/configuration/source/source.module.css` migra Diagnóstico de Fuente.

## Guard permanente

`scripts/verify-semantic-design-tokens.mjs` exige el conjunto mínimo de roles ART-001, verifica la carga global del contrato, comprueba usos semánticos representativos y rechaza colores literales `#hex`, `rgb()` o `rgba()` en las cuatro superficies protegidas.

La intención es que futuras mejoras modifiquen un rol semántico compartido en vez de volver a dispersar decisiones visuales por los componentes.

## Compatibilidad y seguridad

- No se modifica la semántica financiera.
- No se modifica el cálculo de Patrimonio.
- No se modifica la autenticación ni la PWA.
- No se modifica ninguna fuente de datos.
- Google Drive/Sheets y la fuente bancaria oficial permanecen estrictamente en solo lectura.
- No hay cambio de apariencia intencionado: los nuevos tokens conservan los valores que tenían los estilos migrados.

## Certificación requerida

Antes de considerar 10.0.55 candidata a integración deben pasar, sobre el mismo HEAD:

1. guard ART-001 semántico;
2. guard premium heredado de 10.0.54;
3. TypeScript;
4. build de Producción;
5. matriz responsive;
6. regresión Fuente simple + Diagnóstico en escritorio y móvil.

El versionado a `10.0.55` se realizará únicamente después de que el candidato funcional haya superado estas puertas y se recertificará de nuevo con `package.json` y `package-lock.json` alineados.

## Fuera de REL-055

Permanecen como siguientes frentes independientes de dirección de arte:

- ART-003 · unificación de breakpoints;
- ART-005 · reducción de superficies anidadas innecesarias;
- ART-008 / ART-010 · simplificación de backgrounds decorativos y estrategia de tema.
