begin;

insert into financial_app.accounts (
  id,name,institution,type,opening_balance_cents,currency,lifecycle,sort_order,created_at,updated_at
) values
('10000000-0000-4000-8000-000000000091','__fa_mutation_test_account_active_a__',null,'checking',0,'EUR','active',0,now(),now()),
('10000000-0000-4000-8000-000000000092','__fa_mutation_test_account_active_b__',null,'checking',0,'EUR','active',1,now(),now()),
('10000000-0000-4000-8000-000000000093','__fa_mutation_test_account_archived__',null,'checking',0,'EUR','archived',0,now(),now());

do $$
declare
  ordered_ids uuid[];
  invalid_ids uuid[];
  active_position integer;
  archived_position integer;
  swap_id uuid;
begin
  select array_agg(id order by case lifecycle when 'active' then 0 else 1 end, sort_order, name, id)
    into ordered_ids
  from financial_app.accounts;

  perform financial_app.reorder_accounts(ordered_ids);

  active_position := array_position(ordered_ids, '10000000-0000-4000-8000-000000000091'::uuid);
  archived_position := array_position(ordered_ids, '10000000-0000-4000-8000-000000000093'::uuid);
  invalid_ids := ordered_ids;
  swap_id := invalid_ids[active_position];
  invalid_ids[active_position] := invalid_ids[archived_position];
  invalid_ids[archived_position] := swap_id;

  begin
    perform financial_app.reorder_accounts(invalid_ids);
    raise exception 'expected_account_reorder_rejection';
  exception when others then
    if sqlerrm = 'expected_account_reorder_rejection' then raise; end if;
    if sqlerrm <> 'account_reorder_group_mismatch' then raise; end if;
  end;
end $$;

insert into financial_app.categories (
  id,name,kind,parent_category_id,icon_key,color_token,lifecycle,sort_order,created_at,updated_at
) values
('20000000-0000-4000-8000-000000000091','__fa_mutation_test_expense_a__','expense',null,'wallet','category.blue','active',0,now(),now()),
('20000000-0000-4000-8000-000000000092','__fa_mutation_test_expense_b__','expense',null,'wallet','category.blue','active',1,now(),now()),
('20000000-0000-4000-8000-000000000093','__fa_mutation_test_income__','income',null,'wallet','category.green','active',0,now(),now()),
('20000000-0000-4000-8000-000000000094','__fa_mutation_test_archived_target__','expense',null,'wallet','category.gray','archived',2,now(),now()),
('20000000-0000-4000-8000-000000000095','__fa_mutation_test_merge_source__','expense',null,'wallet','category.blue','active',3,now(),now()),
('20000000-0000-4000-8000-000000000096','__fa_mutation_test_merge_target__','expense',null,'wallet','category.blue','active',4,now(),now());

do $$
declare
  ordered_ids uuid[];
  invalid_ids uuid[];
  expense_position integer;
  income_position integer;
  swap_id uuid;
begin
  select array_agg(id order by kind, parent_category_id nulls first, sort_order, name, id)
    into ordered_ids
  from financial_app.categories;

  perform financial_app.reorder_categories(ordered_ids);

  expense_position := array_position(ordered_ids, '20000000-0000-4000-8000-000000000091'::uuid);
  income_position := array_position(ordered_ids, '20000000-0000-4000-8000-000000000093'::uuid);
  invalid_ids := ordered_ids;
  swap_id := invalid_ids[expense_position];
  invalid_ids[expense_position] := invalid_ids[income_position];
  invalid_ids[income_position] := swap_id;

  begin
    perform financial_app.reorder_categories(invalid_ids);
    raise exception 'expected_category_reorder_rejection';
  exception when others then
    if sqlerrm = 'expected_category_reorder_rejection' then raise; end if;
    if sqlerrm <> 'category_reorder_group_mismatch' then raise; end if;
  end;

  begin
    perform financial_app.merge_categories(
      '20000000-0000-4000-8000-000000000091'::uuid,
      '20000000-0000-4000-8000-000000000094'::uuid
    );
    raise exception 'expected_archived_target_rejection';
  exception when others then
    if sqlerrm = 'expected_archived_target_rejection' then raise; end if;
    if sqlerrm <> 'target_category_archived' then raise; end if;
  end;
end $$;

select financial_app.merge_categories(
  '20000000-0000-4000-8000-000000000095'::uuid,
  '20000000-0000-4000-8000-000000000096'::uuid
);

do $$
declare
  source_lifecycle text;
  target_lifecycle text;
begin
  select lifecycle into source_lifecycle
  from financial_app.categories
  where id = '20000000-0000-4000-8000-000000000095'::uuid;

  select lifecycle into target_lifecycle
  from financial_app.categories
  where id = '20000000-0000-4000-8000-000000000096'::uuid;

  if source_lifecycle <> 'archived' or target_lifecycle <> 'active' then
    raise exception 'merge_lifecycle_assertion_failed';
  end if;
end $$;

rollback;
