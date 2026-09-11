# CR-006 · Matriz operativa de beta humana

Fecha de activación: 2026-09-12  
Estado global: **PENDIENTE DE BETA HUMANA**  
Regla: ninguna celda humana puede marcarse PASS sin una persona real y evidencia verificable.

## 1. Participantes

| Perfil | Participante real | Dispositivo principal | Estado |
| --- | --- | --- | --- |
| B01 · Poco tecnológico | PENDIENTE | PENDIENTE | PENDIENTE DE BETA HUMANA |
| B02 · Banca digital | PENDIENTE | PENDIENTE | PENDIENTE DE BETA HUMANA |
| B03 · Finanzas avanzadas | PENDIENTE | PENDIENTE | PENDIENTE DE BETA HUMANA |
| B04 · Móvil | PENDIENTE | Smartphone real | PENDIENTE DE BETA HUMANA |
| B05 · Escritorio | PENDIENTE | Windows/PC | PENDIENTE DE BETA HUMANA |
| B06 · Accesibilidad | PENDIENTE | PENDIENTE | PENDIENTE DE BETA HUMANA |
| B07 · Breaker | PENDIENTE | PENDIENTE | PENDIENTE DE BETA HUMANA |
| B08 · Nuevo sin contexto | PENDIENTE | PENDIENTE | PENDIENTE DE BETA HUMANA |

La validación del propietario se registra aparte y no rellena esta tabla como beta externa.

## 2. Recorridos H01–H08

| Recorrido | Tester real | SHA/entorno | Evidencia | Resultado | Retest |
| --- | --- | --- | --- | --- | --- |
| H01 · Acceso privado | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| H02 · Orientación/navegación | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| H03 · Comprensión financiera | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| H04 · Movimientos | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| H05 · Presupuestos | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| H06 · Previsión/dinámico | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| H07 · Documentos/OCR | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| H08 · Móvil completo | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |

## 3. Matriz de cobertura de producto

| Área | Técnica | Humana | Retest humano | Resultado |
| --- | --- | --- | --- | --- |
| Login | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Inicio | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Movimientos | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Cuentas | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Categorías | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Presupuestos | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Recurrentes | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Previsión | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Análisis | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Documentos | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| OCR | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Mobile | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Teclado | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Reflow | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Contraste | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Screen reader | REVALIDAR EN CANDIDATO | PENDIENTE | PENDIENTE | PENDIENTE |
| Seguridad | REVALIDAR EN CANDIDATO | PENDIENTE/NO APLICA SEGÚN TAREA | PENDIENTE | PENDIENTE |

`REVALIDAR EN CANDIDATO` no significa FAIL ni PASS: evita reutilizar evidencia automática de un SHA distinto como si certificara el candidato humano actual.

## 4. Accesibilidad humana

| Prueba | Persona real | Entorno | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| A01 · Teclado | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| A02 · Saltar al contenido | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| A03 · Zoom 200 % | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| A04 · Reflow/400 % | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| A05 · Contraste/forced colors | PENDIENTE | PENDIENTE | PENDIENTE | PENDIENTE |
| A06 · Lector de pantalla | PENDIENTE | NVDA/TalkBack u otro real | PENDIENTE DE EVIDENCIA HUMANA DE LECTOR DE PANTALLA | PENDIENTE |

## 5. Registro de incidencias

No se reutiliza un hallazgo como cerrado por una regresión automática. Cuando nazca de una sesión humana se añade aquí y permanece **PENDIENTE DE RETEST** tras su corrección hasta nueva comprobación humana.

| ID | Tester | Fecha | Sección/H | Severidad | Estado | SHA hallazgo | SHA corrección | Retest humano | Evidencia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — | — | — | — | — |

### Plantilla CR006-BETA-XXX

```text
ID: CR006-BETA-XXX
Tester: B0X / alias real
Fecha:
Dispositivo:
Sistema:
Navegador:
Sección:
Recorrido: H0X
Severidad: BLOCKER / MAJOR / MINOR / OBSERVATION

Descripción:

Pasos para reproducir:
1.
2.
3.

Resultado esperado:
Resultado real:
Evidencia:
Reproducibilidad: siempre / frecuente / ocasional / una vez
Estado: ABIERTO / CORREGIDO / PENDIENTE DE RETEST / CERRADO
SHA hallazgo:
SHA corrección:
Fecha y persona de retest:
```

## 6. Plantilla de sesión humana

```text
Participante/alias:
Perfil B01–B08:
Fecha y hora real:
SHA probado:
Entorno/URL beta:
Dispositivo:
Sistema:
Navegador/versión:
Entrada: ratón / táctil / teclado
Tecnología asistiva:
Zoom/reflow:
Forced colors/contraste:

H01: PASS / FAIL / NO PROBADO · notas/evidencia
H02: PASS / FAIL / NO PROBADO · notas/evidencia
H03: PASS / FAIL / NO PROBADO · notas/evidencia
H04: PASS / FAIL / NO PROBADO · notas/evidencia
H05: PASS / FAIL / NO PROBADO · notas/evidencia
H06: PASS / FAIL / NO PROBADO · notas/evidencia
H07: PASS / FAIL / NO PROBADO · notas/evidencia
H08: PASS / FAIL / NO PROBADO · notas/evidencia

¿En algún momento no sabías dónde estabas o cómo volver?:
¿Qué fue lo más confuso?:
¿Qué pareció más lento?:
¿Qué transmitió menos confianza?:
¿Parece una aplicación terminada?:
¿Pagarías por un producto con este nivel de acabado?:

Hallazgos CR006-BETA asociados:
```

## 7. Estado de salida

- Testers reales externos suficientes: **PENDIENTE**.
- H01–H08 completos: **PENDIENTE**.
- Móvil real: **PENDIENTE**.
- Teclado humano: **PENDIENTE**.
- Zoom/reflow humano: **PENDIENTE**.
- Contraste humano: **PENDIENTE**.
- Lector de pantalla humano o justificación formal: **PENDIENTE**.
- BLOCKER abiertos: **NO DETERMINADO HASTA EJECUTAR BETA**.
- MAJOR abiertos: **NO DETERMINADO HASTA EJECUTAR BETA**.
- CR-006: **BETA NO CERRABLE POR COBERTURA HUMANA INCOMPLETA**.
- CR-008: **BLOQUEADA**.
