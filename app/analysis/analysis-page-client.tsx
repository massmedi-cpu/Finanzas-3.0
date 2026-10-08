"use client";

import { useEffect, useState } from "react";
import type { AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import type { AnalysisSelectionInput } from "../../src/application/analysis/analysis-loader";
import { isAnalysisSnapshot } from "../../src/application/analysis/analysis-contract";
import AnalysisClient from "./analysis-client";
import AnalysisAxioma53Controls from "./analysis-axioma53-controls";
import AnalysisLoadingFrame from "./analysis-loading-frame";
import AnalysisSourceFreshness, { type SourceFreshness } from "./analysis-source-freshness";

function currentMadridMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

function responseErrorCode(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const code = (payload as { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
  }
  return `analysis_http_${status}`;
}

function appendParam(params: URLSearchParams, key: string, value: string | null | undefined) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}

export default function AnalysisPageClient({
  initialSnapshot,
  fallbackSelection = {},
}: {
  initialSnapshot: AnalysisSnapshot | null;
  fallbackSelection?: AnalysisSelectionInput;
}) {
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(initialSnapshot);
  const [basicApplied, setBasicApplied] = useState<AnalysisSnapshot | null>(null);
  const [resolved, setResolved] = useState(Boolean(initialSnapshot));
  const [freshness, setFreshness] = useState<SourceFreshness | null>(null);

  useEffect(() => {
    if (initialSnapshot) return;

    const controller = new AbortController();
    const params = new URLSearchParams();
    appendParam(params, "month", fallbackSelection.month || currentMadridMonth());
    appendParam(params, "range", fallbackSelection.range || "1m");
    appendParam(params, "accountId", fallbackSelection.accountId);
    appendParam(params, "periodMode", fallbackSelection.periodMode);
    appendParam(params, "year", fallbackSelection.year);
    appendParam(params, "dateFrom", fallbackSelection.dateFrom);
    appendParam(params, "dateTo", fallbackSelection.dateTo);
    appendParam(params, "compareMode", fallbackSelection.compareMode);
    appendParam(params, "compareDateFrom", fallbackSelection.compareDateFrom);
    appendParam(params, "compareDateTo", fallbackSelection.compareDateTo);

    void fetch(`/api/analysis?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(responseErrorCode(payload, response.status));
        if (!isAnalysisSnapshot(payload)) throw new Error("analysis_contract_invalid");
        return payload;
      })
      .then((next) => {
        if (!controller.signal.aborted) setSnapshot(next);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          console.error("analysis-client-recovery", cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setResolved(true);
      });

    return () => controller.abort();
  }, [
    initialSnapshot,
    fallbackSelection.month,
    fallbackSelection.range,
    fallbackSelection.accountId,
    fallbackSelection.periodMode,
    fallbackSelection.year,
    fallbackSelection.dateFrom,
    fallbackSelection.dateTo,
    fallbackSelection.compareMode,
    fallbackSelection.compareDateFrom,
    fallbackSelection.compareDateTo,
  ]);

  if (!resolved) {
    return <AnalysisLoadingFrame message="Recuperando el análisis con los filtros solicitados…" />;
  }

  return (
    <>
      <AnalysisSourceFreshness onChange={setFreshness} />
      <AnalysisClient initialSnapshot={snapshot} latestMovementDate={freshness?.latestMovementDate ?? null}
        onApplied={(next) => { setSnapshot(next); setBasicApplied(next); }} />
      <AnalysisAxioma53Controls
        key={basicApplied ? [basicApplied.selection.month, basicApplied.selection.range, basicApplied.selection.accountId].join(":") : "initial"}
        snapshot={snapshot}
        requested={basicApplied ? { month: basicApplied.selection.month, range: basicApplied.selection.range, accountId: basicApplied.selection.accountId } : fallbackSelection}
      />
    </>
  );
}
