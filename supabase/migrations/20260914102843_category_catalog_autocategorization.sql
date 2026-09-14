begin;

alter table financial_app.categories
  add column if not exists system_key text;

alter table financial_app.transactions
  add column if not exists category_origin text;

create unique index if not exists categories_workspace_system_key_unique
  on financial_app.categories(workspace_id, system_key)
  where system_key is not null;

alter table financial_app.categories
  add constraint categories_system_key_format check (
    system_key is null or system_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
  );

alter table financial_app.transactions
  add constraint transactions_category_origin_check check (
    category_origin is null or category_origin in ('builtin','rule','merchant')
  );

alter table financial_app.categories
  add constraint categories_icon_key_allowed check (
    icon_key = any(array[
      'wallet','home','building','cart','utensils','coffee','car','fuel','bus','train','parking','wrench',
      'heart','pill','stethoscope','dumbbell','sparkles','film','gamepad','music','ticket','trophy','bag','shirt',
      'laptop','gift','receipt','phone','wifi','cloud','bolt','droplet','flame','shield','plane','briefcase','landmark',
      'banknote','piggy-bank','book','paw','scissors','coins','arrows','more'
    ]::text[])
  );

alter table financial_app.categories
  add constraint categories_color_token_allowed check (
    color_token = any(array[
      'category.blue','category.cyan','category.green','category.amber','category.violet','category.rose',
      'category.indigo','category.teal','category.emerald','category.lime','category.yellow','category.orange',
      'category.red','category.pink','category.fuchsia','category.purple','category.sky','category.slate'
    ]::text[])
  );

create or replace function financial_app.validate_category_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_kind text;
  parent_lifecycle text;
  parent_parent_id uuid;
  cycle_found boolean;
begin
  if new.lifecycle = 'archived' and exists (
    select 1 from financial_app.categories child
    where child.parent_category_id = new.id and child.lifecycle = 'active'
  ) then
    raise exception 'active child category requires an active parent';
  end if;

  if exists (
    select 1 from financial_app.categories child
    where child.parent_category_id = new.id and child.kind <> new.kind
  ) then
    raise exception 'category kind must match existing children';
  end if;

  if new.parent_category_id is null then return new; end if;
  if new.parent_category_id = new.id then raise exception 'category cannot be its own parent'; end if;

  select kind,lifecycle,parent_category_id
    into parent_kind,parent_lifecycle,parent_parent_id
  from financial_app.categories
  where id = new.parent_category_id;

  if parent_kind is null then raise exception 'parent category does not exist'; end if;
  if new.lifecycle = 'active' and parent_lifecycle <> 'active' then raise exception 'active category requires an active parent'; end if;
  if parent_kind <> new.kind then raise exception 'parent category must have the same kind'; end if;
  if parent_parent_id is not null then raise exception 'category hierarchy supports one subcategory level'; end if;

  with recursive ancestors as (
    select c.id,c.parent_category_id from financial_app.categories c where c.id = new.parent_category_id
    union all
    select c.id,c.parent_category_id from financial_app.categories c join ancestors a on c.id = a.parent_category_id
  )
  select exists(select 1 from ancestors where id = new.id) into cycle_found;
  if cycle_found then raise exception 'category hierarchy cannot contain cycles'; end if;
  return new;
end;
$$;

create or replace function financial_app.validate_category_archive_dependencies()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.lifecycle = 'active' and new.lifecycle = 'archived' then
    if exists (
      select 1 from financial_app.categorization_rules
      where status='active' and (category_id=new.id or target_category_id=new.id)
    ) then raise exception 'category_has_active_rules'; end if;

    if exists (
      select 1 from financial_app.merchants
      where lifecycle='active' and default_category_id=new.id
    ) then raise exception 'category_has_active_merchants'; end if;

    if exists (
      select 1 from financial_app.recurrences
      where status='active' and category_id=new.id
    ) then raise exception 'category_has_active_recurrences'; end if;

    if exists (
      select 1 from financial_app.forecast_items
      where excluded=false and confirmed_transaction_id is null and date>=current_date and category_id=new.id
    ) then raise exception 'category_has_future_forecasts'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists categories_validate_archive_dependencies on financial_app.categories;
create trigger categories_validate_archive_dependencies
before update of lifecycle on financial_app.categories
for each row execute function financial_app.validate_category_archive_dependencies();

create or replace function financial_app.ensure_default_category_catalog(p_workspace_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_rows integer := 0;
begin
  if p_workspace_id is null or not exists(select 1 from financial_app.workspaces where id=p_workspace_id) then
    raise exception 'workspace_not_found';
  end if;

  insert into financial_app.categories(workspace_id,system_key,name,kind,parent_category_id,icon_key,color_token,lifecycle,sort_order)
  select p_workspace_id,v.system_key,v.name,v.kind,null,v.icon_key,v.color_token,'active',v.sort_order
  from (values
    ('expense.housing','Vivienda','expense','home','category.indigo',0),
    ('expense.food','Alimentación','expense','cart','category.emerald',1),
    ('expense.transport','Transporte','expense','car','category.sky',2),
    ('expense.health','Salud y bienestar','expense','heart','category.rose',3),
    ('expense.leisure','Ocio y cultura','expense','sparkles','category.violet',4),
    ('expense.shopping','Compras','expense','bag','category.amber',5),
    ('expense.services','Servicios y suscripciones','expense','receipt','category.cyan',6),
    ('expense.travel','Viajes','expense','plane','category.teal',7),
    ('expense.admin','Administración e impuestos','expense','landmark','category.slate',8),
    ('expense.personal','Cuidado personal','expense','scissors','category.pink',9),
    ('expense.pets','Mascotas','expense','paw','category.lime',10),
    ('expense.education','Educación','expense','book','category.blue',11),
    ('expense.cash','Efectivo y retiradas','expense','coins','category.orange',12),
    ('expense.other','Otros gastos','expense','more','category.slate',13),
    ('income.salary','Nómina','income','briefcase','category.green',0),
    ('income.benefits','Prestaciones y ayudas','income','landmark','category.cyan',1),
    ('income.refund','Devoluciones y reembolsos','income','receipt','category.teal',2),
    ('income.interest','Intereses y bonificaciones','income','piggy-bank','category.emerald',3),
    ('income.prize','Premios','income','trophy','category.amber',4),
    ('income.other','Otros ingresos','income','banknote','category.blue',5),
    ('transfer.internal','Entre cuentas','transfer','arrows','category.blue',0),
    ('transfer.prepaid','Tarjeta prepago','transfer','wallet','category.violet',1),
    ('transfer.investment','Ahorro e inversión','transfer','piggy-bank','category.green',2),
    ('transfer.person','Bizum y pagos entre particulares','transfer','banknote','category.cyan',3)
  ) as v(system_key,name,kind,icon_key,color_token,sort_order)
  on conflict (workspace_id,system_key) where system_key is not null do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into financial_app.categories(workspace_id,system_key,name,kind,parent_category_id,icon_key,color_token,lifecycle,sort_order)
  select p_workspace_id,v.system_key,v.name,v.kind,p.id,v.icon_key,v.color_token,'active',v.sort_order
  from (values
    ('expense.housing.rent','Alquiler e hipoteca','expense','expense.housing','home','category.indigo',0),
    ('expense.housing.community','Comunidad','expense','expense.housing','building','category.indigo',1),
    ('expense.housing.energy','Luz y gas','expense','expense.housing','bolt','category.amber',2),
    ('expense.housing.water','Agua','expense','expense.housing','droplet','category.cyan',3),
    ('expense.housing.telecom','Internet y móvil','expense','expense.housing','wifi','category.sky',4),
    ('expense.housing.insurance','Seguro del hogar','expense','expense.housing','shield','category.blue',5),
    ('expense.food.supermarket','Supermercado','expense','expense.food','cart','category.emerald',0),
    ('expense.food.restaurant','Restaurantes','expense','expense.food','utensils','category.orange',1),
    ('expense.food.cafe','Bares y cafeterías','expense','expense.food','coffee','category.amber',2),
    ('expense.food.vending','Vending','expense','expense.food','coffee','category.yellow',3),
    ('expense.transport.fuel','Combustible','expense','expense.transport','fuel','category.orange',0),
    ('expense.transport.taxi','Taxi y VTC','expense','expense.transport','car','category.sky',1),
    ('expense.transport.public','Transporte público','expense','expense.transport','bus','category.cyan',2),
    ('expense.transport.parking','Aparcamiento y peajes','expense','expense.transport','parking','category.slate',3),
    ('expense.transport.maintenance','Mantenimiento del vehículo','expense','expense.transport','wrench','category.blue',4),
    ('expense.health.pharmacy','Farmacia','expense','expense.health','pill','category.green',0),
    ('expense.health.medical','Médico y dentista','expense','expense.health','stethoscope','category.rose',1),
    ('expense.health.sport','Deporte y gimnasio','expense','expense.health','dumbbell','category.teal',2),
    ('expense.leisure.streaming','Streaming','expense','expense.leisure','film','category.violet',0),
    ('expense.leisure.gaming','Videojuegos','expense','expense.leisure','gamepad','category.purple',1),
    ('expense.leisure.cinema','Cine y espectáculos','expense','expense.leisure','ticket','category.fuchsia',2),
    ('expense.leisure.music','Música','expense','expense.leisure','music','category.pink',3),
    ('expense.leisure.lottery','Loterías y apuestas','expense','expense.leisure','trophy','category.amber',4),
    ('expense.shopping.clothing','Ropa y calzado','expense','expense.shopping','shirt','category.pink',0),
    ('expense.shopping.technology','Tecnología','expense','expense.shopping','laptop','category.blue',1),
    ('expense.shopping.home','Hogar y decoración','expense','expense.shopping','home','category.orange',2),
    ('expense.shopping.gifts','Regalos','expense','expense.shopping','gift','category.rose',3),
    ('expense.services.software','Software y nube','expense','expense.services','cloud','category.cyan',0),
    ('expense.services.subscriptions','Suscripciones digitales','expense','expense.services','receipt','category.violet',1),
    ('expense.services.banking','Comisiones bancarias','expense','expense.services','landmark','category.slate',2),
    ('expense.travel.accommodation','Alojamiento','expense','expense.travel','home','category.teal',0),
    ('expense.travel.transport','Billetes y transporte','expense','expense.travel','plane','category.sky',1),
    ('expense.travel.other','Otros gastos de viaje','expense','expense.travel','plane','category.cyan',2),
    ('expense.admin.tax','Impuestos','expense','expense.admin','landmark','category.red',0),
    ('expense.admin.fees','Tasas y multas','expense','expense.admin','receipt','category.orange',1),
    ('expense.personal.beauty','Peluquería y estética','expense','expense.personal','scissors','category.pink',0)
  ) as v(system_key,name,kind,parent_key,icon_key,color_token,sort_order)
  join financial_app.categories p
    on p.workspace_id=p_workspace_id and p.system_key=v.parent_key
  on conflict (workspace_id,system_key) where system_key is not null do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;
  return v_count;
end;
$$;

revoke all on function financial_app.ensure_default_category_catalog(uuid) from public,anon,authenticated;

create or replace function financial_app.resolve_builtin_category_id(
  p_workspace_id uuid,
  p_concept text,
  p_kind text,
  p_amount_cents bigint
)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_concept text := financial_app.normalize_merchant_label(coalesce(p_concept,''));
  v_key text;
  v_id uuid;
begin
  if p_kind = 'transfer' then
    if v_concept ~ '(tarjeta prepago|recarga prepago|carga tarjeta prep|descarga tarjeta prep)' then v_key := 'transfer.prepaid';
    elsif v_concept ~ '(invertimos por ti|inversion|fondo de inversion|broker|ahorro)' then v_key := 'transfer.investment';
    elsif v_concept ~ '(^| )bizum( |$)' then v_key := 'transfer.person';
    else v_key := 'transfer.internal'; end if;
  elsif p_kind in ('income','refund') or (p_kind='adjustment' and coalesce(p_amount_cents,0) >= 0) then
    if v_concept ~ '(nomina|abenewco|codesa|cox infra|cox corporate|ca infra corporativo)' then v_key := 'income.salary';
    elsif v_concept ~ '(sepe|inem|prestacion|subsidio|pension|ayuda)' then v_key := 'income.benefits';
    elsif v_concept ~ '(devolucion|reembolso|refund|retrocesion)' then v_key := 'income.refund';
    elsif v_concept ~ '(interes|bonificacion|cashback|liquidacion cuenta)' then v_key := 'income.interest';
    elsif v_concept ~ '(premio|loteria|liquidacion dineraria de premios)' then v_key := 'income.prize';
    else v_key := 'income.other'; end if;
  else
    if v_concept ~ '(alquiler|hipoteca)' then v_key := 'expense.housing.rent';
    elsif v_concept ~ '(comunidad propietarios|comunidad plaza|comunidad bloque|comuni dad blq|cuota comunidad)' then v_key := 'expense.housing.community';
    elsif v_concept ~ '(energia xxi|endesa|iberdrola|naturgy|electricidad|factura luz|gas natural)' then v_key := 'expense.housing.energy';
    elsif v_concept ~ '(emasesa|suministro agua|factura agua)' then v_key := 'expense.housing.water';
    elsif v_concept ~ '(vodafone|movistar|orange|digi|jazztel|pepephone|telefonica|(^| )o2( |$))' then v_key := 'expense.housing.telecom';
    elsif v_concept ~ '(seguro hogar|hogar seguro)' then v_key := 'expense.housing.insurance';
    elsif v_concept ~ '(mercadona|carrefour|lidl|aldi|supermercado|hipercor|dia market|coviran|mas supermercado|alcampo)' then v_key := 'expense.food.supermarket';
    elsif v_concept ~ '(mcdonald|burger king|telepizza|dominos|glovo|uber eats|just eat|restaurante)' then v_key := 'expense.food.restaurant';
    elsif v_concept ~ '(bar terraza|(^| )(bar|cafe|cafeteria)( |$)|starbucks)' then v_key := 'expense.food.cafe';
    elsif v_concept ~ '(easyvending|vending)' then v_key := 'expense.food.vending';
    elsif v_concept ~ '(repsol|moeve|cepsa|gasolinera|gasoleo|combustible|(^| )bp( |$)|shell)' then v_key := 'expense.transport.fuel';
    elsif v_concept ~ '(uber trip|cabify|taxi|bolt ride)' then v_key := 'expense.transport.taxi';
    elsif v_concept ~ '(tussam|consorcio transporte|metro sevilla|renfe cercanias|autobus urbano)' then v_key := 'expense.transport.public';
    elsif v_concept ~ '(parking|aparcamiento|telpark|empark|peaje)' then v_key := 'expense.transport.parking';
    elsif v_concept ~ '(taller|norauto|feu vert|itv|neumatic|mantenimiento vehiculo)' then v_key := 'expense.transport.maintenance';
    elsif v_concept ~ '(farmacia|parafarmacia)' then v_key := 'expense.health.pharmacy';
    elsif v_concept ~ '(clinica|hospital|dentista|dental|medico|optica|fisioterapia)' then v_key := 'expense.health.medical';
    elsif v_concept ~ '(gimnasio|basic fit|fitness|gym)' then v_key := 'expense.health.sport';
    elsif v_concept ~ '(netflix|disney|hbo|prime video|filmin|skyshowtime|movistar plus)' then v_key := 'expense.leisure.streaming';
    elsif v_concept ~ '(playstation|nintendo|xbox|steam|epic games)' then v_key := 'expense.leisure.gaming';
    elsif v_concept ~ '(cine|teatro|ticketmaster|entradas)' then v_key := 'expense.leisure.cinema';
    elsif v_concept ~ '(spotify|apple music|youtube music)' then v_key := 'expense.leisure.music';
    elsif v_concept ~ '(loterias|apuestas|once|euromillones|primitiva)' then v_key := 'expense.leisure.lottery';
    elsif v_concept ~ '(zara|primark|mango|bershka|pull bear|stradivarius|lefties|hm |h m |sprinter)' then v_key := 'expense.shopping.clothing';
    elsif v_concept ~ '(mediamarkt|pccomponentes|apple com|samsung|fnac|electronica)' then v_key := 'expense.shopping.technology';
    elsif v_concept ~ '(ikea|leroy merlin|conforama|bricomart|obrama)' then v_key := 'expense.shopping.home';
    elsif v_concept ~ '(regalo|floristeria)' then v_key := 'expense.shopping.gifts';
    elsif v_concept ~ '(adobe|openai|chatgpt|google one|icloud|dropbox|microsoft 365|onedrive|vercel)' then v_key := 'expense.services.software';
    elsif v_concept ~ '(suscripcion|membership|patreon)' then v_key := 'expense.services.subscriptions';
    elsif v_concept ~ '(comision|mantenimiento cuenta|gastos bancarios)' then v_key := 'expense.services.banking';
    elsif v_concept ~ '(booking|airbnb|hotel|hostal|apartamento turistico)' then v_key := 'expense.travel.accommodation';
    elsif v_concept ~ '(vueling|iberia|ryanair|easyjet|iryo|ouigo|renfe ave)' then v_key := 'expense.travel.transport';
    elsif v_concept ~ '(hacienda|aeat|impuesto|ibi|irpf)' then v_key := 'expense.admin.tax';
    elsif v_concept ~ '(multa|sancion|(^| )tasa( |$)|dgt)' then v_key := 'expense.admin.fees';
    elsif v_concept ~ '(peluquer|barber|estetica|manicura)' then v_key := 'expense.personal.beauty';
    elsif v_concept ~ '(veterin|tiendanimal|kiwoko|mascota)' then v_key := 'expense.pets';
    elsif v_concept ~ '(academia|universidad|curso|udemy|domestika|formacion)' then v_key := 'expense.education';
    elsif v_concept ~ '(cajero|reintegro|retirada efectivo)' then v_key := 'expense.cash';
    elsif v_concept ~ '(amazon|el corte ingles)' then v_key := 'expense.shopping';
    else v_key := 'expense.other'; end if;
  end if;

  select id into v_id
  from financial_app.categories
  where workspace_id=p_workspace_id and system_key=v_key and lifecycle='active'
  limit 1;
  return v_id;
end;
$$;

create or replace function financial_app.evaluate_categorization_rule(p_transaction_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_context record;
  v_rule financial_app.categorization_rules%rowtype;
  v_concept text;
  v_normalized_concept text;
  v_merchant_locked boolean;
  v_category_locked boolean;
  v_effective_merchant uuid;
  v_effective_category uuid;
  v_baseline_merchant uuid;
  v_baseline_category uuid;
  v_merchant_default_category uuid;
  v_builtin_category uuid;
  v_resolved_merchant uuid;
  v_resolved_category uuid;
  v_resolution_source text;
begin
  select
    t.id,t.workspace_id,t.account_id,t.concept_normalized,t.merchant_id,t.category_id,t.category_origin,t.kind,t.amount_cents,
    o.concept_override,o.merchant_id_override,o.merchant_override_set,o.category_id_override,o.category_override_set
  into v_context
  from financial_app.transactions t
  left join financial_app.transaction_overrides o on o.transaction_id=t.id
  where t.id=p_transaction_id;
  if not found then raise exception 'transaction_not_found'; end if;

  v_concept := coalesce(v_context.concept_override,v_context.concept_normalized);
  v_normalized_concept := financial_app.normalize_merchant_label(v_concept);
  v_merchant_locked := coalesce(v_context.merchant_override_set,false) or v_context.merchant_id_override is not null;
  v_category_locked := coalesce(v_context.category_override_set,false) or v_context.category_id_override is not null;

  v_effective_merchant := case
    when coalesce(v_context.merchant_override_set,false) then v_context.merchant_id_override
    when v_context.merchant_id_override is not null then v_context.merchant_id_override
    else v_context.merchant_id
  end;

  v_effective_category := case
    when coalesce(v_context.category_override_set,false) then v_context.category_id_override
    when v_context.category_id_override is not null then v_context.category_id_override
    when v_context.category_origin in ('builtin','rule','merchant') then null
    else v_context.category_id
  end;

  v_baseline_merchant := case
    when v_merchant_locked then v_effective_merchant
    else coalesce(v_effective_merchant,financial_app.resolve_merchant_id(v_concept))
  end;
  v_merchant_default_category := financial_app.resolve_merchant_default_category_id(v_baseline_merchant);
  v_builtin_category := financial_app.resolve_builtin_category_id(v_context.workspace_id,v_concept,v_context.kind,v_context.amount_cents);
  v_baseline_category := case
    when v_category_locked then v_effective_category
    else coalesce(v_effective_category,v_merchant_default_category,v_builtin_category)
  end;

  select r.* into v_rule
  from financial_app.categorization_rules r
  where r.status='active'
    and (r.concept_contains is null or pg_catalog.strpos(v_normalized_concept,financial_app.normalize_merchant_label(r.concept_contains)) > 0)
    and (r.account_id is null or r.account_id=v_context.account_id)
    and (r.merchant_id is null or r.merchant_id=v_baseline_merchant)
    and (r.category_id is null or r.category_id=v_baseline_category)
    and (r.minimum_amount_cents is null or v_context.amount_cents >= r.minimum_amount_cents)
    and (r.maximum_amount_cents is null or v_context.amount_cents <= r.maximum_amount_cents)
  order by r.priority asc,r.id asc
  limit 1;

  v_resolved_merchant := v_baseline_merchant;
  if v_rule.id is not null and v_rule.target_merchant_id is not null and not v_merchant_locked then
    v_resolved_merchant := v_rule.target_merchant_id;
  end if;

  if v_category_locked then
    v_resolved_category := v_effective_category;
    v_resolution_source := 'manual';
  elsif v_rule.id is not null and v_rule.target_category_id is not null then
    v_resolved_category := v_rule.target_category_id;
    v_resolution_source := 'rule';
  elsif financial_app.resolve_merchant_default_category_id(v_resolved_merchant) is not null then
    v_resolved_category := financial_app.resolve_merchant_default_category_id(v_resolved_merchant);
    v_resolution_source := 'merchant';
  elsif v_effective_category is not null then
    v_resolved_category := v_effective_category;
    v_resolution_source := 'existing';
  else
    v_resolved_category := v_builtin_category;
    v_resolution_source := case when v_builtin_category is null then null else 'builtin' end;
  end if;

  return jsonb_build_object(
    'transactionId',v_context.id,'concept',v_concept,'normalizedConcept',v_normalized_concept,
    'amountCents',v_context.amount_cents,'accountId',v_context.account_id,
    'baselineMerchantId',v_baseline_merchant,'baselineCategoryId',v_baseline_category,
    'resolvedMerchantId',v_resolved_merchant,'resolvedCategoryId',v_resolved_category,
    'categoryResolutionSource',v_resolution_source,'merchantLocked',v_merchant_locked,'categoryLocked',v_category_locked,
    'selectedRuleId',v_rule.id,'selectedRuleName',v_rule.name,'selectedRulePriority',v_rule.priority,
    'matchedCriteria',case when v_rule.id is null then null else jsonb_strip_nulls(jsonb_build_object(
      'conceptContains',v_rule.concept_contains,'accountId',v_rule.account_id,'merchantId',v_rule.merchant_id,
      'categoryId',v_rule.category_id,'minimumAmountCents',v_rule.minimum_amount_cents,'maximumAmountCents',v_rule.maximum_amount_cents
    )) end,
    'merchantChanged',not v_merchant_locked and v_context.merchant_id is distinct from v_resolved_merchant,
    'categoryChanged',not v_category_locked and v_context.category_id is distinct from v_resolved_category
  );
end;
$$;

create or replace function financial_app.apply_categorization_rule(p_transaction_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_eval jsonb;
  v_current_merchant uuid;
  v_current_category uuid;
  v_current_origin text;
  v_new_merchant uuid;
  v_new_category uuid;
  v_new_origin text;
  v_merchant_locked boolean;
  v_category_locked boolean;
  v_merchant_changed boolean;
  v_category_changed boolean;
begin
  v_eval := financial_app.evaluate_categorization_rule(p_transaction_id);
  select merchant_id,category_id,category_origin
    into v_current_merchant,v_current_category,v_current_origin
  from financial_app.transactions where id=p_transaction_id for update;
  if not found then raise exception 'transaction_not_found'; end if;

  v_merchant_locked := coalesce((v_eval->>'merchantLocked')::boolean,false);
  v_category_locked := coalesce((v_eval->>'categoryLocked')::boolean,false);
  v_new_merchant := (v_eval->>'resolvedMerchantId')::uuid;
  v_new_category := (v_eval->>'resolvedCategoryId')::uuid;
  v_new_origin := case v_eval->>'categoryResolutionSource'
    when 'rule' then 'rule'
    when 'merchant' then 'merchant'
    when 'builtin' then 'builtin'
    else null
  end;
  v_merchant_changed := not v_merchant_locked and v_current_merchant is distinct from v_new_merchant;
  v_category_changed := not v_category_locked and v_current_category is distinct from v_new_category;

  if v_merchant_changed or v_category_changed or (not v_category_locked and v_current_origin is distinct from v_new_origin) then
    update financial_app.transactions
    set merchant_id=case when v_merchant_changed then v_new_merchant else merchant_id end,
        category_id=case when not v_category_locked then v_new_category else category_id end,
        category_origin=case when not v_category_locked then v_new_origin else category_origin end,
        updated_at=now()
    where id=p_transaction_id;
  end if;

  if v_merchant_changed then
    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value)
    values ('transaction',p_transaction_id,'merchant_id',to_jsonb(v_current_merchant),to_jsonb(v_new_merchant));
  end if;
  if v_category_changed then
    insert into financial_app.audit_changes(entity_type,entity_id,field_name,original_value,new_value)
    values ('transaction',p_transaction_id,'category_id',to_jsonb(v_current_category),to_jsonb(v_new_category));
  end if;

  return v_eval || jsonb_build_object('applied',true,'merchantChanged',v_merchant_changed,'categoryChanged',v_category_changed);
end;
$$;

create or replace function financial_app.apply_categorization_rules_for_transactions(p_transaction_ids uuid[])
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_result jsonb;
  v_evaluated integer := 0;
  v_category_changed integer := 0;
  v_merchant_changed integer := 0;
begin
  if p_transaction_ids is null or cardinality(p_transaction_ids) > 10000 then raise exception 'invalid_transaction_id_batch'; end if;
  for v_id in select distinct id from unnest(p_transaction_ids) as t(id) loop
    v_result := financial_app.apply_categorization_rule(v_id);
    v_evaluated := v_evaluated + 1;
    if coalesce((v_result->>'categoryChanged')::boolean,false) then v_category_changed := v_category_changed + 1; end if;
    if coalesce((v_result->>'merchantChanged')::boolean,false) then v_merchant_changed := v_merchant_changed + 1; end if;
  end loop;
  return jsonb_build_object('evaluated',v_evaluated,'categoryChanged',v_category_changed,'merchantChanged',v_merchant_changed);
end;
$$;

create or replace function financial_app.merge_categories(p_source_category_id uuid,p_target_category_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_source_kind text;
  v_target_kind text;
  v_target_lifecycle text;
begin
  if p_source_category_id = p_target_category_id then raise exception 'same_category'; end if;

  lock table financial_app.categories in share row exclusive mode;
  lock table financial_app.merchants in share row exclusive mode;
  lock table financial_app.transactions in share row exclusive mode;
  lock table financial_app.transaction_overrides in share row exclusive mode;
  lock table financial_app.categorization_rules in share row exclusive mode;
  lock table financial_app.recurrences in share row exclusive mode;
  lock table financial_app.budgets in share row exclusive mode;
  lock table financial_app.forecast_items in share row exclusive mode;

  select kind into v_source_kind from financial_app.categories where id=p_source_category_id;
  select kind,lifecycle into v_target_kind,v_target_lifecycle from financial_app.categories where id=p_target_category_id;
  if v_source_kind is null or v_target_kind is null then raise exception 'category_not_found'; end if;
  if v_source_kind <> v_target_kind then raise exception 'category_kind_mismatch'; end if;
  if v_target_lifecycle <> 'active' then raise exception 'target_category_archived'; end if;

  if exists (
    with recursive descendants as (
      select id from financial_app.categories where parent_category_id=p_source_category_id
      union all
      select c.id from financial_app.categories c join descendants d on c.parent_category_id=d.id
    ) select 1 from descendants where id=p_target_category_id
  ) then raise exception 'target_is_descendant'; end if;

  if exists (
    select 1 from financial_app.categories sc
    join financial_app.categories tc on tc.parent_category_id=p_target_category_id
      and tc.kind=sc.kind and financial_app.normalize_label(tc.name)=financial_app.normalize_label(sc.name)
    where sc.parent_category_id=p_source_category_id and sc.id<>tc.id
  ) then raise exception 'child_category_collision'; end if;

  if exists (
    select 1 from financial_app.budgets sb
    join financial_app.budgets tb on tb.month=sb.month and tb.category_id=p_target_category_id
    where sb.category_id=p_source_category_id
  ) then raise exception 'budget_collision'; end if;

  update financial_app.categories set parent_category_id=p_target_category_id,updated_at=now() where parent_category_id=p_source_category_id;
  update financial_app.merchants set default_category_id=p_target_category_id,updated_at=now() where default_category_id=p_source_category_id;
  update financial_app.transactions set category_id=p_target_category_id,updated_at=now() where category_id=p_source_category_id;
  update financial_app.transaction_overrides set category_id_override=p_target_category_id,updated_at=now() where category_override_set=true and category_id_override=p_source_category_id;
  update financial_app.categorization_rules set category_id=p_target_category_id,updated_at=now() where category_id=p_source_category_id;
  update financial_app.categorization_rules set target_category_id=p_target_category_id,updated_at=now() where target_category_id=p_source_category_id;
  update financial_app.recurrences set category_id=p_target_category_id,updated_at=now() where category_id=p_source_category_id;
  update financial_app.budgets set category_id=p_target_category_id,updated_at=now() where category_id=p_source_category_id;
  update financial_app.forecast_items set category_id=p_target_category_id,updated_at=now() where category_id=p_source_category_id;
  update financial_app.categories set lifecycle='archived',parent_category_id=null,updated_at=now() where id=p_source_category_id;
end;
$$;

revoke all on function financial_app.resolve_builtin_category_id(uuid,text,text,bigint) from public,anon,authenticated;
revoke all on function financial_app.apply_categorization_rules_for_transactions(uuid[]) from public,anon,authenticated;
grant execute on function financial_app.resolve_builtin_category_id(uuid,text,text,bigint) to service_role,financial_app_gateway;
grant execute on function financial_app.apply_categorization_rules_for_transactions(uuid[]) to service_role,financial_app_gateway;

-- Bootstrap every existing workspace without hardcoding generated ids.
do $$
declare
  v_workspace record;
begin
  for v_workspace in select id from financial_app.workspaces loop
    perform financial_app.ensure_default_category_catalog(v_workspace.id);
  end loop;
end $$;

-- Fill only categories that were still unassigned and never override an explicit manual lock.
with resolved as (
  select
    t.id,
    financial_app.resolve_builtin_category_id(t.workspace_id,t.concept_normalized,t.kind,t.amount_cents) as category_id
  from financial_app.transactions t
  where t.category_id is null
    and not exists (
      select 1 from financial_app.transaction_overrides o
      where o.transaction_id=t.id and o.category_override_set=true
    )
)
update financial_app.transactions t
set category_id=r.category_id,category_origin='builtin',updated_at=now()
from resolved r
where t.id=r.id and r.category_id is not null;

commit;
