from pathlib import Path

analysis = Path("tests/e2e/analysis.spec.ts")
text = analysis.read_text()
old = '  await expect(page.getByRole("link", { name: /Alimentación/ }).first()).toHaveAttribute("href", new RegExp(`categoryId=${CATEGORY_FOOD}`));'
new = '  const composition = page.locator(\'section[aria-labelledby="distribution-heading"]\');\n  await expect(composition.getByRole("link", { name: /Alimentación/ })).toHaveAttribute("href", new RegExp(`categoryId=${CATEGORY_FOOD}`));'
if text.count(old) != 1:
    raise SystemExit("analysis category drilldown test anchor changed")
analysis.write_text(text.replace(old, new, 1))

visual = Path("tests/e2e/premium-analysis-visual.spec.ts")
text = visual.read_text()
old = '    await expect(page.getByText(/detalle por categorías se consulta en Presupuestos/i)).toBeVisible();'
new = '    await expect(page.getByText(/Detalle por categorías disponible en Presupuestos/i)).toBeVisible();'
if text.count(old) != 1:
    raise SystemExit("premium budget microcopy test anchor changed")
visual.write_text(text.replace(old, new, 1))
