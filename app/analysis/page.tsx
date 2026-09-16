import { Suspense } from "react";
import AppShell from "../app-shell";
import {
  loadAnalysisSnapshot,
  resolveAnalysisSelection,
  type AnalysisSelectionInput,
} from "../../src/application/analysis/analysis-loader";
import type { AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import { prepareAnalysisPresentationSnapshot } from "../../src/application/analysis/analysis-presentation";
import {
  analysisSelectionFromSearchParams,
  type AnalysisSearchParams,
} from "../../src/application/analysis/analysis-query-state";
import { PersistenceGatewayError } from "../../src/infrastructure/persistence/vercel-supabase-gateway";
import AnalysisLoadingFrame from "./analysis-loading-frame";
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

function logInitialSnapshotError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    console.error("analysis-initial-snapshot", {
      status: error.status,
      code: error.code ?? null,
    });
    return;
  }

  console.error("analysis-initial-snapshot", error instanceof Error ? error.message : String(error));
}

async function AnalysisData({
  searchParams,
}: {
  searchParams: Promise<AnalysisSearchParams>;
}) {
  const started = performance.now();
  const requestedSelection = analysisSelectionFromSearchParams(await searchParams);
  const fallbackSelection = safeSelection(requestedSelection);
  let initialSnapshot: AnalysisSnapshot | null = null;

  try {
    initialSnapshot = prepareAnalysisPresentationSnapshot(
      await loadAnalysisSnapshot(fallbackSelection),
    );
  } catch (error) {
    logInitialSnapshotError(error);
  } finally {
    const durationMs = Math.max(0, Math.round((performance.now() - started) * 10) / 10);
    console.info("analysis-ssr-timing", {
      durationMs,
      hasSnapshot: Boolean(initialSnapshot),
      range: fallbackSelection.range?.trim() || "1m",
      accountScoped: Boolean(fallbackSelection.accountId?.trim()),
    });
  }

  return (
    <AnalysisPageClient
      initialSnapshot={initialSnapshot}
      fallbackSelection={fallbackSelection}
    />
  );
}

export default function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<AnalysisSearchParams>;
}) {
  return (
    <AppShell>
      <Suspense fallback={<AnalysisLoadingFrame />}>
        <AnalysisData searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}
