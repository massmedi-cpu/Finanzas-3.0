import * as pdfjsLib from "/vendor/document-engine/pdfjs/pdf.min.mjs";
pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/document-engine/pdfjs/pdf.worker.min.mjs";
window.__financialPdfjs = pdfjsLib;
window.dispatchEvent(new Event("financial-pdfjs-ready"));
