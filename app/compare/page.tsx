import { Suspense } from "react";
import AppShell from "../app-shell";
import ModuleContextNavigation from "../module-context-navigation";
import {
  loadComparisonSnapshot,
} from "../../src/application/comparison/comparison-loader";
import type { ComparisonSnapshot } from "../../src/application/comparison/comparison-engine";
import {
  comparisonSelectionFromSearchParams,
  type ComparisonSearchParams,
} from "../../src/application/comparison/comparison-query-state";
import {
  resolveComparisonSelection,
  type ComparisonSelectionInput,
} from "../../src/application/comparison/comparison-selection";
import { comparisonModuleLinks } from "../../src/application/navigation/module-context";
import { PersistenceGatewayError } from "../../src/infrastructure/persistence/vercel-supabase-gateway";
import ComparisonClient from "./comparison-client";
import ComparisonLoadingFrame from "./comparison-loading-frame";

export const dynamic = "force-dynamic";

function safeSelection(requested: ComparisonSelectionInput) {
  try {
    resolveComparisonSelection(requested);
    return requested;
  } catch (error) {
    console.warn("comparison-invalid-selection", error instanceof Error ? error.message : String(error));
    return {};
  }
}

function logInitialSnapshotError(error: unknown) {
  if (error instanceof PersistenceGatewayError) {
    console.error("comparison-initial-snapshot", {
      status: error.status,
      code: error.code ?? null,
    });
    return;
  }
  console.error("comparison-initial-snapshot", error instanceof Error ? error.message : String(error));
}

async function ComparisonData({
  searchParams,
}: {
  searchParams: Promise<ComparisonSearchParams>;
}) {
  const started = performance.now();
  const requested = comparisonSelectionFromSearchParams(await searchParams);
  const fallbackInput = safeSelection(requested);
  let initialSnapshot: ComparisonSnapshot | null = null;

  try {
    initialSnapshot = await loadComparisonSnapshot(fallbackInput);
  } catch (error) {
    logInitialSnapshotError(error);
  } finally {
    console.info("comparison-ssr-timing", {
      durationMs: Math.max(0, Math.round((performance.now() - started) * 10) / 10),
      hasSnapshot: Boolean(initialSnapshot),
      accountScoped: Boolean(fallbackInput.accountId?.trim()),
    });
  }

  const selection = initialSnapshot?.selection ?? resolveComparisonSelection(fallbackInput);

  return (
    <>
      <ModuleContextNavigation
        links={comparisonModuleLinks(selection)}
        ariaLabel="Continuar desde el Comparador"
      />
      <ComparisonClient initialSnapshot={initialSnapshot} fallbackSelection={selection} />
    </>
  );
}

export default function ComparisonPage({
  searchParams,
}: {
  searchParams: Promise<ComparisonSearchParams>;
}) {
  return (
    <AppShell>
      <Suspense fallback={<ComparisonLoadingFrame />}>
        <ComparisonData searchParams={searchParams} />
      </Suspense>
    </AppShell>
  );
}
