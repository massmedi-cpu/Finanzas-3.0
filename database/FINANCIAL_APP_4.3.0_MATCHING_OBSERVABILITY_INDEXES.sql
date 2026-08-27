-- Financial App 4.3.0 — índices de soporte para observabilidad temporal.
-- Evitan full scans al comparar ventanas recientes/históricas; no cambian datos ni reglas de matching.
create index if not exists reconciliation_decisions_created_idx
  on financial_app.reconciliation_decisions(created_at desc);
create index if not exists reconciliation_pairs_created_idx
  on financial_app.reconciliation_pairs(created_at desc);
create index if not exists reconciliation_pairs_cancelled_idx
  on financial_app.reconciliation_pairs(cancelled_at desc)
  where cancelled_at is not null;
