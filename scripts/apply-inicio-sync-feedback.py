from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    matches = text.count(old)
    if matches != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {matches}")
    target.write_text(text.replace(old, new, 1))


replace_once(
    "app/inicio-overview.tsx",
    """    rowsSkipped: number;
    rowsFailed: number;
    errorCode: string | null;""",
    """    rowsSkipped: number;
    rowsFailed: number;
    duplicatesDetected: number;
    warningsCount: number;
    errorCode: string | null;""",
)

replace_once(
    "app/inicio-overview.tsx",
    """type AttentionItem = {
  title: string;""",
    """type SyncResult = {
  rowsInserted?: number;
  rowsRevised?: number;
  rowsSkipped?: number;
  rowsMissing?: number;
  duplicatesDetected?: number;
  warningsCount?: number;
  error?: string;
};

type AttentionItem = {
  title: string;""",
)

replace_once(
    "app/inicio-overview.tsx",
    """function kindLabel(kind: TransactionKind) {
  if (kind === \"income\") return \"Ingreso\";
  if (kind === \"expense\") return \"Gasto\";
  if (kind === \"transfer\") return \"Transferencia\";
  if (kind === \"refund\") return \"Devolución\";
  return \"Ajuste\";
}

async function readJson<T>""",
    """function kindLabel(kind: TransactionKind) {
  if (kind === \"income\") return \"Ingreso\";
  if (kind === \"expense\") return \"Gasto\";
  if (kind === \"transfer\") return \"Transferencia\";
  if (kind === \"refund\") return \"Devolución\";
  return \"Ajuste\";
}

function syncFeedbackFromResult(result: SyncResult | null) {
  const changed = Math.max(0, result?.rowsInserted ?? 0) + Math.max(0, result?.rowsRevised ?? 0);
  const missing = Math.max(0, result?.rowsMissing ?? 0);
  const warnings = Math.max(missing, Math.max(0, result?.warningsCount ?? 0));
  const duplicates = Math.max(0, result?.duplicatesDetected ?? 0);
  if (changed === 0 && warnings === 0 && duplicates === 0) return \"Sin cambios nuevos.\";

  const parts = [changed > 0 ? `${changed} cambios incorporados.` : \"Sin cambios incorporados.\"];
  if (missing > 0) {
    parts.push(
      missing === 1
        ? \"1 movimiento importado anteriormente ya no aparece en la fuente.\"
        : `${missing} movimientos importados anteriormente ya no aparecen en la fuente.`,
    );
  } else if (warnings > 0) {
    parts.push(
      warnings === 1
        ? \"1 aviso de sincronización requiere revisión.\"
        : `${warnings} avisos de sincronización requieren revisión.`,
    );
  }
  if (duplicates > 0) {
    parts.push(
      duplicates === 1
        ? \"1 posible duplicado detectado.\"
        : `${duplicates} posibles duplicados detectados.`,
    );
  }
  if (warnings > 0 || duplicates > 0) parts.push(\"Revisa la fuente.\");
  return parts.join(\" \");
}

function syncStatusNotice(run: SyncStatus[\"run\"]) {
  if (!run || run.status !== \"success\") return null;
  const warnings = Math.max(0, run.warningsCount ?? 0);
  const duplicates = Math.max(0, run.duplicatesDetected ?? 0);
  if (warnings === 0 && duplicates === 0) return null;
  const parts: string[] = [];
  if (warnings > 0) {
    parts.push(
      warnings === 1
        ? \"1 aviso de sincronización requiere revisión.\"
        : `${warnings} avisos de sincronización requieren revisión.`,
    );
  }
  if (duplicates > 0) {
    parts.push(
      duplicates === 1
        ? \"1 posible duplicado detectado.\"
        : `${duplicates} posibles duplicados detectados.`,
    );
  }
  parts.push(\"Revisa la fuente.\");
  return parts.join(\" \");
}

async function readJson<T>""",
)

replace_once(
    "app/inicio-overview.tsx",
    """      const payload = await response.json().catch(() => null) as null | {
        rowsInserted?: number;
        rowsRevised?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(payload?.error ?? `sync_failed_${response.status}`);
      const changed = (payload?.rowsInserted ?? 0) + (payload?.rowsRevised ?? 0);
      setSyncFeedback(changed > 0 ? `${changed} cambios incorporados.` : \"Sin cambios nuevos.\");""",
    """      const payload = await response.json().catch(() => null) as SyncResult | null;
      if (!response.ok) throw new Error(payload?.error ?? `sync_failed_${response.status}`);
      setSyncFeedback(syncFeedbackFromResult(payload));""",
)

replace_once(
    "app/inicio-overview.tsx",
    """  const syncFailed = syncRun?.status === \"failed\";
  const syncSucceeded = syncRun?.status === \"success\";
  const revealAmounts = privacyReady && amountsVisible;""",
    """  const syncFailed = syncRun?.status === \"failed\";
  const syncSucceeded = syncRun?.status === \"success\";
  const syncWarningCount = Math.max(0, syncRun?.warningsCount ?? 0);
  const syncDuplicateCount = Math.max(0, syncRun?.duplicatesDetected ?? 0);
  const syncHasWarnings = syncSucceeded && (syncWarningCount > 0 || syncDuplicateCount > 0);
  const syncPersistentNotice = syncFeedback ? null : syncStatusNotice(syncRun);
  const revealAmounts = privacyReady && amountsVisible;""",
)

replace_once(
    "app/inicio-overview.tsx",
    """    if (syncFailed) {
      items.push({
        title: \"La última actualización falló\",
        detail: \"La fuente sigue protegida; puedes reintentar la lectura sin reconectar Google.\",
        href: \"/configuration/source\",
        action: \"Ver fuente\",
        tone: \"danger\",
      });
    }""",
    """    if (syncFailed) {
      items.push({
        title: \"La última actualización falló\",
        detail: \"La fuente sigue protegida; puedes reintentar la lectura sin reconectar Google.\",
        href: \"/configuration/source\",
        action: \"Ver fuente\",
        tone: \"danger\",
      });
    } else if (syncHasWarnings) {
      items.push({
        title: \"La última sincronización tiene avisos\",
        detail: syncStatusNotice(syncRun) ?? \"La sincronización terminó, pero requiere revisión.\",
        href: \"/configuration/source\",
        action: \"Revisar fuente\",
        tone: \"warning\",
      });
    }""",
)

replace_once(
    "app/inicio-overview.tsx",
    """  }, [data.forecast, displayMoney, failed.length, financial, overBudgetCount, syncFailed]);""",
    """  }, [data.forecast, displayMoney, failed.length, financial, overBudgetCount, syncFailed, syncHasWarnings, syncRun]);""",
)

replace_once(
    "app/inicio-overview.tsx",
    """        className={`${styles.sourceHealth} ${syncFailed ? styles.sourceError : syncSucceeded ? styles.sourceOk : \"\"}`}""",
    """        className={`${styles.sourceHealth} ${syncFailed ? styles.sourceError : syncHasWarnings ? styles.sourceWarning : syncSucceeded ? styles.sourceOk : \"\"}`}""",
)

replace_once(
    "app/inicio-overview.tsx",
    """                  : syncSucceeded
                    ? \"Última sincronización completada\"
                    : \"Estado de la fuente pendiente\"}""",
    """                  : syncHasWarnings
                    ? \"Sincronización completada con avisos\"
                    : syncSucceeded
                      ? \"Última sincronización completada\"
                      : \"Estado de la fuente pendiente\"}""",
)

replace_once(
    "app/inicio-overview.tsx",
    """              {syncFeedback ? ` ${syncFeedback}` : \"\"}
            </p>""",
    """              {syncPersistentNotice ? ` ${syncPersistentNotice}` : \"\"}
              {syncFeedback ? ` ${syncFeedback}` : \"\"}
            </p>""",
)

replace_once(
    "app/inicio-overview.module.css",
    """.sourceError {
  border-color: color-mix(in srgb, var(--color-danger) 42%, var(--color-border));
}
""",
    """.sourceError {
  border-color: color-mix(in srgb, var(--color-danger) 42%, var(--color-border));
}

.sourceWarning {
  border-color: color-mix(in srgb, var(--color-warning) 44%, var(--color-border));
}
""",
)

replace_once(
    "app/inicio-overview.module.css",
    """.sourceError .healthDot {
  background: var(--color-danger);
  box-shadow: 0 0 0 0.25rem color-mix(in srgb, var(--color-danger) 12%, transparent);
}
""",
    """.sourceError .healthDot {
  background: var(--color-danger);
  box-shadow: 0 0 0 0.25rem color-mix(in srgb, var(--color-danger) 12%, transparent);
}

.sourceWarning .healthDot {
  background: var(--color-warning);
  box-shadow: 0 0 0 0.25rem color-mix(in srgb, var(--color-warning) 12%, transparent);
}
""",
)

workflow = Path(".github/workflows/inicio-audit-10x10.yml")
workflow_text = workflow.read_text()
marker = "          tests/e2e/inicio-utility.spec.ts\n"
if workflow_text.count(marker) != 1:
    raise SystemExit("Unexpected Inicio audit test marker")
workflow.write_text(workflow_text.replace(marker, marker + "          tests/e2e/inicio-sync-feedback.spec.ts\n", 1))

Path("tests/e2e/inicio-sync-feedback.spec.ts").write_text(r'''import { expect, test, type Page, type Route } from "@playwright/test";

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

const financial = {
  period: {
    dateFrom: "2026-09-01",
    dateTo: "2026-09-11",
    incomeCents: 120000,
    expenseCents: 60000,
    operatingNetCents: 60000,
    savingsCents: 60000,
    savingsRateBps: 5000,
    quality: { suspectedDuplicateRows: 0, signMismatchRows: 0 },
  },
  balances: {
    asOfDate: "2026-09-11",
    activeBalanceCents: 300000,
    accounts: [
      { id: "a", name: "Cuenta principal", type: "checking", lifecycle: "active", balanceCents: 300000, explicitBalanceDate: "2026-09-11" },
    ],
  },
};

const monthly = {
  dateFrom: "2026-08-01",
  dateTo: "2026-09-11",
  rows: [
    { monthStart: "2026-08-01", incomeCents: 120000, expenseCents: 50000, operatingNetCents: 70000 },
    { monthStart: "2026-09-01", incomeCents: 120000, expenseCents: 60000, operatingNetCents: 60000 },
  ],
};

const budgets = {
  month: "2026-09",
  total: { categoryId: null, categoryName: null, effectiveAmountCents: 100000, actualExpenseCents: 60000, remainingCents: 40000, progressBps: 6000, status: "on_track" },
  categories: [],
};

const forecast = {
  summary: { projectedIncomeCents: 0, projectedExpenseCents: 0, projectedNetCents: 0, projectedClosingBalanceCents: 300000, plannedItems: 0 },
  items: [],
};

const transactions = {
  totalCount: 10,
  rows: [
    {
      id: "t1",
      bankDate: "2026-09-11",
      amountCents: -1200,
      account: { id: "a", name: "Cuenta principal" },
      concept: { effective: "Compra" },
      merchant: { effectiveName: "Comercio" },
      category: { effectiveName: "Compras" },
      kind: { effective: "expense" },
      duplicateState: "none",
      excludedFromAnalytics: false,
    },
  ],
};

type SyncMode = "missing-after-sync" | "duplicates-persisted";

async function mockInicio(page: Page, mode: SyncMode) {
  let posts = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/source/google/sync") {
      if (request.method() === "POST") {
        posts += 1;
        await json(route, mode === "missing-after-sync"
          ? { status: "success", rowsInserted: 0, rowsRevised: 0, rowsSkipped: 10, rowsMissing: 1, duplicatesDetected: 0, warningsCount: 1 }
          : { status: "success", rowsInserted: 0, rowsRevised: 0, rowsSkipped: 10, rowsMissing: 0, duplicatesDetected: 2, warningsCount: 0 });
        return;
      }

      const warned = mode === "duplicates-persisted" || posts > 0;
      await json(route, {
        run: {
          id: "run-warning",
          status: "success",
          startedAt: "2026-09-15T09:04:08.000Z",
          finishedAt: "2026-09-15T09:04:08.000Z",
          rowsSeen: 10,
          rowsInserted: 0,
          rowsRevised: 0,
          rowsSkipped: 10,
          rowsFailed: 0,
          duplicatesDetected: warned && mode === "duplicates-persisted" ? 2 : 0,
          warningsCount: warned && mode === "missing-after-sync" ? 1 : 0,
          errorCode: null,
          errorMessage: null,
        },
        cursors: [],
      });
      return;
    }

    if (url.pathname === "/api/dashboard") {
      if (url.searchParams.get("scope") === "primary") {
        await json(route, {
          contractVersion: 1,
          scope: "primary",
          asOfDate: "2026-09-11",
          dataThroughDate: "2026-09-11",
          generatedAt: "2026-09-15T09:04:08.000Z",
          requestedSources: ["financial", "transactions"],
          failedSources: [],
          data: { financial, monthly: null, budgets: null, forecast: null, transactions },
        });
        return;
      }
      await json(route, {
        contractVersion: 1,
        scope: "secondary",
        asOfDate: "2026-09-11",
        dataThroughDate: "2026-09-11",
        generatedAt: "2026-09-15T09:04:08.000Z",
        requestedSources: ["monthly", "budgets", "forecast"],
        failedSources: [],
        data: { financial: null, monthly, budgets, forecast, transactions: null },
      });
      return;
    }

    await route.fallback();
  });
  return () => posts;
}

test("Actualizar datos no llama «sin cambios» a una sincronización con filas desaparecidas", async ({ page }) => {
  const postCount = await mockInicio(page, "missing-after-sync");
  await page.goto("/");

  await page.getByRole("button", { name: "Actualizar datos" }).click();
  await expect.poll(postCount).toBe(1);
  await expect(page.getByText("Sincronización completada con avisos", { exact: true })).toBeVisible();
  await expect(page.getByText(/Sin cambios incorporados\. 1 movimiento importado anteriormente ya no aparece en la fuente\. Revisa la fuente\./i)).toBeVisible();
  await expect(page.getByText("Sin cambios nuevos.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("La última sincronización tiene avisos", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Sincronización completada con avisos", { exact: true })).toBeVisible();
  await expect(page.getByText(/1 aviso de sincronización requiere revisión\. Revisa la fuente\./i)).toBeVisible();
});

test("Inicio conserva tras recarga los posibles duplicados de la última sincronización", async ({ page }) => {
  await mockInicio(page, "duplicates-persisted");
  await page.goto("/");

  await expect(page.getByText("Sincronización completada con avisos", { exact: true })).toBeVisible();
  await expect(page.getByText(/2 posibles duplicados detectados\. Revisa la fuente\./i)).toBeVisible();
  await expect(page.getByText("La última sincronización tiene avisos", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Revisar fuente" })).toBeVisible();
});
''')

Path(".github/workflows/one-shot-inicio-sync-feedback.yml").unlink(missing_ok=True)
Path("scripts/apply-inicio-sync-feedback.py").unlink(missing_ok=True)
