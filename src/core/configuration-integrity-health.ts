import {
  validateAccountReorder,
  validateCategoryHierarchy,
  validateCategoryReorder,
} from "../domain/configuration-policies";
import type { Account, Category } from "../domain/models";
import type { FoundationCheck } from "./foundation-health";

const TIMESTAMP = "2026-09-04T00:00:00Z";

function account(id: string, lifecycle: Account["lifecycle"], sortOrder: number): Account {
  return {
    id,
    name: id,
    institution: null,
    type: "checking",
    openingBalanceCents: 0,
    currency: "EUR",
    lifecycle,
    sortOrder,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

function category(
  id: string,
  kind: Category["kind"],
  parentCategoryId: string | null,
  sortOrder: number,
): Category {
  return {
    id,
    name: id,
    kind,
    parentCategoryId,
    iconKey: "wallet",
    colorToken: "category.blue",
    lifecycle: "active",
    sortOrder,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

export function runConfigurationIntegrityChecks(): FoundationCheck[] {
  const parent = category("category-parent-kind-check", "expense", null, 0);
  const child = category("category-child-kind-check", "expense", parent.id, 1);

  const activeAccountA = account("account-active-a", "active", 0);
  const activeAccountB = account("account-active-b", "active", 1);
  const archivedAccount = account("account-archived", "archived", 2);
  const accounts = [activeAccountA, activeAccountB, archivedAccount];

  const expenseRootA = category("category-expense-a", "expense", null, 0);
  const expenseRootB = category("category-expense-b", "expense", null, 1);
  const expenseChild = category("category-expense-child", "expense", expenseRootA.id, 0);
  const incomeRoot = category("category-income", "income", null, 0);
  const categories = [expenseRootA, expenseRootB, expenseChild, incomeRoot];

  return [
    {
      name: "category-parent-kind-preserves-children",
      passed: validateCategoryHierarchy(
        { ...parent, kind: "income" },
        [parent, child],
      ).some((issue) => issue.code === "child_kind_mismatch"),
    },
    {
      name: "account-reorder-rejects-lifecycle-crossing",
      passed: validateAccountReorder(
        accounts,
        [archivedAccount.id, activeAccountB.id, activeAccountA.id],
      ).some((issue) => issue.code === "account_reorder_group_mismatch"),
    },
    {
      name: "account-reorder-allows-active-siblings",
      passed: validateAccountReorder(
        accounts,
        [activeAccountB.id, activeAccountA.id, archivedAccount.id],
      ).length === 0,
    },
    {
      name: "category-reorder-rejects-kind-crossing",
      passed: validateCategoryReorder(
        categories,
        [incomeRoot.id, expenseRootB.id, expenseChild.id, expenseRootA.id],
      ).some((issue) => issue.code === "category_reorder_group_mismatch"),
    },
    {
      name: "category-reorder-rejects-parent-crossing",
      passed: validateCategoryReorder(
        categories,
        [expenseChild.id, expenseRootB.id, expenseRootA.id, incomeRoot.id],
      ).some((issue) => issue.code === "category_reorder_group_mismatch"),
    },
    {
      name: "category-reorder-allows-siblings",
      passed: validateCategoryReorder(
        categories,
        [expenseRootB.id, expenseRootA.id, expenseChild.id, incomeRoot.id],
      ).length === 0,
    },
  ];
}
