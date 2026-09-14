import { expect, test } from "@playwright/test";
import fs from "node:fs";

const client = fs.readFileSync("app/transactions/transactions-client.tsx", "utf8");
const css = fs.readFileSync("app/transactions/transactions.module.css", "utf8");

test("editor premium separa jerarquía, intención y acciones", async () => {
  expect(client).toContain('data-testid="edit-category-root"');
  expect(client).toContain('data-testid="edit-subcategory"');
  expect(client).toContain('Mantener valor actual');
  expect(client).toContain('Restaurar valor detectado');
  expect(client).toContain('Restaurar clasificación detectada');
  expect(client).not.toContain('Automático/original');
  expect(client).not.toContain('Automática/original');
  expect(css).toContain('"category subcategory type review"');
  expect(css).toContain('width: 1.15rem; height: 1.15rem');
  expect(css).toContain('grid-area: analytics');
});
