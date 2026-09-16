"use client";

import { useEffect, useState } from "react";
import type { AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import type { AnalysisSelectionInput } from "../../src/application/analysis/analysis-loader";
import { isAnalysisSnapshot } from "../../src/application/analysis/analysis-contract";
import AnalysisClient from "./analysis-client";
import AnalysisLoadingFrame from "./analysis-loading-frame";

function currentMadridMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

export default function AnalysisPageClient({
  initialSnapshot,
  fallbackSelection = {},
}: {
  initialSnapshot: AnalysisSnapshot | null;
  fallbackSelection?: AnalysisSelectionInput;
}) {
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(initialSnapshot);
  const [resolved, setResolved] = useState(Boolean(initialSnapshot));

  useEffect(() => {
    if (initialSnapshot) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      month: fallbackSelection.month?.trim() || currentMadridMonth(),
      range: fallbackSelection.range?.trim() || "1m",
    });
    const accountId = fallbackSelection.accountId?.trim();
    if (accountId) params.set("accountId", accountId);

    void fetch(`/api/analysis?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !isAnalysisSnapshot(payload)) throw new Error("analysis_unavailable");
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
  ]);

  if (!resolved) {
    return <AnalysisLoadingFrame message="Recuperando el análisis con los filtros solicitados…" />;
  }

  return <AnalysisClient initialSnapshot={snapshot} />;
}
