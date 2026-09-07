import type { NextConfig } from "next";

const ocrRuntimeAssets = [
  "./node_modules/tesseract.js/**/*",
  "./node_modules/tesseract.js-core/**/*",
  "./node_modules/@tesseract.js-data/spa/**/*",
  "./node_modules/regenerator-runtime/**/*",
  "./node_modules/wasm-feature-detect/**/*",
  "./node_modules/zlibjs/**/*",
  "./node_modules/bmp-js/**/*",
  "./node_modules/is-url/**/*",
  "./node_modules/node-fetch/**/*",
  "./node_modules/idb-keyval/**/*",
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/documents": ocrRuntimeAssets,
  },
};

export default nextConfig;
