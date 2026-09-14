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
    const nextLabel = effectiveCategory && effectiveCategory !== "Sin categoría"
      ? `Automática: ${effectiveCategory}`
      : "Automática/original";

    if (automaticOption.textContent !== nextLabel) {
      automaticOption.textContent = nextLabel;
    }
  });
}

export default function AutomaticCategoryLabel() {
  useEffect(() => {
    let frame = 0;
    const scheduleSync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncAutomaticCategoryLabels);
    };

    scheduleSync();
    document.addEventListener("click", scheduleSync, true);
    document.addEventListener("change", scheduleSync, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("click", scheduleSync, true);
      document.removeEventListener("change", scheduleSync, true);
    };
  }, []);

  return null;
}
