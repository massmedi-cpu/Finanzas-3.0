import { expect, test } from "@playwright/test";
import fs from "node:fs";

const client = fs.readFileSync("app/transactions/transactions-client.tsx", "utf8");
const page = fs.readFileSync("app/transactions/page.tsx", "utf8");

test("categoría y subcategoría son campos reales y automática es un estado", async () => {
  expect(client).toContain('data-testid="edit-category-root"');
  expect(client).toContain('data-testid="edit-subcategory"');
  expect(client).toContain('data-testid="reset-category-auto"');
  expect(client).toContain('Restaurar clasificación detectada');
  expect(client).toContain('Origen: clasificación detectada');
  expect(client).toContain('categoryMode: "inherit"');
  expect(client).toContain('categoryMode: "set"');
  expect(client).not.toContain('data-testid="edit-category" value={editor.category}');
  expect(page).not.toContain('AutomaticCategoryLabel');
});
