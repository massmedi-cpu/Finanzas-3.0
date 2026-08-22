import { existsSync, readFileSync } from "node:fs";

const errors = [];
const need = [
  "lib/financial/backup-recovery.ts",
  "app/api/backup/route.ts",
  "database/FINANCIAL_APP_1.8.0_RECOVERY.sql",
  "scripts/backup-recovery-tests.ts",
  "docs/AUDIT_FINANCIAL_APP_1.8.0.md",
];
for (const file of need) if (!existsSync(file)) errors.push(`Falta ${file}`);

const api = readFileSync("app/api/backup/route.ts", "utf8");
const settings = readFileSync("app/configuracion/settings-client.tsx", "utf8");
const migration = existsSync("database/FINANCIAL_APP_1.8.0_RECOVERY.sql")
  ? readFileSync("database/FINANCIAL_APP_1.8.0_RECOVERY.sql", "utf8")
  : "";
const archive = readFileSync("app/archivo/archive-client.tsx", "utf8");
const vercel = readFileSync("vercel.json", "utf8");
const version = readFileSync("lib/app-version.ts", "utf8");

if (!api.includes("financial_app_backup_preview")) errors.push("La API no expone preview seguro");
if (!api.includes("financial_app_backup_restore")) errors.push("La API no expone restauración transaccional");
if (!api.includes("canExecuteRestore")) errors.push("La API no exige confirmación y huella antes de restaurar");
if (!settings.includes("PRIVATE_BACKUP_RESTORE_CONFIRMATION")) errors.push("Configuración no exige RESTAURAR explícito");
if (!settings.includes("backupFingerprint")) errors.push("Configuración no conserva la huella del preview");
if (!settings.includes("aria-describedby=\"restore-confirmation-help\"")) errors.push("La confirmación de restauración no está descrita de forma accesible");
if (!migration.includes("sourceAnchors")) errors.push("La copia 1.8 no protege el origen con anclas");
if (!migration.includes("private_backup_checkpoints")) errors.push("Falta checkpoint automático previo a restaurar");
if (!migration.includes("pg_advisory_xact_lock")) errors.push("Falta exclusión transaccional de restauraciones concurrentes");
if (!migration.includes("forecastOccurrences")) errors.push("La recuperación no cubre ocurrencias de previsión");
if (!migration.includes("financial_app_backup_restore")) errors.push("Falta RPC de restauración 1.8");
if (!archive.includes("worker.recognize(file)")) errors.push("OCR dejó de procesarse en el navegador");
if (!archive.includes("localProcessing:true")) errors.push("Archivo no declara procesamiento OCR local");
if (!vercel.includes('"financial-app-rebuild": false')) errors.push("La rama de trabajo volvería a consumir previews de Vercel");
if (!version.includes('APP_VERSION = "1.8.0"')) errors.push("Versión de aplicación no alineada con 1.8.0");

if (errors.length) {
  console.error("Financial App 1.8 audit FAILED");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log("Financial App 1.8 audit OK · preview/diff, checkpoint, restore atómico, OCR browser-local y protección de recursos");
