begin;

create temp table phase3_merchant_alias_result (
  test_name text primary key,
  passed boolean not null
) on commit drop;

do $$
declare
  v_category uuid;
  v_archived_category uuid;
  v_merchant uuid;
  v_other uuid;
  v_alias uuid;
  v_failed boolean;
begin
  insert into financial_app.categories(name,kind,icon_key,color_token,lifecycle,sort_order)
  values ('Phase3 merchant category','expense','store','neutral','active',0)
  returning id into v_category;

  insert into financial_app.categories(name,kind,icon_key,color_token,lifecycle,sort_order)
  values ('Phase3 archived category','expense','archive','neutral','archived',1)
  returning id into v_archived_category;

  v_merchant := financial_app.save_merchant(null,'  Café   Bar Sevilla  ',v_category,'active');
  insert into phase3_merchant_alias_result values (
    'canonical-normalization',
    exists(select 1 from financial_app.merchants where id=v_merchant and name='Café Bar Sevilla' and normalized_name='cafe bar sevilla')
  );

  v_alias := financial_app.save_merchant_alias(null,v_merchant,' TPV-123 / Café Bar ');
  insert into phase3_merchant_alias_result values (
    'alias-normalization',
    exists(select 1 from financial_app.merchant_aliases where id=v_alias and alias='TPV-123 / Café Bar' and normalized_alias='tpv 123 cafe bar')
  );

  insert into phase3_merchant_alias_result values (
    'canonical-resolution',
    financial_app.resolve_merchant_id('CAFÉ---BAR SEVILLA') = v_merchant
  );
  insert into phase3_merchant_alias_result values (
    'alias-resolution',
    financial_app.resolve_merchant_id('tpv 123 cafe bar') = v_merchant
  );
  insert into phase3_merchant_alias_result values (
    'default-category',
    financial_app.resolve_merchant_default_category_id(v_merchant) = v_category
  );

  v_other := financial_app.save_merchant(null,'Mercado Norte',null,'active');

  v_failed := false;
  begin
    perform financial_app.save_merchant_alias(null,v_other,'Café Bar Sevilla');
  exception when others then
    v_failed := sqlerrm like '%merchant_alias_conflicts_with_canonical_name%';
  end;
  insert into phase3_merchant_alias_result values ('alias-canonical-collision-blocked',v_failed);

  v_failed := false;
  begin
    perform financial_app.save_merchant(v_other,'TPV 123 Café Bar',null,'active');
  exception when others then
    v_failed := sqlerrm like '%merchant_name_conflicts_with_alias%';
  end;
  insert into phase3_merchant_alias_result values ('canonical-alias-collision-blocked',v_failed);

  v_failed := false;
  begin
    perform financial_app.save_merchant(v_other,'Mercado Norte',v_archived_category,'active');
  exception when others then
    v_failed := sqlerrm like '%invalid_merchant_default_category%';
  end;
  insert into phase3_merchant_alias_result values ('archived-default-category-blocked',v_failed);

  perform financial_app.save_merchant(v_merchant,'Café Bar Sevilla',v_category,'archived');
  insert into phase3_merchant_alias_result values (
    'archived-merchant-not-resolved',
    financial_app.resolve_merchant_id('Café Bar Sevilla') is null
  );
  insert into phase3_merchant_alias_result values (
    'archived-merchant-no-default',
    financial_app.resolve_merchant_default_category_id(v_merchant) is null
  );

  perform financial_app.save_merchant(v_merchant,'Café Bar Sevilla',v_category,'active');
  perform financial_app.save_merchant_alias(v_alias,v_merchant,'TPV 456 Café Bar');
  insert into phase3_merchant_alias_result values (
    'alias-update-resolution',
    financial_app.resolve_merchant_id('TPV-456 Cafe Bar') = v_merchant
  );
  insert into phase3_merchant_alias_result values (
    'alias-delete',
    financial_app.delete_merchant_alias(v_alias)
      and financial_app.resolve_merchant_id('TPV 456 Café Bar') is null
  );
end $$;

do $$
begin
  if exists(select 1 from phase3_merchant_alias_result where not passed) then
    raise exception 'merchant_alias_engine_regression';
  end if;
end $$;

select * from phase3_merchant_alias_result order by test_name;

rollback;
