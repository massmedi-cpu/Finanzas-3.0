import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Financial App",
    short_name: "Financial App",
    description: "Control, análisis, presupuesto y planificación financiera personal",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6f8",
    theme_color: "#0b72ff",
    orientation: "portrait-primary",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
