-- Financial App 1.6.0 · índice de cobertura para reglas vinculadas a cuenta
create index if not exists transaction_rules_match_account_id_idx
on financial_app.transaction_rules(match_account_id)
where match_account_id is not null;
