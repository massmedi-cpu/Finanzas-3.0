"use client";

import { useEffect, useState } from "react";
import type { AnalysisSnapshot } from "../../src/application/analysis/analysis-engine";
import AnalysisClient from "./analysis-client";
import styles from "./analysis.module.css";

function currentMadridMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

function isAnalysisSnapshot(value: unknown): value is AnalysisSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AnalysisSnapshot>;
  return candidate.contractVersion === 2
    && Boolean(candidate.selection)
    && Boolean(candidate.current)
    && Boolean(candidate.previous)
    && Array.isArray(candidate.history)
    && Array.isArray(candidate.categoryDrivers)
    && Array.isArray(candidate.merchantDrivers)
    && candidate.quality?.reconciled === true
    && candidate.principles?.bankSource === "read_only"
    && candidate.principles?.generativeAi === false;
}

export default function AnalysisPageClient({ initialSnapshot }: { initialSnapshot: AnalysisSnapshot | null }) {
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(initialSnapshot);
  const [resolved, setResolved] = useState(Boolean(initialSnapshot));

  useEffect(() => {
    if (initialSnapshot) return;

    const controller = new AbortController();
    const month = currentMadridMonth();

    void fetch(`/api/analysis?month=${encodeURIComponent(month)}&range=1m`, {
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
  }, [initialSnapshot]);

  if (!resolved) {
    return (
      <main className={styles.shell} aria-busy="true">
        <h1>Análisis</h1>
        <div role="status" aria-label="Cargando análisis financiero">Preparando el análisis financiero…</div>
      </main>
    );
  }

  return <AnalysisClient initialSnapshot={snapshot} />;
}
