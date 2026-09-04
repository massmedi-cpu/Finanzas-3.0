import type { Account, Category, EntityId } from "./models";
import type { ValidationIssue } from "./configuration";

function normalizedLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-ES");
}

type CategoryHierarchyNode = Pick<
  Category,
  "id" | "kind" | "parentCategoryId" | "lifecycle"
>;
type CategoryHierarchyCandidate = Pick<Category, "id" | "kind" | "parentCategoryId"> &
  Partial<Pick<Category, "lifecycle">>;

export function validateAccountUniqueness(
  candidate: Pick<Account, "id" | "name">,
  accounts: ReadonlyArray<Pick<Account, "id" | "name">>,
): ValidationIssue[] {
  const name = normalizedLabel(candidate.name);
  const duplicated = accounts.some(
    (account) => account.id !== candidate.id && normalizedLabel(account.name) === name,
  );

  return duplicated
    ? [
        {
          field: "name",
          code: "duplicate_account_name",
          message: "Ya existe una cuenta con ese nombre.",
        },
      ]
    : [];
}

export function validateCategoryUniqueness(
  candidate: Pick<Category, "id" | "name" | "kind" | "parentCategoryId">,
  categories: ReadonlyArray<Pick<Category, "id" | "name" | "kind" | "parentCategoryId">>,
): ValidationIssue[] {
  const name = normalizedLabel(candidate.name);
  const duplicated = categories.some(
    (category) =>
      category.id !== candidate.id &&
      category.kind === candidate.kind &&
      category.parentCategoryId === candidate.parentCategoryId &&
      normalizedLabel(category.name) === name,
  );

  return duplicated
    ? [
        {
          field: "name",
          code: "duplicate_category_name",
          message: "Ya existe una categoría con ese nombre en este nivel.",
        },
      ]
    : [];
}

export function validateCategoryHierarchy(
  candidate: CategoryHierarchyCandidate,
  categories: ReadonlyArray<CategoryHierarchyNode>,
): ValidationIssue[] {
  const candidateLifecycle = candidate.lifecycle ?? "active";
  const activeChild = categories.some(
    (category) =>
      category.parentCategoryId === candidate.id && category.lifecycle === "active",
  );

  if (candidateLifecycle === "archived" && activeChild) {
    return [
      {
        field: "lifecycle",
        code: "active_child_requires_active_parent",
        message: "No se puede archivar una categoría mientras tenga subcategorías activas.",
      },
    ];
  }

  const incompatibleChild = categories.some(
    (category) =>
      category.parentCategoryId === candidate.id &&
      category.kind !== candidate.kind,
  );

  if (incompatibleChild) {
    return [
      {
        field: "kind",
        code: "child_kind_mismatch",
        message: "El tipo de una categoría debe coincidir con el de sus subcategorías.",
      },
    ];
  }

  if (!candidate.parentCategoryId) {
    return [];
  }

  if (candidate.parentCategoryId === candidate.id) {
    return [
      {
        field: "parentCategoryId",
        code: "self_parent",
        message: "Una categoría no puede depender de sí misma.",
      },
    ];
  }

  const byId = new Map(categories.map((category) => [category.id, category]));
  const parent = byId.get(candidate.parentCategoryId);

  if (!parent) {
    return [
      {
        field: "parentCategoryId",
        code: "parent_not_found",
        message: "La categoría superior no existe.",
      },
    ];
  }

  if (candidateLifecycle === "active" && parent.lifecycle !== "active") {
    return [
      {
        field: "parentCategoryId",
        code: "parent_archived",
        message: "Una categoría activa necesita una categoría superior activa.",
      },
    ];
  }

  if (parent.kind !== candidate.kind) {
    return [
      {
        field: "parentCategoryId",
        code: "parent_kind_mismatch",
        message: "La categoría superior debe ser del mismo tipo.",
      },
    ];
  }

  const visited = new Set<EntityId>([candidate.id]);
  let cursor: CategoryHierarchyNode | undefined = parent;

  while (cursor) {
    if (visited.has(cursor.id)) {
      return [
        {
          field: "parentCategoryId",
          code: "category_cycle",
          message: "La jerarquía de categorías no puede contener ciclos.",
        },
      ];
    }

    visited.add(cursor.id);
    cursor = cursor.parentCategoryId ? byId.get(cursor.parentCategoryId) : undefined;
  }

  return [];
}

export function validateCategoryMerge(
  source: Pick<Category, "id" | "kind">,
  target: Pick<Category, "id" | "kind" | "parentCategoryId">,
  categories: ReadonlyArray<Pick<Category, "id" | "parentCategoryId">> = [],
): ValidationIssue[] {
  if (source.id === target.id) {
    return [
      {
        field: "targetCategoryId",
        code: "same_category",
        message: "La categoría de destino debe ser distinta de la categoría de origen.",
      },
    ];
  }

  if (source.kind !== target.kind) {
    return [
      {
        field: "targetCategoryId",
        code: "category_kind_mismatch",
        message: "Solo pueden fusionarse categorías del mismo tipo.",
      },
    ];
  }

  if (categories.length > 0) {
    const byId = new Map(categories.map((category) => [category.id, category]));
    const visited = new Set<EntityId>();
    let cursor: Pick<Category, "id" | "parentCategoryId"> | undefined = target;

    while (cursor) {
      if (cursor.id === source.id) {
        return [
          {
            field: "targetCategoryId",
            code: "merge_into_descendant",
            message: "Una categoría no puede fusionarse dentro de una de sus descendientes.",
          },
        ];
      }
      if (visited.has(cursor.id)) {
        break;
      }
      visited.add(cursor.id);
      cursor = cursor.parentCategoryId ? byId.get(cursor.parentCategoryId) : undefined;
    }
  }

  return [];
}

export function validateReorder(
  currentIds: ReadonlyArray<EntityId>,
  orderedIds: ReadonlyArray<EntityId>,
): ValidationIssue[] {
  if (currentIds.length !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length) {
    return [
      {
        field: "sortOrder",
        code: "invalid_reorder_set",
        message: "La reordenación debe contener cada elemento exactamente una vez.",
      },
    ];
  }

  const current = new Set(currentIds);
  const sameSet = orderedIds.every((id) => current.has(id));

  return sameSet
    ? []
    : [
        {
          field: "sortOrder",
          code: "invalid_reorder_set",
          message: "La reordenación no puede añadir ni eliminar elementos.",
        },
      ];
}

export function validateAccountReorder(
  accounts: ReadonlyArray<Pick<Account, "id" | "lifecycle">>,
  orderedIds: ReadonlyArray<EntityId>,
): ValidationIssue[] {
  const setIssues = validateReorder(accounts.map((account) => account.id), orderedIds);
  if (setIssues.length > 0) {
    return setIssues;
  }

  const byId = new Map(accounts.map((account) => [account.id, account]));
  const crossesLifecycleBoundary = orderedIds.some((id, index) => {
    const current = accounts[index];
    const incoming = byId.get(id);
    return !current || !incoming || current.lifecycle !== incoming.lifecycle;
  });

  return crossesLifecycleBoundary
    ? [
        {
          field: "sortOrder",
          code: "account_reorder_group_mismatch",
          message: "Las cuentas solo pueden reordenarse dentro del mismo estado activo o archivado.",
        },
      ]
    : [];
}

export function validateCategoryReorder(
  categories: ReadonlyArray<Pick<Category, "id" | "kind" | "parentCategoryId">>,
  orderedIds: ReadonlyArray<EntityId>,
): ValidationIssue[] {
  const setIssues = validateReorder(categories.map((category) => category.id), orderedIds);
  if (setIssues.length > 0) {
    return setIssues;
  }

  const byId = new Map(categories.map((category) => [category.id, category]));
  const crossesCategoryBoundary = orderedIds.some((id, index) => {
    const current = categories[index];
    const incoming = byId.get(id);
    return (
      !current ||
      !incoming ||
      current.kind !== incoming.kind ||
      current.parentCategoryId !== incoming.parentCategoryId
    );
  });

  return crossesCategoryBoundary
    ? [
        {
          field: "sortOrder",
          code: "category_reorder_group_mismatch",
          message: "Las categorías solo pueden reordenarse entre hermanas del mismo tipo y nivel.",
        },
      ]
    : [];
}
