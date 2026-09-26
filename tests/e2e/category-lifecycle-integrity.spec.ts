import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateCategoryDraft } from "../../src/domain/configuration";
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  categoryColorHex,
  isSupportedCategoryColor,
  isSupportedCategoryIcon,
} from "../../src/domain/category-visuals";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260926172000_harden_active_rule_category_lifecycle.sql",
);

function categoryDraft(overrides: Partial<Parameters<typeof validateCategoryDraft>[0]> = {}) {
  return {
    name: "Prueba",
    kind: "expense" as const,
    parentCategoryId: null,
    iconKey: "wallet",
    colorToken: "category.blue",
    lifecycle: "active" as const,
    sortOrder: 0,
    ...overrides,
  };
}

test.describe("integridad de categorías 10.0.13", () => {
  test("iconos y colores comparten un catálogo cerrado y fallback visual estable", () => {
    expect(CATEGORY_ICON_OPTIONS.length).toBeGreaterThan(10);
    expect(CATEGORY_COLOR_OPTIONS.length).toBeGreaterThan(5);

    for (const option of CATEGORY_ICON_OPTIONS) {
      expect(isSupportedCategoryIcon(option.value)).toBe(true);
    }
    for (const option of CATEGORY_COLOR_OPTIONS) {
      expect(isSupportedCategoryColor(option.value)).toBe(true);
      expect(categoryColorHex(option.value)).toBe(option.hex);
    }

    expect(isSupportedCategoryIcon("icono-inventado")).toBe(false);
    expect(isSupportedCategoryColor("category.inventado")).toBe(false);
    expect(categoryColorHex("category.inventado")).toBe(CATEGORY_COLOR_OPTIONS[0].hex);
  });

  test("el dominio rechaza tokens visuales fuera del catálogo", () => {
    expect(validateCategoryDraft(categoryDraft({ iconKey: "icono-inventado" }))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "iconKey", code: "unsupported_category_icon" }),
      ]),
    );
    expect(validateCategoryDraft(categoryDraft({ colorToken: "category.inventado" }))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "colorToken", code: "unsupported_category_color" }),
      ]),
    );
  });

  test("la migración bloquea activar reglas ligadas a categorías archivadas", () => {
    const sql = readFileSync(MIGRATION, "utf8");

    expect(sql).toContain("validate_active_rule_category_lifecycle");
    expect(sql).toContain("new.status = 'active'");
    expect(sql).toContain("c.lifecycle = 'active'");
    expect(sql).toContain("rule_category_not_active");
    expect(sql).toContain("rule_target_category_not_active");
    expect(sql).toContain("before insert or update of status, category_id, target_category_id");
  });
});
