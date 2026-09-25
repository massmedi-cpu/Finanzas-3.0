import { expect, test } from "@playwright/test";
import fs from "node:fs";

const client = fs.readFileSync("app/transactions/transactions-client.tsx", "utf8");

test("Movimientos permite filtrar por revisión sin ofrecer cambios manuales de estado", async () => {
  expect(client).toContain('updateFilter("reviewState"');
  expect(client).toContain('<span>Revisión</span>');
  expect(client).not.toContain('data-testid="edit-review"');
  expect(client).not.toContain('data-testid="bulk-review"');
  expect(client).not.toContain('<th>Estado</th>');
  expect(client).toContain('row.overriddenFields.some((field) => field !== "reviewState")');
  expect(client).toContain('row.duplicateState !== "none" && <span className={styles.duplicateChip}');
});
