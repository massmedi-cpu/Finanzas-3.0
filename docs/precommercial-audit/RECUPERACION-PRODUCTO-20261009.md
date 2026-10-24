# Recuperación de producto · 09/10/2026

El propietario ha rechazado el resultado de producto posterior al cierre técnico de 10.0.103. La aceptación se reabre sin alterar los resultados históricos. Esta rama acumula correcciones y no autoriza una publicación parcial.

## Identidad y límites

- Base: `ae2b75caa090af4acd2a70c370638715ceb1cfb2`, rama `work/product-recovery-20261009`.
- Producción observada: 10.0.103, commit `6dad59c6c2db3575618a7c91c49c3060a93bbba1`, deployment `dpl_34WhAcvVpP6YrdbxAckDgm3TWwz5`.
- El Axioma original completo, §§0–145, y la auditoría anterior completa se han leído. El plan histórico no demuestra aceptación actual.
- Sheets bancario y originales financieros: solo lectura. Datos sintéticos exclusivamente aislados. Patrimonio/PRE-019 y beta humana externa excluidos por instrucción vigente.
- Seguimiento: [tarjeta de recuperación](https://trello.com/c/g8rebZin), Notion y Gantt existentes. El Gantt distingue el cierre técnico de la aceptación REABIERTA.

## Cambios presentes

Inicio prioriza cifras y evolución, reserva conclusiones favorables cuando falta cobertura y conserva las fechas del saldo. Los meses desconocidos no se dibujan como ceros ni se guardan como cifras válidas en la comparación entre visitas. La evolución permite consultar los importes y abrir los movimientos del mismo mes; la privacidad también gobierna la tabla.

La navegación de escritorio usa una columna persistente desde 1.100 px. La navegación móvil mantiene los destinos y prelectura por intención. Se elimina la precarga automática de rutas al entrar. Los diálogos globales usan el cuerpo del documento y mantienen foco, cierre con Escape y recuperación del foco. Las superficies y colores de los módulos consumen tokens semánticos compartidos para ambos temas.

## Evidencia actual y límites

La compilación optimizada y sus 45 comprobaciones acumulativas pasan. La ejecución local usa Chromium 153.0.8010.0 y Node 24.19.0. La matriz nueva recorre 21 rutas en dos temas y 11 tamaños; verifica disposición, teclado y accesibilidad con axe 4.13.0. Su ejecución inicial aún detecta problemas y no cierra AP3. Los ensayos de interfaz emplean datos sintéticos o estados no disponibles y no certifican persistencia real.

Una comparación de Inicio con diez repeticiones por candidata y base elimina 18 solicitudes anticipadas de rutas: 0 en la recuperación. Los tiempos corresponden a interfaz sintética sobre servidor local optimizado; API, red y base financiera real deben medirse por separado. No son Core Web Vitals de campo.

Se han conservado 24 originales autorizados de ocho grupos visuales provisionales, descargados en solo lectura y verificados por tamaño y SHA-256. Hay 16 documentos de desarrollo y ocho reservados sin abrir. El primer ensayo de desarrollo extrae texto nativo en 34 páginas y reproduce errores de interpretación y confianza: datos de destinatario y fechas de texto legal pueden resultar marcados como fiables. La preparación del corpus no certifica heterogeneidad, transcripción ni precisión. Las clases fotográficas y la independencia entre plantillas de desarrollo/reserva siguen por comprobar. Los originales y los resultados privados no se incorporan al repositorio público ni a CI.

## Puertas independientes

| Puerta | Estado | Evidencia que falta para cerrar |
| --- | --- | --- |
| AP1 · Integridad financiera | PENDIENTE | Regresión canónica y conciliación de la candidata exacta |
| AP2 · Funcionalidad y persistencia | PENDIENTE | Supabase/Auth/Storage reales aislados, guardado y relectura |
| AP3 · Interfaz, temas y accesibilidad | PARCIAL | Corregir fallos de la matriz y revisar estados con contenido real aislado |
| AP4 · Editorial es-ES | PARCIAL | Revisión completa de textos y estados interactivos |
| AP5 · Gráficas | PARCIAL | Inventario y aceptación individual de todas las gráficas |
| AP6 · Rendimiento | PARCIAL | API/base, frío/caliente, 10.000/50.000 y objetivos completos |
| AP7 · OCR heterogéneo | FALLIDO | Referencias verificadas, clases diversas, confianza y evaluación reservada |
| AP8 · Release y recuperación | PENDIENTE | Todas las puertas anteriores, backup, restore y postflight exactos |

No hay aceptación expresa del propietario ni candidata final aprobada. Se conserva Producción. Solo se publicará una versión acumulativa al cumplir todas las puertas.
