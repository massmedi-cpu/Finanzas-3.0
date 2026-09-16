import AppShell from "../app-shell";
import {
  loadAnalysisSnapshot,
  resolveAnalysisSelection,
  type AnalysisSelectionInput,
} from "../../src/application/analysis/analysis-loader";
import type { AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import {
  analysisSelectionFromSearchParams,
  type AnalysisSearchParams,
} from "../../src/application/analysis/analysis-query-state";
import AnalysisPageClient from "./analysis-page-client";

export const dynamic = "force-dynamic";

function safeSelection(requested: AnalysisSelectionInput): AnalysisSelectionInput {
  try {
    resolveAnalysisSelection(requested);
    return requested;
  } catch (error) {
    console.warn("analysis-invalid-selection", error instanceof Error ? error.message : String(error));
    return {};
  }
}

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<AnalysisSearchParams>;
}) {
  const requestedSelection = analysisSelectionFromSearchParams(await searchParams);
  const fallbackSelection = safeSelection(requestedSelection);
  let initialSnapshot: AnalysisSnapshot | null = null;

  try {
    initialSnapshot = await loadAnalysisSnapshot(fallbackSelection);
  } catch (error) {
    console.error("analysis-initial-snapshot", error instanceof Error ? error.message : String(error));
  }

  return (
    <AppShell>
      <AnalysisPageClient
        initialSnapshot={initialSnapshot}
        fallbackSelection={fallbackSelection}
      />
    </AppShell>
  );
}
