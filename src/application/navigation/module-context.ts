export type AnalysisModuleSelection = {
  month: string;
  dateFrom: string;
  dateTo: string;
  accountId: string | null;
};

export type ForecastModuleSelection = {
  dateFrom: string;
  dateTo: string;
  accountId: string | null;
};

export type ForecastPeriod = ForecastModuleSelection;

export type ModuleContextLink = {
  label: string;
  href: string;
  detail: string;
};

function href(path: string, entries: Array<[string, string | null | undefined]>) {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function analysisModuleLinks(
  selection: AnalysisModuleSelection,
  forecastPeriod: ForecastPeriod | null,
): ModuleContextLink[] {
  const transactionHref = href("/transactions", [
    ["dateFrom", selection.dateFrom],
    ["dateTo", selection.dateTo],
    ["accountId", selection.accountId],
  ]);
  const forecastHref = forecastPeriod
    ? href("/forecast", [
        ["dateFrom", forecastPeriod.dateFrom],
        ["dateTo", forecastPeriod.dateTo],
        ["accountId", forecastPeriod.accountId ?? selection.accountId],
      ])
    : href("/forecast", [["accountId", selection.accountId]]);

  return [
    {
      label: "Cash Flow",
      href: href("/cash-flow", [["month", selection.dateFrom.slice(0, 7)]]),
      detail: "Hechos reales y previsiones del mismo mes",
    },
    {
      label: "Movimientos",
      href: transactionHref,
      detail: "Mismo periodo y cuenta",
    },
    {
      label: "Presupuestos",
      href: "/budgets",
      detail: `Revisar límites de ${selection.month}`,
    },
    {
      label: "Previsión",
      href: forecastHref,
      detail: forecastPeriod ? "Misma cuenta y horizonte previsto" : "Mantiene la cuenta cuando aplica",
    },
    {
      label: "Recurrentes",
      href: "/recurrences",
      detail: "Revisar pagos e ingresos habituales",
    },
  ];
}

export function forecastModuleLinks(selection: ForecastModuleSelection): ModuleContextLink[] {
  return [
    {
      label: "Cash Flow",
      href: href("/cash-flow", [["month", selection.dateFrom.slice(0, 7)]]),
      detail: "Datos reales y previsiones del mes inicial",
    },
    {
      label: "Análisis",
      href: href("/analysis", [["accountId", selection.accountId]]),
      detail: "Mantiene la cuenta y usa el periodo analítico actual",
    },
    {
      label: "Movimientos",
      href: href("/transactions", [["accountId", selection.accountId]]),
      detail: "Movimientos reales de la misma cuenta",
    },
    {
      label: "Presupuestos",
      href: "/budgets",
      detail: "Contrastar previsión con límites mensuales",
    },
    {
      label: "Recurrentes",
      href: "/recurrences",
      detail: "Revisar el origen de las previsiones recurrentes",
    },
  ];
}
