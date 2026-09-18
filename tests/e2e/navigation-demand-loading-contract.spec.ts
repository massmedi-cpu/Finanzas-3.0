import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

function tsxFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...tsxFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".tsx")) files.push(path);
  }
  return files;
}

test("PERF · ningún Link interno precarga rutas antes del clic", () => {
  const linkFiles = tsxFiles("app").filter((path) => readFileSync(path, "utf8").includes("<Link"));
  expect(linkFiles.length).toBeGreaterThan(0);

  for (const path of linkFiles) {
    const source = readFileSync(path, "utf8");
    const linkTags = source.split("<Link").slice(1).map((fragment) => fragment.split(">")[0] ?? "");
    for (const tag of linkTags) {
      expect(tag, `${path} no debe precargar una ruta antes del clic`).toContain("prefetch={false}");
    }
  }
});
