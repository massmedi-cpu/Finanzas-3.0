import { recurrencesHrefForForecast } from "../forecast/recurrence-flow";

export type AnalysisModuleSelection = {
  month: string;
  dateFrom: string;
  dateTo: string;
  previousDateFrom?: string;
  previousDateTo?: string;
  accountId: string | null;
};

export type ComparisonModuleSelection = {
  primaryFrom: string;
  primaryTo: string;
  referenceFrom: string;
  referenceTo: string;
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
  const comparisonHref = href("/compare", [
    ["primaryFrom", selection.dateFrom],
    ["primaryTo", selection.dateTo],
    ["referenceFrom", selection.previousDateFrom],
    ["referenceTo", selection.previousDateTo],
    ["accountId", selection.accountId],
  ]);

  return [
    {
      label: "Comparador",
      href: comparisonHref,
      detail: selection.previousDateFrom && selection.previousDateTo
        ? "Periodo actual frente a su referencia"
        : "Contrastar dos periodos personalizados",
    },
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

export function comparisonModuleLinks(selection: ComparisonModuleSelection): ModuleContextLink[] {
  return [
    {
      label: "Análisis",
      href: href("/analysis", [["accountId", selection.accountId]]),
      detail: "Volver a tendencias y evolución mensual",
    },
    {
      label: "Movimientos · principal",
      href: href("/transactions", [
        ["dateFrom", selection.primaryFrom],
        ["dateTo", selection.primaryTo],
        ["accountId", selection.accountId],
      ]),
      detail: "Auditar el periodo principal",
    },
    {
      label: "Movimientos · referencia",
      href: href("/transactions", [
        ["dateFrom", selection.referenceFrom],
        ["dateTo", selection.referenceTo],
        ["accountId", selection.accountId],
      ]),
      detail: "Auditar el periodo de referencia",
    },
    {
      label: "Cash Flow",
      href: href("/cash-flow", [["month", selection.primaryFrom.slice(0, 7)]]),
      detail: "Ver hechos y previsiones del mes principal",
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
      href: recurrencesHrefForForecast(selection),
      detail: "Revisar patrones y volver al mismo horizonte",
    },
  ];
}
