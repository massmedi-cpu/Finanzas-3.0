import { existsSync, readFileSync } from "node:fs";

const errors = [];
const need = [
  "lib/financial/backup-recovery.ts",
  "app/api/backup/route.ts",
  "database/FINANCIAL_APP_1.8.0_RECOVERY.sql",
  "database/FINANCIAL_APP_1.8.0_PRESERVE_NEWER_SOURCE_PRIVATE_STATE.sql",
  "scripts/backup-recovery-tests.ts",
  "docs/AUDIT_FINANCIAL_APP_1.8.0.md",
  "lib/document/ticket-ocr-engine.ts",
];
for (const file of need) if (!existsSync(file)) errors.push(`Falta ${file}`);

const api = readFileSync("app/api/backup/route.ts", "utf8");
const settings = readFileSync("app/configuracion/settings-client.tsx", "utf8");
const migration = existsSync("database/FINANCIAL_APP_1.8.0_RECOVERY.sql") ? readFileSync("database/FINANCIAL_APP_1.8.0_RECOVERY.sql", "utf8") : "";
const preserve = existsSync("database/FINANCIAL_APP_1.8.0_PRESERVE_NEWER_SOURCE_PRIVATE_STATE.sql") ? readFileSync("database/FINANCIAL_APP_1.8.0_PRESERVE_NEWER_SOURCE_PRIVATE_STATE.sql", "utf8") : "";
const archive = readFileSync("app/archivo/archive-client.tsx", "utf8");
const engine = existsSync("lib/document/ticket-ocr-engine.ts") ? readFileSync("lib/document/ticket-ocr-engine.ts", "utf8") : "";
const rectified = existsSync("lib/document/ticket-ocr-v307.ts") ? readFileSync("lib/document/ticket-ocr-v307.ts", "utf8") : "";
const tsconfig = readFileSync("tsconfig.json", "utf8");
const vercel = readFileSync("vercel.json", "utf8");
const version = readFileSync("lib/app-version.ts", "utf8");

if (!api.includes("financial_app_backup_preview")) errors.push("La API no expone preview seguro");
if (!api.includes("financial_app_backup_restore")) errors.push("La API no expone restauración transaccional");
if (!api.includes("canExecuteRestore")) errors.push("La API no exige confirmación y huella antes de restaurar");
if (!settings.includes("PRIVATE_BACKUP_RESTORE_CONFIRMATION")) errors.push("Configuración no exige RESTAURAR explícito");
if (!settings.includes("backupFingerprint")) errors.push("Configuración no conserva la huella del preview");
if (!settings.includes('aria-describedby="restore-confirmation-help"')) errors.push("La confirmación de restauración no está descrita de forma accesible");
if (!migration.includes("sourceAnchors")) errors.push("La copia 1.8 no protege el origen con anclas");
if (!migration.includes("private_backup_checkpoints")) errors.push("Falta checkpoint automático previo a restaurar");
if (!migration.includes("pg_advisory_xact_lock")) errors.push("Falta exclusión transaccional de restauraciones concurrentes");
if (!migration.includes("forecastOccurrences")) errors.push("La recuperación no cubre ocurrencias de previsión");
if (!migration.includes("financial_app_backup_restore")) errors.push("Falta RPC de restauración 1.8");
if (!preserve.includes("sourceAnchors")) errors.push("El hotfix no limita la reversión a movimientos presentes en el snapshot");
if (!preserve.includes("delete from financial_app.transaction_splits s\n  using financial_app.transactions t")) errors.push("El hotfix no protege splits de movimientos posteriores");
if (!preserve.includes("delete from financial_app.transaction_documents td\n  using financial_app.transactions t")) errors.push("El hotfix no protege vínculos de documentos posteriores");
if (!preserve.includes("Una conciliación que toca un movimiento posterior se conserva")) errors.push("Falta protección de conciliaciones posteriores");
if (!preserve.includes("Un documento posterior vinculado a un movimiento posterior permanece activo")) errors.push("Falta protección de documentos posteriores");
const browserOcr = archive.includes("recognizeTicketImage(file,worker,onProgress,hint)") && archive.includes("window.Tesseract.createWorker") && engine.includes("sparseReceiptPass") && rectified.includes("worker.recognize(input") && tsconfig.includes('"@/lib/document/ticket-ocr": ["./lib/document/ticket-ocr-engine"]');
if (!browserOcr) errors.push("OCR dejó de procesarse en el navegador mediante el motor canónico local");
if (!archive.includes("localProcessing:true")) errors.push("Archivo no declara procesamiento OCR local");
if (!archive.includes("automaticOnImport:true")) errors.push("El OCR local ya no se completa automáticamente al importar");
if (!vercel.includes('"financial-app-rebuild": false')) errors.push("La rama de trabajo volvería a consumir previews de Vercel");

const match = version.match(/APP_VERSION\s*=\s*"(\d+)\.(\d+)\.(\d+)"/);
const current = match ? match.slice(1).map(Number) : null;
const supports18 = current && (current[0] > 1 || (current[0] === 1 && current[1] >= 8));
if (!supports18) errors.push("La auditoría 1.8 solo puede ejecutarse en Financial App >= 1.8.0");

if (errors.length) {console.error("Financial App 1.8 audit FAILED");errors.forEach((error) => console.error(`- ${error}`));process.exit(1)}
console.log("Financial App 1.8 audit OK · recuperación y OCR local automático preservados en motor canónico");
