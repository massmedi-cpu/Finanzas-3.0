import { readFileSync, writeFileSync } from "node:fs";

const path = "app/transactions/transactions-client.tsx";
let text = readFileSync(path, "utf8");

function replaceOnce(oldText, newText, label) {
  const first = text.indexOf(oldText);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (text.indexOf(oldText, first + oldText.length) >= 0) throw new Error(`Multiple matches for ${label}`);
  text = text.replace(oldText, newText);
}

replaceOnce(
  'import { MAX_TRANSACTION_PATCH_SIZE } from "../../src/core/transaction-limits";\n',
  'import { MAX_TRANSACTION_PATCH_SIZE } from "../../src/core/transaction-limits";\nimport { buildBulkTransactionPatch, type BulkReviewState } from "../../src/application/transaction-bulk-edit";\n',
  "bulk edit import",
);

replaceOnce(
  'const UNCHANGED = "__unchanged__";\n',
  'const UNCHANGED = "__unchanged__";\nconst ANALYTICS_INCLUDE = "__include__";\nconst ANALYTICS_EXCLUDE = "__exclude__";\n',
  "bulk constants",
);

replaceOnce(
  '  const [bulkCategory, setBulkCategory] = useState(UNCHANGED);\n',
  '  const [bulkCategory, setBulkCategory] = useState(UNCHANGED);\n  const [bulkMerchant, setBulkMerchant] = useState(UNCHANGED);\n  const [bulkReviewState, setBulkReviewState] = useState(UNCHANGED);\n  const [bulkAnalytics, setBulkAnalytics] = useState(UNCHANGED);\n',
  "bulk state",
);

replaceOnce(
`  async function applyBulk() {
    if (selectedIds.length === 0 || selectedIds.length > MAX_TRANSACTION_PATCH_SIZE || loading || saving) return;
    const patch: Record<string, unknown> = {};
    if (bulkCategory !== UNCHANGED) {
      if (bulkCategory === INHERIT) {
        patch.categoryMode = "inherit";
      } else {
        patch.categoryMode = "set";
        patch.categoryId = bulkCategory === NONE ? null : bulkCategory;
      }
    }
    if (Object.keys(patch).length === 0) {
      setError("Selecciona al menos un cambio para aplicar en bloque.");
      return;
    }
    const ok = await patchTransactions(selectedIds, patch, "Edición masiva completada");
    if (ok) {
      setBulkCategory(UNCHANGED);
    }
  }
`,
`  async function applyBulk() {
    if (selectedIds.length === 0 || selectedIds.length > MAX_TRANSACTION_PATCH_SIZE || loading || saving) return;
    const patch = buildBulkTransactionPatch({
      category: bulkCategory === UNCHANGED
        ? { mode: "unchanged" }
        : bulkCategory === INHERIT
          ? { mode: "inherit" }
          : { mode: "set", id: bulkCategory === NONE ? null : bulkCategory },
      merchant: bulkMerchant === UNCHANGED
        ? { mode: "unchanged" }
        : bulkMerchant === INHERIT
          ? { mode: "inherit" }
          : { mode: "set", id: bulkMerchant === NONE ? null : bulkMerchant },
      reviewState: bulkReviewState === UNCHANGED ? null : bulkReviewState as BulkReviewState,
      analytics: bulkAnalytics === ANALYTICS_INCLUDE ? "include" : bulkAnalytics === ANALYTICS_EXCLUDE ? "exclude" : "unchanged",
    });
    if (Object.keys(patch).length === 0) {
      setError("Selecciona al menos un cambio para aplicar en bloque.");
      return;
    }
    const ok = await patchTransactions(selectedIds, patch, "Edición masiva completada");
    if (ok) {
      setBulkCategory(UNCHANGED);
      setBulkMerchant(UNCHANGED);
      setBulkReviewState(UNCHANGED);
      setBulkAnalytics(UNCHANGED);
    }
  }
`,
  "applyBulk",
);

replaceOnce(
`          <label><span>Categoría</span><select data-testid="bulk-category" value={bulkCategory} disabled={saving || loading} onChange={(event) => setBulkCategory(event.target.value)}>
            <option value={UNCHANGED}>Sin cambiar</option><option value={INHERIT}>Restaurar automática</option><option value={NONE}>Sin categoría</option>
            {facets.categories.filter((category) => category.lifecycle === "active").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></label>
          <button data-testid="bulk-apply" className={styles.primaryButton} type="button" onClick={() => void applyBulk()} disabled={saving || loading || bulkCategory === UNCHANGED}>Aplicar cambios</button>
`,
`          <label><span>Categoría</span><select data-testid="bulk-category" value={bulkCategory} disabled={saving || loading} onChange={(event) => setBulkCategory(event.target.value)}>
            <option value={UNCHANGED}>Sin cambiar</option><option value={INHERIT}>Restaurar automática</option><option value={NONE}>Sin categoría</option>
            {facets.categories.filter((category) => category.lifecycle === "active").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></label>
          <label><span>Comercio</span><select data-testid="bulk-merchant" value={bulkMerchant} disabled={saving || loading} onChange={(event) => setBulkMerchant(event.target.value)}>
            <option value={UNCHANGED}>Sin cambiar</option><option value={INHERIT}>Restaurar detectado</option><option value={NONE}>Sin comercio</option>
            {facets.merchants.filter((merchant) => merchant.lifecycle === "active").map((merchant) => <option key={merchant.id} value={merchant.id}>{merchant.name}</option>)}
          </select></label>
          <label><span>Revisión</span><select data-testid="bulk-review-state" value={bulkReviewState} disabled={saving || loading} onChange={(event) => setBulkReviewState(event.target.value)}>
            <option value={UNCHANGED}>Sin cambiar</option>
            {(Object.entries(REVIEW_STATE_LABELS) as Array<[ReviewState, string]>).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label><span>Analítica</span><select data-testid="bulk-analytics" value={bulkAnalytics} disabled={saving || loading} onChange={(event) => setBulkAnalytics(event.target.value)}>
            <option value={UNCHANGED}>Sin cambiar</option><option value={ANALYTICS_INCLUDE}>Incluir en analítica</option><option value={ANALYTICS_EXCLUDE}>Excluir de analítica</option>
          </select></label>
          <button data-testid="bulk-apply" className={styles.primaryButton} type="button" onClick={() => void applyBulk()} disabled={saving || loading || (bulkCategory === UNCHANGED && bulkMerchant === UNCHANGED && bulkReviewState === UNCHANGED && bulkAnalytics === UNCHANGED)}>Aplicar cambios</button>
`,
  "bulk UI",
);

writeFileSync(path, text);
console.log("Applied Financial App 10.0.43 bulk transaction UI patch");
