from pathlib import Path


def rep(text, old, new, count=1):
    if old not in text:
        raise SystemExit(f'No encontrado: {old[:120]!r}')
    return text.replace(old, new, count)

client_path = Path('app/transactions/transactions-client.tsx')
css_path = Path('app/transactions/transactions.module.css')
test_path = Path('tests/e2e/premium-transaction-editor-contract.spec.ts')

client = client_path.read_text()
client = rep(client, '  reviewState: string;\n', '')
client = rep(client, '  reviewStateMode: "inherit" | "set";\n  reviewState: string;\n', '')
client = rep(client, '  reviewState: "",\n', '')
client = rep(client, 'const REVIEW_LABELS: Record<ReviewState, string> = {\n  confirmed: "Confirmado",\n  pending: "Pendiente",\n  needs_review: "Revisar",\n};\n\n', '')
client = rep(client, '  reviewState: "revisión",\n', '')
client = rep(client, '    ["reviewState", "reviewState"],\n', '')
client = rep(client, '    reviewStateMode: row.overriddenFields.includes("reviewState") ? "set" : "inherit",\n    reviewState: row.reviewState.effective,\n', '')
client = rep(client, '    reviewState: editor.reviewStateMode === "inherit" ? null : editor.reviewState,\n', '')
client = rep(client, '  const [bulkReview, setBulkReview] = useState(UNCHANGED);\n', '')
client = rep(client, '    const reviewState = params.get("reviewState");\n', '')
client = rep(client, '      reviewState: reviewState && Object.prototype.hasOwnProperty.call(REVIEW_LABELS, reviewState) ? reviewState : "",\n', '')
client = rep(client, '    if (bulkReview !== UNCHANGED) {\n      patch.reviewState = bulkReview === INHERIT ? null : bulkReview;\n    }\n', '')
client = rep(client, '      setBulkReview(UNCHANGED);\n', '')
client = rep(client, '''        <label>\n          <span>Revisión</span>\n          <select value={draftFilters.reviewState} onChange={(event) => updateFilter("reviewState", event.target.value)}>\n            <option value="">Todos</option>\n            {(Object.entries(REVIEW_LABELS) as Array<[ReviewState, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}\n          </select>\n        </label>\n''', '')
client = rep(client, '''          <label><span>Revisión</span><select data-testid="bulk-review" value={bulkReview} onChange={(event) => setBulkReview(event.target.value)}>\n            <option value={UNCHANGED}>Sin cambiar</option><option value={INHERIT}>Restaurar automática</option>\n            {(Object.entries(REVIEW_LABELS) as Array<[ReviewState, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}\n          </select></label>\n''', '')
client = rep(client, '<thead><tr><th className={styles.selectHeading}>Sel.</th><th>Fecha</th><th>Concepto y trazabilidad</th><th>Cuenta</th><th>Categoría</th><th>Estado</th><th className={styles.amountHeading}>Importe</th><th>Gestión</th></tr></thead>', '<thead><tr><th className={styles.selectHeading}>Sel.</th><th>Fecha</th><th>Concepto y trazabilidad</th><th>Cuenta</th><th>Categoría</th><th className={styles.amountHeading}>Importe</th><th>Gestión</th></tr></thead>')
client = rep(client, '<div className={styles.conceptTop}><strong>{row.concept.effective}</strong>{row.hasUserOverride && <span className={styles.overrideChip}>Modificado</span>}{row.excludedFromAnalytics && <span className={styles.mutedChip}>Fuera de analítica</span>}</div>', '<div className={styles.conceptTop}><strong>{row.concept.effective}</strong>{row.overriddenFields.some((field) => field !== "reviewState") && <span className={styles.overrideChip}>Modificado</span>}{row.excludedFromAnalytics && <span className={styles.mutedChip}>Fuera de analítica</span>}{row.duplicateState !== "none" && <span className={styles.duplicateChip}>{DUPLICATE_LABELS[row.duplicateState]}</span>}{row.transferPairId && <span className={styles.transferChip}>Transferencia emparejada</span>}</div>')
client = rep(client, '{row.overriddenFields.length > 0 && <div><dt>Campos modificados</dt><dd>{row.overriddenFields.map((field) => OVERRIDE_LABELS[field] ?? field).join(", ")}</dd></div>}', '{row.overriddenFields.some((field) => field !== "reviewState") && <div><dt>Campos modificados</dt><dd>{row.overriddenFields.filter((field) => field !== "reviewState").map((field) => OVERRIDE_LABELS[field] ?? field).join(", ")}</dd></div>}')
client = rep(client, '                      <td data-label="Estado"><div className={styles.statusStack}><span className={`${styles.stateChip} ${styles[row.reviewState.effective]}`}>{REVIEW_LABELS[row.reviewState.effective]}</span>{row.duplicateState !== "none" && <span className={styles.duplicateChip}>{DUPLICATE_LABELS[row.duplicateState]}</span>}{row.transferPairId && <span className={styles.transferChip}>Transferencia emparejada</span>}</div></td>\n', '')
client = client.replace('<td colSpan={8}>', '<td colSpan={7}>')
client = rep(client, '                            <label className={`${styles.editorField} ${styles.reviewField}`}><span>Revisión</span><select data-testid="edit-review" value={editor.reviewState} onChange={(event) => setEditor({ ...editor, reviewStateMode: "set", reviewState: event.target.value })}>{(Object.entries(REVIEW_LABELS) as Array<[ReviewState, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{editor.reviewStateMode === "set" ? <button className={`${styles.secondaryButton} ${styles.fieldRestore}`} type="button" disabled={saving} onClick={() => setEditor({ ...editor, reviewStateMode: "inherit", reviewState: row.reviewState.original })}>Restaurar valor detectado: {REVIEW_LABELS[row.reviewState.original]}</button> : null}</label>\n', '')
client_path.write_text(client)

css = css_path.read_text()
css = rep(css, '  grid-template-columns: minmax(15rem, 1.5fr) minmax(12rem, 1fr) minmax(12rem, 1fr) auto;\n', '  grid-template-columns: minmax(15rem, 1.5fr) minmax(12rem, 1fr) auto;\n')
css = rep(css, '.table { width: 100%; min-width: 1040px;', '.table { width: 100%; min-width: 940px;')
css = rep(css, '.table th:nth-child(3) { width: 30%; }\n.table th:nth-child(4) { width: 13%; }\n.table th:nth-child(5) { width: 13%; }\n.table th:nth-child(6) { width: 9.5rem; }\n.table th:nth-child(7) { width: 8.5rem; }\n.table th:nth-child(8) { width: 10rem; }', '.table th:nth-child(3) { width: 34%; }\n.table th:nth-child(4) { width: 14%; }\n.table th:nth-child(5) { width: 15%; }\n.table th:nth-child(6) { width: 8.5rem; }\n.table th:nth-child(7) { width: 10rem; }')
css = rep(css, '.overrideChip, .mutedChip, .stateChip, .duplicateChip, .transferChip', '.overrideChip, .mutedChip, .duplicateChip, .transferChip')
for line in [
'.confirmed { background: rgba(53, 208, 127, .11); color: #8ee7b3; }\n',
'.pending { background: rgba(255, 191, 71, .11); color: #ffd583; }\n',
'.needs_review { background: rgba(255, 93, 115, .11); color: #ffb3be; }\n',
'.statusStack { display: flex; flex-direction: column; align-items: flex-start; gap: .35rem; }\n']:
    css = rep(css, line, '')
css = rep(css, '  grid-template-columns: minmax(0, 2.25fr) minmax(0, 2.25fr) minmax(0, 1.35fr) minmax(0, 1.35fr);\n  grid-template-areas:\n    "concept concept concept merchant"\n    "category subcategory type review"\n    "note note note analytics"\n    "assignment assignment assignment assignment";', '  grid-template-columns: minmax(0, 2.25fr) minmax(0, 2.25fr) minmax(0, 1.35fr);\n  grid-template-areas:\n    "concept concept merchant"\n    "category subcategory type"\n    "note note analytics"\n    "assignment assignment assignment";')
css = rep(css, '.reviewField { grid-area: review; }\n', '')
css = rep(css, '      "category subcategory"\n      "type review"\n      "note note"', '      "category subcategory"\n      "type type"\n      "note note"')
css = rep(css, '      "subcategory"\n      "type"\n      "review"\n      "note"', '      "subcategory"\n      "type"\n      "note"')
css_path.write_text(css)

test = test_path.read_text()
test = rep(test, '  expect(client).toContain(\'reviewStateMode: "inherit" | "set"\');\n', '  expect(client).not.toContain(\'data-testid="edit-review"\');\n  expect(client).not.toContain(\'data-testid="bulk-review"\');\n  expect(client).not.toContain(\'<span>Revisión</span>\');\n')
test = rep(test, '  expect(css).toContain(\'"category subcategory type review"\');\n', '  expect(css).toContain(\'"category subcategory type"\');\n')
test_path.write_text(test)

contract = Path('tests/e2e/no-review-ui-contract.spec.ts')
contract.write_text('''import { expect, test } from "@playwright/test";\nimport fs from "node:fs";\n\nconst client = fs.readFileSync("app/transactions/transactions-client.tsx", "utf8");\n\ntest("Movimientos no expone el estado de revisión manual", async () => {\n  expect(client).not.toContain('updateFilter("reviewState"');\n  expect(client).not.toContain('data-testid="edit-review"');\n  expect(client).not.toContain('data-testid="bulk-review"');\n  expect(client).not.toContain('<span>Revisión</span>');\n  expect(client).not.toContain('<th>Estado</th>');\n  expect(client).toContain('row.overriddenFields.some((field) => field !== "reviewState")');\n  expect(client).toContain('row.duplicateState !== "none" && <span className={styles.duplicateChip}');\n});\n''')
