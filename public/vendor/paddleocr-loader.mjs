import { PaddleOCR } from "https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm";

window.__financialPaddleOCR = { PaddleOCR };
window.dispatchEvent(new Event("financial-paddleocr-ready"));
