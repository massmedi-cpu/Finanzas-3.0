import { defineConfig } from "@playwright/test";

// These provider/domain tests run real OCR without a browser, app server or credentials.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /document-ocr-(?:contract|service|runtime-composition|anchor-filter(?:-clean-input)?|anchor-recrop-monotonic|anchor-width|row-geometry|padded-cell-consensus|focused-cell-consensus|row-cell-consensus|row-refinement|column-sweep|upscaled-cell-consensus|cell-recovery|columns-native|illumination-native)\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "list",
  projects: [{ name: "chromium-desktop" }],
});
