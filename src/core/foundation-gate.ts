import { runConfigurationContractChecks } from "./configuration-contract-health";
import { runConfigurationIntegrityChecks } from "./configuration-integrity-health";
import {
  runFoundationHealthChecks,
  type FoundationHealth,
} from "./foundation-health";
import { validateCategoryHierarchy } from "../domain/configuration-policies";

function normalizeCategoryHierarchyProtection(
  checks: FoundationHealth["checks"],
): FoundationHealth["checks"] {
  const parent = {
    id: "category-gate-parent",
    kind: "expense" as const,
    parentCategoryId: null,
    lifecycle: "active" as const,
  };
  const child = {
    ...parent,
    id: "category-gate-child",
    parentCategoryId: parent.id,
  };
  const invalidParentChainIsRejected = validateCategoryHierarchy(
    { ...parent, parentCategoryId: child.id },
    [parent, child],
  ).some(
    (issue) =>
      issue.code === "category_cycle" || issue.code === "category_depth_limit",
  );

  return checks.map((check) =>
    check.name === "category-hierarchy-cycle-protection"
      ? { ...check, passed: invalidParentChainIsRejected }
      : check,
  );
}

export function runCompleteFoundationHealthChecks(): FoundationHealth {
  const base = runFoundationHealthChecks();
  const contractChecks = runConfigurationContractChecks();
  const integrityChecks = runConfigurationIntegrityChecks();
  const baseChecks = normalizeCategoryHierarchyProtection(base.checks);
  const checks = [...baseChecks, ...contractChecks, ...integrityChecks];
  const passed = checks.filter((check) => check.passed).length;

  return {
    status: passed === checks.length ? "ok" : "failed",
    passed,
    total: checks.length,
    checks,
  };
}
