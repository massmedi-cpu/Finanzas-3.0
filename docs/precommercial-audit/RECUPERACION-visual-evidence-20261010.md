# RECUPERACION-PRODUCTO-20261009 · Evidencia visual sintética inspeccionada · 10/10/2026

## Procedencia verificable

- Candidata examinada: PR [#601](https://github.com/massmedi-cpu/Finanzas-3.0/pull/601), commit `46eb9ce90824f9cbf25c0ec7c187356514e5f4e3`, **no Producción**.
- Workflow [Product recovery browser matrix](https://github.com/massmedi-cpu/Finanzas-3.0/actions/runs/38036485624): `SUCCESS`, con artefacto temporal `recovery-visual-601-1`, id `11664331912`.
- ZIP descargado del artefacto mediante GitHub Actions, verificado y descomprimido **en entorno de revisión privado**. Inventario: **84 PNG reales generados por Playwright**, equivalentes a 21 rutas × 2 temas × 2 anchuras (360/1366 px). No son capturas de finanzas reales: el suite usa estados sintéticos/no disponibles.
- En navegador la matriz también revisa 11 anchuras, WCAG 2.x con axe y teclado. Un resultado automático PASS **no** equivale a conformidad visual humana o funcional con backend autenticado.

## Hallazgo reproducido AP3-VIS-001 · 404 oculto por prueba demasiado débil

Se inspeccionaron visualmente las imágenes de temas claro y oscuro. **Dos páginas muestran el panel «Esta página no existe»** en ambos temas y tamaños, pese al `SUCCESS` general:

- `/configuration/accounts`
- `/configuration/categories`

Ambas rutas figuraban explícitamente en `tests/e2e/product-recovery-visual.spec.ts`, pero **no existía** el correspondiente `app/configuration/{accounts,categories}/page.tsx`. La prueba requería únicamente un `h1` visible, ausencia de desbordamiento y axe; el panel 404 cumple esas condiciones y generó falsos PASS.

La configuración canónica en `/configuration` ya incluye pestañas funcionales **Cuentas/Categorías**. Duplicar la aplicación para salvar la URL sería incoherente con la simplificación requerida.

## Reparación candidata: PR #602

- [PR #602](https://github.com/massmedi-cpu/Finanzas-3.0/pull/602), DRAFT acumulativa sobre #601.
- Se agregan dos entradas de ruta **mínimas**, ambas reutilizan `ConfigurationClient`, con `initialTab="accounts"` y `"categories"`.
- `ConfigurationClient` conserva su única implementación y expone la pestaña seleccionada mediante `aria-pressed`.
- La matriz exige ahora que ninguna ruta auditada muestre el error `Esta página no existe`. Nueva regresión `REC-UI-CONFIG` comprueba las entradas y la pestaña adecuada.
- Los nombres de PNG nuevos identifican **la ruta de origen**, no solo el hash del test; mejora la revisión de capturas de escritorio/móvil y claro/oscuro.

## Limitaciones, prioridades y tratamiento de originales

Las capturas de #601 provienen de mocks, estados de error, cargas sin sesión y datos sintéticos; muestran varias pantallas vacías o con errores de carga. **Esos avisos no prueban que la aplicación falle con la cuenta autenticada y documentos reales**. Tampoco certifican calidad de tipografía, composición o contraste con contenido completo. Se requiere nueva sesión visual sobre candidata aislada con contenido real protegido y medidas comparables, sin publicar datos privados.

Las 24 muestras OCR autorizadas (16 desarrollo + 8 reserva) siguen pendientes de certificación independiente. AP1–AP8 continúan abiertas; AP3/AP4 no se cierran por dos rutas recuperadas. Producción 10.0.103 y la fuente bancaria de Google Drive permanecen intactas. No publicar ni fusionar esta PR por separado.
