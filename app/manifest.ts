import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Financial App",
    short_name: "Financial",
    description: "Gestión personal de finanzas en una aplicación instalable y segura.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#050914",
    theme_color: "#050914",
    lang: "es-ES",
    categories: ["finance", "productivity"],
    prefer_related_applications: false,
    shortcuts: [
      { name: "Movimientos", short_name: "Movimientos", url: "/transactions" },
      { name: "Análisis", short_name: "Análisis", url: "/analysis" },
      { name: "Comparador", short_name: "Comparar", url: "/compare" },
      { name: "Para revisar", short_name: "Revisar", url: "/review" },
    ],
    icons: [
      {
        src: "/pwa-icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/pwa-icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/pwa-icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/pwa-icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
