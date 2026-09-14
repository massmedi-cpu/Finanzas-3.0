const SW_VERSION = "financial-app-pwa-v1";

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

self.addEventListener("message", (event) => {
  if (event.data === "FINANCIAL_APP_PWA_VERSION") {
    event.source?.postMessage({ type: "FINANCIAL_APP_PWA_VERSION", version: SW_VERSION });
  }
});
