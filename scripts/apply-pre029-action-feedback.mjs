import fs from "node:fs";
import { execFileSync } from "node:child_process";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.mkdirSync(path.split("/").slice(0, -1).join("/"), { recursive: true });
  fs.writeFileSync(path, content);
}

function replaceOnce(content, search, replacement, label) {
  const first = content.indexOf(search);
  if (first < 0) throw new Error(`PRE-029 anchor missing: ${label}`);
  if (content.indexOf(search, first + search.length) >= 0) throw new Error(`PRE-029 anchor is not unique: ${label}`);
  return content.slice(0, first) + replacement + content.slice(first + search.length);
}

function patch(path, operations) {
  let content = read(path);
  for (const [search, replacement, label] of operations) {
    content = replaceOnce(content, search, replacement, `${path} · ${label}`);
  }
  write(path, content);
}

patch("app/layout.tsx", [
  [
    'import { APP_VERSION } from "../src/core/build-info";\n',
    'import { APP_VERSION } from "../src/core/build-info";\nimport { ActionFeedbackProvider } from "./action-feedback";\n',
    "provider import",
  ],
  [
    'import "./accessibility-live-regions.css";\n',
    'import "./accessibility-live-regions.css";\nimport "./action-feedback.css";\n',
    "feedback css",
  ],
  [
    '        <PwaRuntimeProvider>{children}</PwaRuntimeProvider>',
    '        <ActionFeedbackProvider><PwaRuntimeProvider>{children}</PwaRuntimeProvider></ActionFeedbackProvider>',
    "root provider",
  ],
]);

const documentHelpers = `function documentActionPendingLabel(action: string) {
  if (action === "upload") return "Guardando documento de forma privada…";
  if (action === "metadata") return "Guardando metadatos revisados…";
  if (action.startsWith("status-")) return "Actualizando estado documental…";
  if (action === "open") return "Abriendo documento…";
  if (action === "candidates") return "Buscando movimientos candidatos…";
  if (action.startsWith("associate-")) return "Asociando movimiento…";
  if (action.startsWith("unassociate-")) return "Eliminando asociación…";
  if (action === "manual-search") return "Buscando movimientos…";
  return "Procesando operación documental…";
}

function documentActionSuccessLabel(action: string) {
  if (action === "upload") return "Documento guardado de forma privada.";
  if (action === "metadata") return "Metadatos guardados.";
  if (action.startsWith("status-")) return "Estado documental actualizado.";
  if (action === "open") return "Documento abierto.";
  if (action === "candidates") return "Búsqueda de movimientos completada.";
  if (action.startsWith("associate-")) return "Movimiento asociado. La fuente bancaria no se ha modificado.";
  if (action.startsWith("unassociate-")) return "Asociación eliminada. La fuente bancaria no se ha modificado.";
  if (action === "manual-search") return "Búsqueda de movimientos completada.";
  return "Operación documental completada.";
}

`;

patch("app/documents/documents-client.tsx", [
  [
    'import { DraftRecoveryNotice } from "../draft-recovery-notice";\n',
    'import { useActionFeedback } from "../action-feedback";\nimport { DraftRecoveryNotice } from "../draft-recovery-notice";\n',
    "feedback import",
  ],
  [
    'function StatusBadge({ status }: { status: DocumentStatus }) {',
    documentHelpers + 'function StatusBadge({ status }: { status: DocumentStatus }) {',
    "action labels",
  ],
  [
    'export function DocumentsClient() {\n',
    'export function DocumentsClient() {\n  const actionFeedback = useActionFeedback();\n',
    "provider hook",
  ],
  [
    '  const selectedIdRef = useRef<string | null>(null);\n  selectedIdRef.current = selectedId;\n',
    '  const selectedIdRef = useRef<string | null>(null);\n  const feedbackActionRef = useRef<string | null>(null);\n  selectedIdRef.current = selectedId;\n',
    "feedback ref",
  ],
  [
    '  useEffect(() => { void loadList(); }, [loadList]);\n  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId, loadDetail]);\n',
    `  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); }, [selectedId, loadDetail]);
  useEffect(() => {
    if (busy) {
      feedbackActionRef.current = busy;
      actionFeedback.begin(\`documents:\${busy}\`, documentActionPendingLabel(busy));
      return;
    }
    const completed = feedbackActionRef.current;
    if (!completed) return;
    const feedbackId = \`documents:\${completed}\`;
    if (error) actionFeedback.error(feedbackId, error);
    else actionFeedback.success(feedbackId, documentActionSuccessLabel(completed));
    feedbackActionRef.current = null;
  }, [actionFeedback, busy, error]);
`,
    "global lifecycle",
  ],
]);

patch("app/documents/ocr-review-panel.tsx", [
  [
    'import { summarizeDocumentOcrReview } from "../../src/application/document-ocr-review";\n',
    'import { summarizeDocumentOcrReview } from "../../src/application/document-ocr-review";\nimport { useActionFeedback } from "../action-feedback";\n',
    "feedback import",
  ],
  [
    '}) {\n  const [result, setResult] = useState<OcrResult | null>(null);\n',
    '}) {\n  const actionFeedback = useActionFeedback();\n  const [result, setResult] = useState<OcrResult | null>(null);\n',
    "provider hook",
  ],
  [
    '    setBusy(true);\n    setError(null);\n    setCopyState("idle");\n    try {\n',
    '    setBusy(true);\n    setError(null);\n    setCopyState("idle");\n    const feedbackId = `documents:ocr:${documentId}`;\n    actionFeedback.begin(feedbackId, "Analizando documento con OCR…");\n    try {\n',
    "ocr begin",
  ],
  [
    '      const data = await readJson(await fetch(`/api/documents/ocr?id=${encodeURIComponent(documentId)}`, { cache: "no-store" }));\n      setResult(parseOcrResult(data));\n    } catch (caught) {\n      const code = caught instanceof Error ? caught.message : "request_failed";\n      setError(errorLabel(code));\n',
    '      const data = await readJson(await fetch(`/api/documents/ocr?id=${encodeURIComponent(documentId)}`, { cache: "no-store" }));\n      const parsed = parseOcrResult(data);\n      setResult(parsed);\n      actionFeedback.success(feedbackId, "Lectura OCR completada. Revisa el resultado antes de usar sus datos.");\n    } catch (caught) {\n      const code = caught instanceof Error ? caught.message : "request_failed";\n      const message = errorLabel(code);\n      setError(message);\n      actionFeedback.error(feedbackId, message);\n',
    "ocr completion",
  ],
]);

patch("app/budgets/budgets-client.tsx", [
  [
    'import { ProductIcon, type ProductIconName } from "../../src/design/product-icons";\n',
    'import { ProductIcon, type ProductIconName } from "../../src/design/product-icons";\nimport { useActionFeedback } from "../action-feedback";\n',
    "feedback import",
  ],
  [
    'export default function BudgetsClient() {\n',
    'export default function BudgetsClient() {\n  const actionFeedback = useActionFeedback();\n',
    "provider hook",
  ],
  [
    '    setBusy(true);\n    setError("");\n    setNotice("");\n    setFieldError("");\n    try {\n',
    '    setBusy(true);\n    setError("");\n    setNotice("");\n    setFieldError("");\n    const feedbackId = method === "POST" ? "budgets:refresh" : "budgets:save-limit";\n    actionFeedback.begin(feedbackId, method === "POST" ? "Actualizando referencias del presupuesto…" : "Guardando límite de presupuesto…");\n    try {\n',
    "mutation begin",
  ],
  [
    '      setNotice(successMessage);\n      return true;\n    } catch (caught) {\n      setError(caught instanceof Error ? caught.message : "No se pudo actualizar el presupuesto.");\n      return false;\n',
    '      setNotice(successMessage);\n      actionFeedback.success(feedbackId, successMessage);\n      return true;\n    } catch (caught) {\n      const message = caught instanceof Error ? caught.message : "No se pudo actualizar el presupuesto.";\n      setError(message);\n      actionFeedback.error(feedbackId, message);\n      return false;\n',
    "mutation completion",
  ],
  [
    '  }, []);\n\n  const handleRefresh = useCallback(() => {',
    '  }, [actionFeedback]);\n\n  const handleRefresh = useCallback(() => {',
    "mutation dependency",
  ],
]);

patch("app/configuration/rules/rules-client.tsx", [
  [
    'import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";\n',
    'import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";\nimport { useActionFeedback } from "../../action-feedback";\n',
    "feedback import",
  ],
  [
    'export default function RulesClient() {\n',
    'export default function RulesClient() {\n  const actionFeedback = useActionFeedback();\n',
    "provider hook",
  ],
  [
    '    setBusy(true);\n    setError(null);\n    setNotice(null);\n    try {\n      const priority = Number(form.priority);\n',
    '    setBusy(true);\n    setError(null);\n    setNotice(null);\n    const feedbackId = editingId ? "rules:update" : "rules:create";\n    actionFeedback.begin(feedbackId, editingId ? "Guardando cambios de la regla…" : "Creando regla…");\n    try {\n      const priority = Number(form.priority);\n',
    "save begin",
  ],
  [
    '      setNotice("Regla guardada en el motor central. No se ha escrito nada en la fuente bancaria.");\n    } catch (cause) {\n      setError(cause instanceof Error ? cause.message : "No se pudo guardar la regla.");\n',
    '      const message = "Regla guardada en el motor central. No se ha escrito nada en la fuente bancaria.";\n      setNotice(message);\n      actionFeedback.success(feedbackId, message);\n    } catch (cause) {\n      const message = cause instanceof Error ? cause.message : "No se pudo guardar la regla.";\n      setError(message);\n      actionFeedback.error(feedbackId, message);\n',
    "save completion",
  ],
  [
    '  async function toggleRule(rule: Rule) {\n    setBusy(true);\n    setError(null);\n    setNotice(null);\n    try {\n',
    '  async function toggleRule(rule: Rule) {\n    setBusy(true);\n    setError(null);\n    setNotice(null);\n    const feedbackId = `rules:toggle:${rule.id}`;\n    actionFeedback.begin(feedbackId, rule.status === "active" ? "Desactivando regla…" : "Activando regla…");\n    try {\n',
    "toggle begin",
  ],
  [
    '      await load();\n      setNotice(rule.status === "active" ? "Regla desactivada." : "Regla activada.");\n    } catch (cause) {\n      setError(cause instanceof Error ? cause.message : "No se pudo cambiar el estado de la regla.");\n',
    '      await load();\n      const message = rule.status === "active" ? "Regla desactivada." : "Regla activada.";\n      setNotice(message);\n      actionFeedback.success(feedbackId, message);\n    } catch (cause) {\n      const message = cause instanceof Error ? cause.message : "No se pudo cambiar el estado de la regla.";\n      setError(message);\n      actionFeedback.error(feedbackId, message);\n',
    "toggle completion",
  ],
  [
    '  async function evaluate(event: FormEvent) {\n    event.preventDefault();\n    setBusy(true);\n    setError(null);\n    setExplanation(null);\n    try {\n',
    '  async function evaluate(event: FormEvent) {\n    event.preventDefault();\n    setBusy(true);\n    setError(null);\n    setExplanation(null);\n    const feedbackId = "rules:evaluate";\n    actionFeedback.begin(feedbackId, "Probando regla con el movimiento…");\n    try {\n',
    "evaluate begin",
  ],
  [
    '      const result = await ruleRequest("rule.evaluate", { transactionId });\n      setExplanation(result.result ?? null);\n    } catch (cause) {\n      setError(cause instanceof Error ? cause.message : "No se pudo simular el movimiento.");\n',
    '      const result = await ruleRequest("rule.evaluate", { transactionId });\n      setExplanation(result.result ?? null);\n      actionFeedback.success(feedbackId, "Prueba de regla completada. Revisa el resultado antes de aplicarlo.");\n    } catch (cause) {\n      const message = cause instanceof Error ? cause.message : "No se pudo simular el movimiento.";\n      setError(message);\n      actionFeedback.error(feedbackId, message);\n',
    "evaluate completion",
  ],
  [
    '  async function applyAll() {\n    setBusy(true);\n    setError(null);\n    setNotice(null);\n    setApplyResult(null);\n    try {\n',
    '  async function applyAll() {\n    setBusy(true);\n    setError(null);\n    setNotice(null);\n    setApplyResult(null);\n    const feedbackId = "rules:apply-all";\n    actionFeedback.begin(feedbackId, "Aplicando reglas en Financial App…");\n    try {\n',
    "apply begin",
  ],
  [
    '      setNotice(`Motor aplicado: ${evaluated} movimientos evaluados y ${matched} coincidencias. Los cambios quedan en Financial App, nunca en la fuente bancaria.`);\n    } catch (cause) {\n      setError(cause instanceof Error ? cause.message : "No se pudieron aplicar las reglas.");\n',
    '      const message = `Motor aplicado: ${evaluated} movimientos evaluados y ${matched} coincidencias. Los cambios quedan en Financial App, nunca en la fuente bancaria.`;\n      setNotice(message);\n      actionFeedback.success(feedbackId, message);\n    } catch (cause) {\n      const message = cause instanceof Error ? cause.message : "No se pudieron aplicar las reglas.";\n      setError(message);\n      actionFeedback.error(feedbackId, message);\n',
    "apply completion",
  ],
]);

patch("app/configuration/source/source-client.tsx", [
  [
    'import { formatMoneyCents } from "../../../src/core/money";\n',
    'import { formatMoneyCents } from "../../../src/core/money";\nimport { useActionFeedback } from "../../action-feedback";\n',
    "feedback import",
  ],
  [
    'export default function SourceClient() {\n',
    'export default function SourceClient() {\n  const actionFeedback = useActionFeedback();\n',
    "provider hook",
  ],
  [
    '    setBusy(true);\n    setError(null);\n    setNotice(null);\n\n    try {\n      const response = await fetch("/api/source/google/preflight", { method: "POST" });\n',
    '    setBusy(true);\n    setError(null);\n    setNotice(null);\n    const feedbackId = "source:preflight";\n    actionFeedback.begin(feedbackId, "Validando la fuente bancaria en modo solo lectura…");\n\n    try {\n      const response = await fetch("/api/source/google/preflight", { method: "POST" });\n',
    "preflight begin",
  ],
  [
    '      setNotice({\n        message: `Prevalidación correcta: ${payload.totalAuthoritativeRows} movimientos autoritativos y ${payload.accounts.length} productos, sin escribir en la base de datos.`,\n        tone: "success",\n      });\n    } catch (cause) {\n      setPreflight(null);\n      setError(cause instanceof Error ? cause.message : "La prevalidación no se ha podido completar.");\n',
    '      const message = `Prevalidación correcta: ${payload.totalAuthoritativeRows} movimientos autoritativos y ${payload.accounts.length} productos, sin escribir en la base de datos.`;\n      setNotice({ message, tone: "success" });\n      actionFeedback.success(feedbackId, message);\n    } catch (cause) {\n      setPreflight(null);\n      const message = cause instanceof Error ? cause.message : "La prevalidación no se ha podido completar.";\n      setError(message);\n      actionFeedback.error(feedbackId, message);\n',
    "preflight completion",
  ],
  [
    '    setNotice(null);\n    setSyncResult(null);\n\n    try {\n      const response = await fetch("/api/source/google/sync", { method: "POST" });\n',
    '    setNotice(null);\n    setSyncResult(null);\n    const feedbackId = "source:sync";\n    actionFeedback.begin(feedbackId, "Sincronizando desde Google en modo solo lectura…");\n\n    try {\n      const response = await fetch("/api/source/google/sync", { method: "POST" });\n',
    "sync begin",
  ],
  [
    '      setNotice({\n        message: incident ? `${summary} ${incident}` : summary,\n        tone: incident ? "warning" : "success",\n      });\n      await load();\n    } catch (cause) {\n      const message = cause instanceof Error ? cause.message : "La actualización no se ha podido completar.";\n      await load();\n      setError(message);\n',
    '      setNotice({\n        message: incident ? `${summary} ${incident}` : summary,\n        tone: incident ? "warning" : "success",\n      });\n      await load();\n      actionFeedback.success(feedbackId, summary);\n    } catch (cause) {\n      const message = cause instanceof Error ? cause.message : "La actualización no se ha podido completar.";\n      await load();\n      setError(message);\n      actionFeedback.error(feedbackId, message);\n',
    "sync completion",
  ],
  [
    '  async function disconnect() {\n    if (!connected || busy || managedConnection) return;\n    setBusy(true);\n    setError(null);\n    setNotice(null);\n\n    try {\n',
    '  async function disconnect() {\n    if (!connected || busy || managedConnection) return;\n    setBusy(true);\n    setError(null);\n    setNotice(null);\n    const feedbackId = "source:disconnect";\n    actionFeedback.begin(feedbackId, "Desconectando Google…");\n\n    try {\n',
    "disconnect begin",
  ],
  [
    '      setNotice({\n        message: "Conexión Google eliminada. Los movimientos ya importados permanecen intactos.",\n        tone: "success",\n      });\n      await load();\n    } catch (cause) {\n      setError(cause instanceof Error ? cause.message : "No se ha podido desconectar Google.");\n',
    '      const message = "Conexión Google eliminada. Los movimientos ya importados permanecen intactos.";\n      setNotice({ message, tone: "success" });\n      await load();\n      actionFeedback.success(feedbackId, message);\n    } catch (cause) {\n      const message = cause instanceof Error ? cause.message : "No se ha podido desconectar Google.";\n      setError(message);\n      actionFeedback.error(feedbackId, message);\n',
    "disconnect completion",
  ],
]);

execFileSync("npm", ["version", "10.0.48", "--no-git-tag-version", "--allow-same-version"], { stdio: "inherit" });

write("tests/e2e/action-feedback-10.0.48.spec.ts", `import { expect, test } from "@playwright/test";

const rule = {
  id: "rule-feedback-test",
  name: "Regla de prueba",
  status: "active",
  priority: 100,
  concept_contains: "TEST",
  merchant_id: null,
  account_id: null,
  category_id: null,
  minimum_amount_cents: null,
  maximum_amount_cents: null,
  target_category_id: "category-test",
  target_merchant_id: null,
  merchant_name: null,
  account_name: null,
  category_name: null,
  target_category_name: "Pruebas",
  target_merchant_name: null,
};

const payload = {
  rules: [rule],
  accounts: [],
  categories: [{ id: "category-test", name: "Pruebas", kind: "expense", lifecycle: "active" }],
  merchants: [],
};

test("una acción real permanece pending hasta que el servidor confirma el resultado", async ({ page }) => {
  let releasePost!: () => void;
  const postGate = new Promise<void>((resolve) => { releasePost = resolve; });

  await page.route("**/api/rules", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
      return;
    }
    await postGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: { evaluated: 3, matched: 2, merchantChanged: 0, categoryChanged: 2 } }),
    });
  });

  await page.goto("/configuration/rules");
  const apply = page.getByRole("button", { name: "Aplicar reglas" });
  await expect(apply).toBeEnabled();
  await apply.click();

  const feedback = page.locator('[data-action-id="rules:apply-all"]');
  await expect(feedback).toHaveAttribute("data-state", "pending");
  await expect(feedback).toContainText("Aplicando reglas");
  await expect(feedback).not.toHaveAttribute("data-state", "success");

  releasePost();
  await expect(feedback).toHaveAttribute("data-state", "success");
  await expect(feedback).toContainText("3 movimientos evaluados y 2 coincidencias");
  await expect(feedback).toHaveAttribute("role", "status");
});

test("un fallo real sustituye pending por error y nunca anuncia éxito", async ({ page }) => {
  await page.route("**/api/rules", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(payload) });
      return;
    }
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "forced_failure" }) });
  });

  await page.goto("/configuration/rules");
  await page.getByRole("button", { name: "Aplicar reglas" }).click();

  const feedback = page.locator('[data-action-id="rules:apply-all"]');
  await expect(feedback).toHaveAttribute("data-state", "error");
  await expect(feedback).toHaveAttribute("role", "alert");
  await expect(feedback).toContainText("No se pudo completar la operación");
  await expect(feedback).not.toContainText("Motor aplicado");

  await feedback.getByRole("button", { name: "Cerrar aviso" }).click();
  await expect(feedback).toHaveCount(0);
});

test("el contrato global cubre los flujos nombrados sin ampliar permisos bancarios", async () => {
  const fs = await import("node:fs/promises");
  const provider = await fs.readFile("app/action-feedback.tsx", "utf8");
  const documents = await fs.readFile("app/documents/documents-client.tsx", "utf8");
  const ocr = await fs.readFile("app/documents/ocr-review-panel.tsx", "utf8");
  const budgets = await fs.readFile("app/budgets/budgets-client.tsx", "utf8");
  const rules = await fs.readFile("app/configuration/rules/rules-client.tsx", "utf8");
  const source = await fs.readFile("app/configuration/source/source-client.tsx", "utf8");

  expect(provider).toContain('type ActionFeedbackState = "pending" | "success" | "error"');
  expect(provider).toContain('role={item.state === "error" ? "alert" : "status"}');
  expect(documents).toContain("documents:associate-");
  expect(ocr).toContain("documents:ocr:");
  expect(budgets).toContain("budgets:save-limit");
  expect(rules).toContain("rules:evaluate");
  expect(source).toContain("source:sync");
  expect(source).toContain("modo solo lectura");
  expect(source).not.toContain("drive.file");
});
`);

write(".github/workflows/global-action-feedback-10.0.48.yml", `name: Global Action Feedback 10.0.48

on:
  pull_request:
    branches:
      - main
    paths:
      - "app/action-feedback.tsx"
      - "app/action-feedback.css"
      - "app/layout.tsx"
      - "app/documents/**"
      - "app/budgets/**"
      - "app/configuration/rules/**"
      - "app/configuration/source/**"
      - "tests/e2e/action-feedback-10.0.48.spec.ts"
      - "package.json"
      - "package-lock.json"
      - ".github/workflows/global-action-feedback-10.0.48.yml"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  certify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Checkout exact candidate
        uses: actions/checkout@v6
      - name: Setup Node.js 24
        uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
      - name: Install dependencies
        run: npm ci --ignore-scripts --no-audit --no-fund
      - name: TypeScript
        run: npm run typecheck
      - name: Install Chromium
        run: npx playwright install --with-deps chromium
      - name: Certify feedback lifecycle on desktop and mobile
        run: npx playwright test tests/e2e/action-feedback-10.0.48.spec.ts --project=chromium-desktop --project=chromium-mobile --workers=2
`);

console.log("PRE-029 action feedback codemod applied successfully.");
