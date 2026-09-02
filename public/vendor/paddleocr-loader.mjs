// Legacy browser shim kept only for already-cached Financial App tabs.
// New code loads /vendor/receipt-ocr-loader.mjs directly. Recognition always
// happens in the authenticated server endpoint and declares its real runtime.
import "/vendor/receipt-ocr-loader.mjs";

const adapter = window.__financialReceiptOCR;
if (!adapter?.ReceiptOCR) throw new Error("OCR de tickets no disponible");

window.__financialPaddleOCR = { PaddleOCR: adapter.ReceiptOCR };
window.dispatchEvent(new Event("financial-paddleocr-ready"));
