import { validateCategoryHierarchy } from "../domain/configuration-policies";
import type { Category } from "../domain/models";
import type { FoundationCheck } from "./foundation-health";

export function runConfigurationIntegrityChecks(): FoundationCheck[] {
  const parent: Category = {
    id: "category-parent-kind-check",
    name: "Hogar",
    kind: "expense",
    parentCategoryId: null,
    iconKey: "home",
    colorToken: "category.blue",
    lifecycle: "active",
    sortOrder: 0,
    createdAt: "2026-09-04T00:00:00Z",
    updatedAt: "2026-09-04T00:00:00Z",
  };

  const child: Category = {
    ...parent,
    id: "category-child-kind-check",
    name: "Suministros",
    parentCategoryId: parent.id,
    sortOrder: 1,
  };

  return [
    {
      name: "category-parent-kind-preserves-children",
      passed: validateCategoryHierarchy(
        { ...parent, kind: "income" },
        [parent, child],
      ).some((issue) => issue.code === "child_kind_mismatch"),
    },
  ];
}
