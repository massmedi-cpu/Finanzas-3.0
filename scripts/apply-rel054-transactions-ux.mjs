import { readFileSync, writeFileSync } from "node:fs";

const path = "app/transactions/transactions-client.tsx";
let source = readFileSync(path, "utf8");

function replaceOnce(before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`rel054_missing_anchor:${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`rel054_ambiguous_anchor:${label}`);
  source = source.replace(before, after);
}

replaceOnce(
`  const listRequestSequence = useRef(0);
  const conceptInputRef = useRef<HTMLInputElement>(null);`,
`  const listRequestSequence = useRef(0);
  const conceptInputRef = useRef<HTMLInputElement>(null);
  const focusAfterReloadId = useRef<string | null>(null);`,
"focus-ref",
);

replaceOnce(
`      if (!append) setSelectedIds([]);
    } catch (cause) {`,
`      if (!append) setSelectedIds([]);
      return incoming;
    } catch (cause) {`,
"fetch-return",
);

replaceOnce(
`  const activeFilterCount = useMemo(
    () => Object.values(appliedFilters).filter((value) => value.trim() !== "").length,
    [appliedFilters],
  );`,
`  const activeFilterCount = useMemo(
    () => Object.values(appliedFilters).filter((value) => value.trim() !== "").length,
    [appliedFilters],
  );

  const filtersDirty = useMemo(
    () => (Object.keys(draftFilters) as Array<keyof Filters>)
      .some((field) => draftFilters[field] !== appliedFilters[field]),
    [appliedFilters, draftFilters],
  );

  useEffect(() => {
    const id = focusAfterReloadId.current;
    if (!id || loading) return;
    const target = document.querySelector<HTMLElement>(\`[data-transaction-id="\${id}"]\`);
    focusAfterReloadId.current = null;
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [loading, rows]);`,
"dirty-and-focus",
);

replaceOnce(
`      const changed = payload?.result?.changedTransactions;
      setNotice(Number.isInteger(changed) ? \`\${message} · \${formatInteger(changed)} modificados.\` : message);
      setEditingId(null);
      setEditor(null);
      setSelectedIds([]);
      closeReview();
      await fetchPage(appliedFilters, null, false);
      return true;`,
`      const changed = payload?.result?.changedTransactions;
      const baseNotice = Number.isInteger(changed) ? \`\${message} · \${formatInteger(changed)} modificados.\` : message;
      const focusId = ids.length === 1 ? ids[0] : null;
      setEditingId(null);
      setEditor(null);
      setSelectedIds([]);
      closeReview();
      const refreshed = await fetchPage(appliedFilters, null, false);
      if (focusId) {
        const stillVisible = Array.isArray(refreshed) && refreshed.some((row) => row.id === focusId);
        if (stillVisible) {
          focusAfterReloadId.current = focusId;
          setNotice(\`\${baseNotice} El movimiento sigue visible y mantiene tu punto de trabajo.\`);
        } else {
          setNotice(\`\${baseNotice} Ya no aparece porque no cumple los filtros actuales.\`);
        }
      } else {
        setNotice(baseNotice);
      }
      return true;`,
"patch-continuity",
);

replaceOnce(
`      <form className={styles.filters} onSubmit={applyFilters} aria-label="Filtros de movimientos">`,
`      <form
        className={styles.filters}
        onSubmit={applyFilters}
        aria-label="Filtros de movimientos"
        aria-describedby="transaction-filter-status"
      >`,
"filter-form-a11y",
);

replaceOnce(
`        <div className={styles.filterActions}>
          <button className={styles.primaryButton} type="submit" disabled={saving}>Aplicar filtros</button>
          <button className={styles.secondaryButton} type="button" onClick={clearFilters} disabled={saving}>Limpiar</button>
        </div>
      </form>`,
`        <div className={styles.filterActions}>
          <button className={styles.primaryButton} type="submit" disabled={saving || !filtersDirty}>Aplicar filtros</button>
          <button className={styles.secondaryButton} type="button" onClick={clearFilters} disabled={saving}>Limpiar</button>
        </div>
        <p id="transaction-filter-status" role="status" aria-live="polite">
          {filtersDirty ? "Hay cambios de filtro sin aplicar. La tabla todavía muestra los filtros anteriores." : "La tabla refleja los filtros mostrados."}
        </p>
      </form>`,
"filter-status",
);

replaceOnce(
`                    <tr className={selectedSet.has(row.id) ? styles.selectedRow : undefined}>`,
`                    <tr
                      data-transaction-id={row.id}
                      tabIndex={-1}
                      className={selectedSet.has(row.id) ? styles.selectedRow : undefined}
                    >`,
"row-anchor",
);

writeFileSync(path, source);
console.log("REL-054 transactions UX codemod applied");
