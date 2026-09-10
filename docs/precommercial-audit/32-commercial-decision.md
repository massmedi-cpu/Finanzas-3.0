# 32 · Decisión comercial final

Fecha: 2026-09-10 (Europe/Madrid)

# VEREDICTO: NO APTA PARA SALIDA COMERCIAL PÚBLICA

La decisión no significa que la aplicación haya fracasado técnicamente. La auditoría demuestra una mejora grande y una base mucho más sólida. Significa que, bajo el estándar exigido para vender una aplicación financiera a terceros, todavía existen obligaciones comerciales y de ciclo de datos que no deben fingirse como resueltas.

## Qué sí queda demostrado

- arquitectura y modelo financiero con controles acumulativos;
- fuente bancaria oficial estrictamente read-only;
- aislamiento workspace/cross-tenant probado;
- bloqueo de mutaciones Preview→Production;
- release/provenance verificables;
- navegación/AppShell y experiencia móvil mejoradas;
- Análisis, Para revisar y Primeros pasos;
- visualización financiera accesible en la cobertura automatizada;
- concurrencia/idempotencia reforzadas;
- validación de contenido documental y OCR aislado;
- PRE-020 con contrato de confianza, export estructurado, impacto/intención/readiness y rehearsals DB/Storage sin activar destrucción comercial;
- regresión técnica completa verde en el candidato previo al sello documental;
- segunda beta heurística: 50,00 % → 93,75 % con la misma rúbrica.

## Bloqueos para venderla públicamente

1. **Ciclo de datos comercial incompleto:** el borrado self-service no está activado y no existe executor runtime aprobado.
2. **Retención/recibo post-borrado:** falta una política comercial definida y aprobada.
3. **Legal y confianza institucional:** privacidad, condiciones y tratamiento contractual no deben inventarse desde código.
4. **Soporte/estado del servicio:** no existe todavía un compromiso comercial definido.
5. **Net Worth:** PRE-019 debe implementarse antes de anunciar patrimonio/net worth; hoy no se debe prometer esa métrica.
6. **Validación humana:** la beta comparativa realizada es heurística; falta beta con usuarios reales y revisión humana de accesibilidad/diseño antes de venta pública.
7. **Medición operativa:** RUM/Web Vitals y presupuestos de rendimiento comerciales siguen condicionados a tráfico real.
8. **Controles dependientes de plataforma/operación:** cualquier protección de credenciales filtradas, rate limiting, observabilidad y procedimientos de respuesta deben revisarse con el plan/infraestructura comercial definitivos.

## Uso controlado

La rama auditada puede seguir utilizándose como **candidato técnico de evaluación/Preview controlado**, siempre respetando sus gates y sin interpretar este informe como autorización de promoción a Production.

## Qué haría cambiar el veredicto

Una nueva decisión APTA/APTA CON CONDICIONES exigiría, como mínimo, cerrar las obligaciones legales/retención/soporte, terminar el ciclo de datos comercial realmente expuesto al usuario, decidir e implementar PRE-019 si se comercializa esa promesa, ejecutar beta humana + accesibilidad, incorporar medición operativa y pasar un release candidate exacto por QA/post-promoción.

## Regla final

La auditoría puede estar **100 % completada** aunque el producto resulte **NO APTO para comercialización pública**. El porcentaje mide trabajo de auditoría ejecutado, no porcentaje de readiness comercial.

Production/main no se modifican por esta decisión.