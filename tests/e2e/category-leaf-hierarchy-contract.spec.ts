import { expect, test } from "@playwright/test";
import fs from "node:fs";

const migration = fs.readFileSync("supabase/migrations/20260914115325_category_leaf_hierarchy.sql", "utf8");

test("la taxonomía automática termina en hojas y conserva la ruta completa", async () => {
  expect(migration).toContain("Ingresos");
  expect(migration).toContain("Transferencias");
  expect(migration).toContain("parent_category_id");
  expect(migration).toContain("category_path");
  expect(migration).toContain("query_effective_transactions");
});
