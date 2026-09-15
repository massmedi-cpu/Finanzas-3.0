import AppShell from "../app-shell";
import { loadAnalysisSnapshot } from "../../src/application/analysis/analysis-loader";
import type { AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import AnalysisClient from "./analysis-client";

export const dynamic = "force-dynamic";

export default async function AnalysisPage() {
  let initialSnapshot: AnalysisSnapshot | null = null;
  try {
    initialSnapshot = await loadAnalysisSnapshot();
  } catch (error) {
    console.error("analysis-initial-snapshot", error instanceof Error ? error.message : String(error));
  }

  return (
    <AppShell>
      <AnalysisClient initialSnapshot={initialSnapshot} />
    </AppShell>
  );
}
