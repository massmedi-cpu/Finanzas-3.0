import { runConfigurationContractChecks } from "./configuration-contract-health";
import {
  runFoundationHealthChecks,
  type FoundationHealth,
} from "./foundation-health";

export function runCompleteFoundationHealthChecks(): FoundationHealth {
  const base = runFoundationHealthChecks();
  const contractChecks = runConfigurationContractChecks();
  const checks = [...base.checks, ...contractChecks];
  const passed = checks.filter((check) => check.passed).length;

  return {
    status: passed === checks.length ? "ok" : "failed",
    passed,
    total: checks.length,
    checks,
  };
}
