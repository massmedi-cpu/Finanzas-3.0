import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const demandLoadedLinkFiles = [
  "app/app-shell.tsx",
  "app/mobile-navigation.tsx",
  "app/inicio-overview.tsx",
  "app/home-smart-brief.tsx",
  "app/number-explanation.tsx",
  "app/global-search.tsx",
] as const;

test("PERF · navegación visible no precarga rutas financieras dinámicas", () => {
  for (const path of demandLoadedLinkFiles) {
    const source = readFileSync(path, "utf8");
    const linkTags = source.match(/<Link\\b[\\s\\S]*?>/g) ?? [];
    expect(linkTags.length, `${path} debe conservar enlaces de navegación`).toBeGreaterThan(0);
    for (const tag of linkTags) {
      expect(tag, `${path} no debe precargar una ruta dinámica antes del clic`).toContain("prefetch={false}");
    }
  }
});
