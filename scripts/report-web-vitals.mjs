import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import webVitalsPolicy from "../src/observability/web-vitals-policy.json" with { type: "json" };

const RUM_EVENT = "financial-app-rum";
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA = /^[0-9a-f]{7,64}$/i;
const ROUTES = new Set(webVitalsPolicy.routes);
const DEVICES = new Set(webVitalsPolicy.devices);
const METRICS = new Set(Object.keys(webVitalsPolicy.budgets));

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isoTimestamp(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function parseRumRecord(value, fallbackTimestamp = null) {
  if (!isRecord(value) || value.event !== RUM_EVENT) return null;
  if (value.contractVersion !== webVitalsPolicy.contractVersion) return null;
  if (typeof value.appVersion !== "string" || !VERSION.test(value.appVersion)) return null;
  if (value.deploymentSha !== null && (
    typeof value.deploymentSha !== "string" || !SHA.test(value.deploymentSha)
  )) return null;
  if (typeof value.route !== "string" || !ROUTES.has(value.route)) return null;
  if (typeof value.device !== "string" || !DEVICES.has(value.device)) return null;
  if (typeof value.metric !== "string" || !METRICS.has(value.metric)) return null;
  if (typeof value.value !== "number" || !Number.isFinite(value.value) || value.value < 0 || value.value > 3_600_000) {
    return null;
  }
  const collectedAt = isoTimestamp(value.collectedAt) ?? isoTimestamp(fallbackTimestamp);
  if (!collectedAt) return null;

  return {
    contractVersion: value.contractVersion,
    appVersion: value.appVersion,
    deploymentSha: value.deploymentSha,
    collectedAt,
    route: value.route,
    device: value.device,
    metric: value.metric,
    value: value.value,
  };
}

function extractFromText(text, fallbackTimestamp, result) {
  const trimmed = text.trim();
  if (!trimmed) return;

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      extractFromValue(JSON.parse(trimmed), fallbackTimestamp, result);
      return;
    } catch {
      // A structured prefix may precede the legacy marker; try that next.
    }
  }

  const markerIndex = trimmed.indexOf(RUM_EVENT);
  if (markerIndex < 0) {
    result.ignored += 1;
    return;
  }

  const objectStart = trimmed.indexOf("{");
  if (objectStart < 0) {
    result.rejected += 1;
    return;
  }
  try {
    const legacy = JSON.parse(trimmed.slice(objectStart));
    extractFromValue({ event: RUM_EVENT, ...legacy }, fallbackTimestamp, result);
  } catch {
    result.rejected += 1;
  }
}

function extractFromValue(value, fallbackTimestamp, result) {
  if (Array.isArray(value)) {
    for (const entry of value) extractFromValue(entry, fallbackTimestamp, result);
    return;
  }
  if (typeof value === "string") {
    extractFromText(value, fallbackTimestamp, result);
    return;
  }
  if (!isRecord(value)) {
    result.ignored += 1;
    return;
  }

  if (value.event === RUM_EVENT) {
    const sample = parseRumRecord(value, fallbackTimestamp);
    if (sample) result.samples.push(sample);
    else result.rejected += 1;
    return;
  }

  if (typeof value.text === "string") {
    extractFromText(value.text, value.timestamp ?? fallbackTimestamp, result);
    return;
  }

  result.ignored += 1;
}

export function extractRumSamples(input) {
  const result = { samples: [], rejected: 0, ignored: 0 };
  const trimmed = input.trim();
  if (!trimmed) return result;

  if (trimmed.startsWith("[")) {
    try {
      extractFromValue(JSON.parse(trimmed), null, result);
      return result;
    } catch {
      // Fall through to NDJSON parsing so one malformed line cannot hide the rest.
    }
  }

  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.trim()) continue;
    extractFromText(line, null, result);
  }
  return result;
}

export function percentile(values, requestedPercentile) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (!Number.isFinite(requestedPercentile) || requestedPercentile < 0 || requestedPercentile > 100) {
    throw new Error("invalid_percentile");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = (requestedPercentile / 100) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  if (lowerIndex === upperIndex) return sorted[lowerIndex];
  const weight = rank - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * weight;
}

function roundedMetric(metric, value) {
  if (value === null) return null;
  return metric === "CLS" ? Number(value.toFixed(4)) : Math.round(value);
}

function latestSample(samples) {
  return [...samples]
    .sort((left, right) => left.collectedAt.localeCompare(right.collectedAt))
    .at(-1) ?? null;
}

function validPositiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function buildRumReport(samples, options = {}) {
  const now = isoTimestamp(options.now ?? new Date().toISOString());
  if (!now) throw new Error("invalid_report_now");
  const windowDays = validPositiveInteger(options.windowDays, webVitalsPolicy.windowDays);
  const minSamples = validPositiveInteger(options.minSamples, webVitalsPolicy.minSamplesPerSlice);
  const routes = options.requiredRoutes ?? webVitalsPolicy.requiredRoutes;
  const devices = options.devices ?? webVitalsPolicy.devices;
  const metrics = options.metrics ?? webVitalsPolicy.gateMetrics;
  const windowTo = new Date(now);
  const windowFrom = new Date(windowTo.getTime() - windowDays * 86_400_000);
  const inWindow = samples.filter((sample) => {
    const timestamp = Date.parse(sample.collectedAt);
    return Number.isFinite(timestamp) && timestamp >= windowFrom.getTime() && timestamp <= windowTo.getTime();
  });
  const requestedCohort = inWindow.filter((sample) => (
    (options.appVersion === undefined || sample.appVersion === options.appVersion)
    && (options.deploymentSha === undefined || sample.deploymentSha === options.deploymentSha)
  ));
  const latest = latestSample(requestedCohort);
  const appVersion = options.appVersion ?? latest?.appVersion ?? null;
  const deploymentSha = options.deploymentSha ?? latest?.deploymentSha ?? null;
  const selected = appVersion
    ? inWindow.filter((sample) => (
        sample.appVersion === appVersion
        && sample.deploymentSha === deploymentSha
      ))
    : [];
  const selectedSlices = selected.filter((sample) => (
    routes.includes(sample.route)
    && devices.includes(sample.device)
    && metrics.includes(sample.metric)
  ));

  const groups = new Map();
  for (const sample of selectedSlices) {
    const key = `${sample.route}\u0000${sample.device}\u0000${sample.metric}`;
    const values = groups.get(key) ?? [];
    values.push(sample.value);
    groups.set(key, values);
  }

  const slices = [];
  for (const route of routes) {
    for (const device of devices) {
      for (const metric of metrics) {
        const key = `${route}\u0000${device}\u0000${metric}`;
        const values = groups.get(key) ?? [];
        const p50 = roundedMetric(metric, percentile(values, 50));
        const p75 = roundedMetric(metric, percentile(values, 75));
        const p95 = roundedMetric(metric, percentile(values, 95));
        const budget = webVitalsPolicy.budgets[metric];
        const status = values.length < minSamples
          ? "insufficient"
          : p75 <= budget
            ? "pass"
            : "fail";
        slices.push({
          route,
          device,
          metric,
          samples: values.length,
          p50,
          p75,
          p95,
          budget,
          status,
        });
      }
    }
  }

  const failingSlices = slices.filter((slice) => slice.status === "fail").length;
  const insufficientSlices = slices.filter((slice) => slice.status === "insufficient").length;
  const sufficientSlices = slices.length - insufficientSlices;
  const status = failingSlices > 0
    ? "fail"
    : insufficientSlices > 0
      ? "insufficient"
      : "pass";

  return {
    reportVersion: webVitalsPolicy.reportVersion,
    generatedAt: now,
    appVersion,
    deploymentSha,
    window: {
      from: windowFrom.toISOString(),
      to: windowTo.toISOString(),
      days: windowDays,
    },
    policy: {
      minSamplesPerSlice: minSamples,
      requiredRoutes: [...routes],
      devices: [...devices],
      metrics: [...metrics],
    },
    sampleCount: selectedSlices.length,
    coverage: {
      totalSlices: slices.length,
      sufficientSlices,
      insufficientSlices,
    },
    failingSlices,
    status,
    slices,
  };
}

function formattedValue(metric, value) {
  if (value === null) return "—";
  return metric === "CLS" ? value.toFixed(4) : `${value} ms`;
}

export function formatRumReportMarkdown(report) {
  const lines = [
    "# Financial App · RUM Web Vitals",
    "",
    `- Estado: **${report.status.toUpperCase()}**`,
    `- Versión: ${report.appVersion ?? "sin muestras"}`,
    `- Despliegue: ${report.deploymentSha ?? "sin SHA"}`,
    `- Ventana: ${report.window.from} → ${report.window.to}`,
    `- Muestras válidas: ${report.sampleCount}`,
    `- Cobertura suficiente: ${report.coverage.sufficientSlices}/${report.coverage.totalSlices}`,
    "",
    "| Ruta | Dispositivo | Métrica | n | p50 | p75 | p95 | Budget p75 | Estado |",
    "|---|---|---:|---:|---:|---:|---:|---:|---|",
  ];
  for (const slice of report.slices) {
    lines.push(
      `| ${slice.route} | ${slice.device} | ${slice.metric} | ${slice.samples} | ${formattedValue(slice.metric, slice.p50)} | ${formattedValue(slice.metric, slice.p75)} | ${formattedValue(slice.metric, slice.p95)} | ${formattedValue(slice.metric, slice.budget)} | ${slice.status} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function usage() {
  return [
    "Uso: npm run performance:report -- <logs.ndjson|-> [opciones]",
    "",
    "Opciones:",
    "  --format=json|markdown      Formato de salida (markdown por defecto)",
    "  --version=X.Y.Z             Limita el informe a una versión",
    "  --deployment=SHA            Limita el informe a un despliegue exacto",
    "  --now=ISO                   Fija el final de la ventana",
    "  --window-days=N             Ventana temporal (28 por defecto)",
    "  --min-samples=N             Mínimo por ruta/dispositivo/métrica (30 por defecto)",
    "  --routes=/,/forecast        Limita las rutas del gate",
    "  --devices=mobile,desktop    Limita las clases de dispositivo",
    "  --metrics=LCP,INP,CLS       Limita las métricas",
    "  --allow-insufficient        No falla el proceso por falta de muestra",
  ].join("\n");
}

function cliOptions(argv) {
  const options = {
    input: null,
    format: "markdown",
    appVersion: undefined,
    deploymentSha: undefined,
    now: undefined,
    windowDays: undefined,
    minSamples: undefined,
    requiredRoutes: undefined,
    devices: undefined,
    metrics: undefined,
    allowInsufficient: false,
    help: false,
  };
  for (const argument of argv) {
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--allow-insufficient") options.allowInsufficient = true;
    else if (argument.startsWith("--format=")) options.format = argument.slice(9);
    else if (argument.startsWith("--version=")) options.appVersion = argument.slice(10);
    else if (argument.startsWith("--deployment=")) options.deploymentSha = argument.slice(13);
    else if (argument.startsWith("--now=")) options.now = argument.slice(6);
    else if (argument.startsWith("--window-days=")) options.windowDays = Number(argument.slice(14));
    else if (argument.startsWith("--min-samples=")) options.minSamples = Number(argument.slice(14));
    else if (argument.startsWith("--routes=")) options.requiredRoutes = argument.slice(9).split(",");
    else if (argument.startsWith("--devices=")) options.devices = argument.slice(10).split(",");
    else if (argument.startsWith("--metrics=")) options.metrics = argument.slice(10).split(",");
    else if (!argument.startsWith("-") || argument === "-") options.input ??= argument;
    else throw new Error(`unknown_option:${argument}`);
  }
  if (!new Set(["json", "markdown"]).has(options.format)) throw new Error("invalid_format");
  if (options.appVersion !== undefined && !VERSION.test(options.appVersion)) throw new Error("invalid_version");
  if (options.deploymentSha !== undefined && !SHA.test(options.deploymentSha)) throw new Error("invalid_deployment");
  if (options.windowDays !== undefined && (!Number.isSafeInteger(options.windowDays) || options.windowDays < 1)) {
    throw new Error("invalid_window_days");
  }
  if (options.minSamples !== undefined && (!Number.isSafeInteger(options.minSamples) || options.minSamples < 1)) {
    throw new Error("invalid_min_samples");
  }
  if (options.requiredRoutes?.some((route) => !ROUTES.has(route))) throw new Error("invalid_routes");
  if (options.devices?.some((device) => !DEVICES.has(device))) throw new Error("invalid_devices");
  if (options.metrics?.some((metric) => !METRICS.has(metric))) throw new Error("invalid_metrics");
  if (options.requiredRoutes) options.requiredRoutes = [...new Set(options.requiredRoutes)];
  if (options.devices) options.devices = [...new Set(options.devices)];
  if (options.metrics) options.metrics = [...new Set(options.metrics)];
  return options;
}

export function runCli(argv) {
  const options = cliOptions(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (!options.input) throw new Error("missing_input");
  const input = options.input === "-" ? readFileSync(0, "utf8") : readFileSync(options.input, "utf8");
  const ingestion = extractRumSamples(input);
  const report = buildRumReport(ingestion.samples, options);
  const completeReport = {
    ...report,
    ingestion: {
      accepted: ingestion.samples.length,
      rejected: ingestion.rejected,
      ignored: ingestion.ignored,
    },
  };
  const output = options.format === "json"
    ? `${JSON.stringify(completeReport, null, 2)}\n`
    : formatRumReportMarkdown(completeReport);
  process.stdout.write(output);
  if (report.status === "fail") return 1;
  if (report.status === "insufficient" && !options.allowInsufficient) return 2;
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}\n`);
    process.exitCode = 64;
  }
}
