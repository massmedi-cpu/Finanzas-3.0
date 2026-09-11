"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import {
  isWebVitalName,
  normalizeTelemetryRoute,
  type OperationalTelemetry,
  type TelemetryRoute,
} from "../src/observability/operational-telemetry-contract";

const TELEMETRY_ENDPOINT = "/api/telemetry/client";
const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

function safeErrorName(value: unknown) {
  if (value instanceof Error) {
    const candidate = value.name.trim();
    if (SAFE_ERROR_NAME.test(candidate)) return candidate;
  }
  return "UnknownError";
}

function sendTelemetry(payload: OperationalTelemetry) {
  void fetch(TELEMETRY_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

export function OperationalTelemetryReporter({ enabled }: Readonly<{ enabled: boolean }>) {
  const pathname = usePathname();
  const routeRef = useRef<TelemetryRoute>(normalizeTelemetryRoute(pathname));
  const enabledRef = useRef(enabled && pathname !== "/login");

  useEffect(() => {
    routeRef.current = normalizeTelemetryRoute(pathname);
    enabledRef.current = enabled && pathname !== "/login";
  }, [enabled, pathname]);

  const reportMetric = useCallback((metric: { name: string; value: number }) => {
    if (!enabledRef.current || !isWebVitalName(metric.name)) return;
    sendTelemetry({
      type: "web_vital",
      route: routeRef.current,
      name: metric.name,
      value: metric.value,
      rating: null,
    });
  }, []);

  useReportWebVitals(reportMetric);

  useEffect(() => {
    if (!enabled || pathname === "/login") return;
    const route = normalizeTelemetryRoute(pathname);

    const handleError = (event: ErrorEvent) => {
      sendTelemetry({
        type: "client_error",
        route,
        kind: "window_error",
        errorName: safeErrorName(event.error),
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      sendTelemetry({
        type: "client_error",
        route,
        kind: "unhandled_rejection",
        errorName: safeErrorName(event.reason),
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [enabled, pathname]);

  return null;
}
