import { expect, test } from "@playwright/test";
import fs from "node:fs";

const helper = fs.readFileSync("app/transactions/automatic-category-label.tsx", "utf8");
const page = fs.readFileSync("app/transactions/page.tsx", "utf8");

test("la edición muestra la categoría automática efectiva sin crear un override", async () => {
  expect(helper).toContain('select[data-testid="edit-category"]');
  expect(helper).toContain('td[data-label="Categoría"]');
  expect(helper).toContain('`Automática: ${effectiveCategory}`');
  expect(helper).toContain('option.value === INHERIT');
  expect(page).toContain("<AutomaticCategoryLabel />");
});

test("la etiqueta automática no usa un observador global que pueda bloquear la página", async () => {
  expect(helper).not.toContain("MutationObserver");
  expect(helper).not.toContain("observer.observe(document.body");
  expect(helper).toContain("requestAnimationFrame");
  expect(helper).toContain('document.addEventListener("click", scheduleSync, true)');
});
