import type { NextConfig } from 'next';
import { APP_VERSION } from './lib/app-version';

const ocrRuntimeAssets = [
  './node_modules/tesseract.js/**/*',
  './node_modules/tesseract.js-core/**/*',
  './node_modules/@tesseract.js-data/spa/**/*',
  './node_modules/regenerator-runtime/**/*',
  './node_modules/wasm-feature-detect/**/*',
  './node_modules/zlibjs/**/*',
  './node_modules/bmp-js/**/*',
  './node_modules/is-url/**/*',
  './node_modules/node-fetch/**/*',
  './node_modules/idb-keyval/**/*',
];

const pdfRenderRuntimeAssets = [
  './node_modules/@napi-rs/canvas/**/*',
  './node_modules/@napi-rs/canvas-linux-x64-gnu/**/*',
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Native canvas contains platform binaries and must stay a Node dependency;
  // Turbopack must not try to place its binding inside ESM chunks.
  serverExternalPackages: ['@napi-rs/canvas'],
  outputFileTracingIncludes: {
    '/api/ocr/receipt': ocrRuntimeAssets,
    '/api/sync': [...ocrRuntimeAssets, ...pdfRenderRuntimeAssets],
  },
  async redirects() {
    return [{ source: '/favicon.ico', destination: '/icon.png', permanent: true }];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'X-Financial-App-Version', value: APP_VERSION },
        ],
      },
      { source: '/brand/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/icons/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      { source: '/manifest.webmanifest', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
      // OCR loaders are operational code, not versioned immutable assets. Never let
      // a browser reuse an older transport/provenance policy after a deployment.
      { source: '/vendor/receipt-ocr-loader.mjs', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
      { source: '/vendor/paddleocr-loader.mjs', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] },
    ];
  },
};

export default nextConfig;