export const NET_WORTH_SCOPE_DECISION = {
  initiative: "PRE-019",
  reviewedOn: "2026-09-11",
  productScope: "private_single_user",
  status: "out_of_scope_current_release",
  decision: "do_not_implement",
  rationale:
    "Financial App currently has traceable account balances, but it does not model a complete set of assets, liabilities, valuations, valuation dates or historical net-worth snapshots. Summing account balances must not be presented as net worth.",
  currentFinancialMeaning: {
    aggregateAccountBalance: "liquidity_and_account_balance_view",
    netWorth: "not_available",
  },
  prohibitedShortcuts: [
    "label_aggregate_account_balance_as_net_worth",
    "infer_assets_or_liabilities_from_account_type_only",
    "publish_net_worth_without_valuation_source_and_date",
  ],
  reconsiderOnlyWhen: [
    "product_scope_requires_net_worth",
    "explicit_asset_and_liability_model_exists",
    "valuation_source_and_date_are_traceable",
    "historical_net_worth_snapshots_are_defined",
    "account_inclusion_and_exclusion_semantics_are_defined",
  ],
} as const;

export type NetWorthScopeDecision = typeof NET_WORTH_SCOPE_DECISION;
