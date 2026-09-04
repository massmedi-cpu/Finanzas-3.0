import { runConfigurationContractChecks } from "./configuration-contract-health";
import { runConfigurationIntegrityChecks } from "./configuration-integrity-health";
import {
  runFoundationHealthChecks,
  type FoundationHealth,
} from "./foundation-health";

export function runCompleteFoundationHealthChecks(): FoundationHealth {
  const base = runFoundationHealthChecks();
  const contractChecks = runConfigurationContractChecks();
  const integrityChecks = runConfigurationIntegrityChecks();
  const checks = [...base.checks, ...contractChecks, ...integrityChecks];
  const passed = checks.filter((check) => check.passed).length;

  return {
    status: passed === checks.length ? "ok" : "failed",
    passed,
    total: checks.length,
    checks,
  };
}
