begin;

create or replace function financial_app.autocategorize_transaction_after_source_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.concept_normalized is distinct from old.concept_normalized
     or new.kind is distinct from old.kind
     or new.amount_cents is distinct from old.amount_cents
     or new.account_id is distinct from old.account_id
     or new.merchant_id is distinct from old.merchant_id then
    perform financial_app.apply_categorization_rule(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_autocategorize_after_source_change on financial_app.transactions;
create trigger transactions_autocategorize_after_source_change
after insert or update of concept_normalized,kind,amount_cents,account_id,merchant_id
on financial_app.transactions
for each row execute function financial_app.autocategorize_transaction_after_source_change();

commit;
