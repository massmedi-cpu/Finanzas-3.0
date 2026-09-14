"use client";

import { useEffect } from "react";

const INHERIT = "__inherit__";

function syncAutomaticCategoryLabels() {
  document.querySelectorAll<HTMLSelectElement>('select[data-testid="edit-category"]').forEach((select) => {
    const automaticOption = Array.from(select.options).find((option) => option.value === INHERIT);
    if (!automaticOption) return;

    const editorRow = select.closest("tr");
    const movementRow = editorRow?.previousElementSibling as HTMLElement | null;
    const categoryCell = movementRow?.querySelector<HTMLElement>('td[data-label="Categoría"]');
    const effectiveCategory = categoryCell?.textContent?.trim() ?? "";

    automaticOption.textContent = effectiveCategory && effectiveCategory !== "Sin categoría"
      ? `Automática: ${effectiveCategory}`
      : "Automática/original";
  });
}

export default function AutomaticCategoryLabel() {
  useEffect(() => {
    syncAutomaticCategoryLabels();
    const observer = new MutationObserver(syncAutomaticCategoryLabels);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
