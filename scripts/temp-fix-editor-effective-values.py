from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 occurrence, found {count}")
    return text.replace(old, new, 1)

client_path = Path("app/transactions/transactions-client.tsx")
css_path = Path("app/transactions/transactions.module.css")
test_path = Path("tests/e2e/premium-transaction-editor-contract.spec.ts")

client = client_path.read_text()

client = replace_once(
    client,
    '''type EditorState = {\n  concept: string;\n  merchant: string;\n  categoryMode: CategoryEditorMode;\n  categoryRoot: string;\n  categoryLeaf: string;\n  kind: string;\n  reviewState: string;\n  excludedFromAnalytics: boolean;\n  note: string;\n};''',
    '''type EditorState = {\n  concept: string;\n  merchantMode: "inherit" | "set";\n  merchant: string;\n  categoryMode: CategoryEditorMode;\n  categoryRoot: string;\n  categoryLeaf: string;\n  kindMode: "inherit" | "set";\n  kind: string;\n  reviewStateMode: "inherit" | "set";\n  reviewState: string;\n  excludedFromAnalytics: boolean;\n  note: string;\n};''',
    "EditorState",
)

client = replace_once(
    client,
    '''    concept: row.concept.effective,\n    merchant: merchantWasOverridden ? (row.merchant.effectiveId ?? NONE) : INHERIT,\n    categoryMode: categoryWasOverridden ? "set" : "inherit",\n    categoryRoot: selection.root,\n    categoryLeaf: selection.leaf,\n    kind: row.overriddenFields.includes("kind") ? row.kind.effective : INHERIT,\n    reviewState: row.overriddenFields.includes("reviewState") ? row.reviewState.effective : INHERIT,''',
    '''    concept: row.concept.effective,\n    merchantMode: merchantWasOverridden ? "set" : "inherit",\n    merchant: row.merchant.effectiveId ?? NONE,\n    categoryMode: categoryWasOverridden ? "set" : "inherit",\n    categoryRoot: selection.root,\n    categoryLeaf: selection.leaf,\n    kindMode: row.overriddenFields.includes("kind") ? "set" : "inherit",\n    kind: row.kind.effective,\n    reviewStateMode: row.overriddenFields.includes("reviewState") ? "set" : "inherit",\n    reviewState: row.reviewState.effective,''',
    "editorFor",
)

client = replace_once(
    client,
    '''    merchantMode: editor.merchant === INHERIT ? "inherit" : "set",\n    merchantId: editor.merchant === INHERIT || editor.merchant === NONE ? null : editor.merchant,\n    categoryMode: editor.categoryMode,\n    categoryId: editor.categoryMode === "inherit" ? null : selectedCategoryId(editor, categories),\n    kind: editor.kind === INHERIT ? null : editor.kind,\n    reviewState: editor.reviewState === INHERIT ? null : editor.reviewState,''',
    '''    merchantMode: editor.merchantMode,\n    merchantId: editor.merchantMode === "inherit" || editor.merchant === NONE ? null : editor.merchant,\n    categoryMode: editor.categoryMode,\n    categoryId: editor.categoryMode === "inherit" ? null : selectedCategoryId(editor, categories),\n    kind: editor.kindMode === "inherit" ? null : editor.kind,\n    reviewState: editor.reviewStateMode === "inherit" ? null : editor.reviewState,''',
    "individualPatch",
)

old_merchant = '''                            <label className={`${styles.editorField} ${styles.merchantField}`}><span>Comercio</span><select value={editor.merchant} onChange={(event) => setEditor({ ...editor, merchant: event.target.value })}><option value={INHERIT}>{row.overriddenFields.includes("merchant") ? "Restaurar valor detectado" : "Mantener valor actual"}</option><option value={NONE}>Sin comercio</option>{facets.merchants.filter((merchant) => merchant.lifecycle === "active").map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select></label>'''
new_merchant = '''                            <label className={`${styles.editorField} ${styles.merchantField}`}><span>Comercio</span><select data-testid="edit-merchant" value={editor.merchant} onChange={(event) => setEditor({ ...editor, merchantMode: "set", merchant: event.target.value })}><option value={NONE}>Sin comercio</option>{facets.merchants.filter((merchant) => merchant.lifecycle === "active").map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}</select>{editor.merchantMode === "set" ? <button className={`${styles.secondaryButton} ${styles.fieldRestore}`} type="button" disabled={saving} onClick={() => setEditor({ ...editor, merchantMode: "inherit", merchant: row.merchant.originalId ?? NONE })}>Restaurar valor detectado: {row.merchant.originalName ?? "Sin comercio"}</button> : null}</label>'''
client = replace_once(client, old_merchant, new_merchant, "merchant editor")

old_kind = '''                            <label className={`${styles.editorField} ${styles.typeField}`}><span>Tipo</span><select value={editor.kind} disabled={Boolean(row.transferPairId)} onChange={(event) => setEditor({ ...editor, kind: event.target.value })}><option value={INHERIT}>{row.overriddenFields.includes("kind") ? "Restaurar valor detectado" : "Mantener valor actual"}</option>{(Object.entries(KIND_LABELS) as Array<[TransactionKind, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{row.transferPairId && <small>Desempareja la transferencia antes de cambiar su tipo.</small>}</label>'''
new_kind = '''                            <label className={`${styles.editorField} ${styles.typeField}`}><span>Tipo</span><select data-testid="edit-kind" value={editor.kind} disabled={Boolean(row.transferPairId)} onChange={(event) => setEditor({ ...editor, kindMode: "set", kind: event.target.value })}>{(Object.entries(KIND_LABELS) as Array<[TransactionKind, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{editor.kindMode === "set" ? <button className={`${styles.secondaryButton} ${styles.fieldRestore}`} type="button" disabled={saving || Boolean(row.transferPairId)} onClick={() => setEditor({ ...editor, kindMode: "inherit", kind: row.kind.original })}>Restaurar valor detectado: {KIND_LABELS[row.kind.original]}</button> : row.transferPairId ? <small>Desempareja la transferencia antes de cambiar su tipo.</small> : null}</label>'''
client = replace_once(client, old_kind, new_kind, "kind editor")

old_review = '''                            <label className={`${styles.editorField} ${styles.reviewField}`}><span>Revisión</span><select data-testid="edit-review" value={editor.reviewState} onChange={(event) => setEditor({ ...editor, reviewState: event.target.value })}><option value={INHERIT}>{row.overriddenFields.includes("reviewState") ? "Restaurar valor detectado" : "Mantener valor actual"}</option>{(Object.entries(REVIEW_LABELS) as Array<[ReviewState, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>'''
new_review = '''                            <label className={`${styles.editorField} ${styles.reviewField}`}><span>Revisión</span><select data-testid="edit-review" value={editor.reviewState} onChange={(event) => setEditor({ ...editor, reviewStateMode: "set", reviewState: event.target.value })}>{(Object.entries(REVIEW_LABELS) as Array<[ReviewState, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{editor.reviewStateMode === "set" ? <button className={`${styles.secondaryButton} ${styles.fieldRestore}`} type="button" disabled={saving} onClick={() => setEditor({ ...editor, reviewStateMode: "inherit", reviewState: row.reviewState.original })}>Restaurar valor detectado: {REVIEW_LABELS[row.reviewState.original]}</button> : null}</label>'''
client = replace_once(client, old_review, new_review, "review editor")

client_path.write_text(client)

css = css_path.read_text()
css = replace_once(
    css,
    '''.categoryAssignment button { flex: 0 0 auto; min-height: 2.35rem; padding: .42rem .72rem; font-size: .84rem; }\n.checkboxLabel {''',
    '''.categoryAssignment button { flex: 0 0 auto; min-height: 2.35rem; padding: .42rem .72rem; font-size: .84rem; }\n.fieldRestore {\n  justify-self: flex-start;\n  width: auto;\n  min-height: 0 !important;\n  height: auto !important;\n  padding: .12rem 0 !important;\n  border: 0 !important;\n  background: transparent !important;\n  box-shadow: none !important;\n  color: #8fb4ff !important;\n  font-size: .78rem !important;\n  font-weight: 650;\n  line-height: 1.25;\n  text-align: left;\n}\n.fieldRestore:hover:not(:disabled) { color: #b5ccff !important; text-decoration: underline; }\n.checkboxLabel {''',
    "fieldRestore css",
)
css_path.write_text(css)

test = test_path.read_text()
test = replace_once(
    test,
    '''  expect(client).toContain('Mantener valor actual');\n  expect(client).toContain('Restaurar valor detectado');''',
    '''  expect(client).not.toContain('Mantener valor actual');\n  expect(client).toContain('merchantMode: "inherit" | "set"');\n  expect(client).toContain('kindMode: "inherit" | "set"');\n  expect(client).toContain('reviewStateMode: "inherit" | "set"');\n  expect(client).toContain('Restaurar valor detectado:');\n  expect(client).toContain('data-testid="edit-merchant"');\n  expect(client).toContain('data-testid="edit-kind"');''',
    "premium test",
)
test = replace_once(
    test,
    '''  expect(css).toContain('grid-area: analytics');''',
    '''  expect(css).toContain('grid-area: analytics');\n  expect(css).toContain('.fieldRestore');''',
    "premium css test",
)
test_path.write_text(test)

print("editor effective values patch applied")
