const SW_VERSION = "financial-app-pwa-v2";
const SAFE_REFRESH_SYNC_TAG = "financial-app-safe-refresh-v1";
const SAFE_REFRESH_URLS = ["/api/analysis/source-freshness"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Financial App maneja datos sensibles y dinámicos. El service worker
  // participa en la instalabilidad PWA sin persistir respuestas privadas.
  event.respondWith(fetch(request));
});

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(message));
}

async function refreshSafeReadModel() {
  let refreshed = true;

  for (const path of SAFE_REFRESH_URLS) {
    try {
      const response = await fetch(path, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "x-financial-app-background-sync": "safe-read" },
      });
      if (!response.ok) refreshed = false;
    } catch {
      refreshed = false;
    }
  }

  await notifyClients({ type: "FINANCIAL_APP_SAFE_REFRESH", refreshed });
}

self.addEventListener("sync", (event) => {
  if (event.tag !== SAFE_REFRESH_SYNC_TAG) return;
  event.waitUntil(refreshSafeReadModel());
});

self.addEventListener("message", (event) => {
  if (event.data === "FINANCIAL_APP_PWA_VERSION") {
    event.source?.postMessage({ type: "FINANCIAL_APP_PWA_VERSION", version: SW_VERSION });
  }
});
