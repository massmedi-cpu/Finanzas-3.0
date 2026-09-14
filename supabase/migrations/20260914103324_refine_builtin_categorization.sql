begin;

create or replace function financial_app.ensure_category_catalog_extras(p_workspace_id uuid)
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
  values (p_workspace_id,'income.bizum','Bizum recibido','income',null,'banknote','category.cyan','active',6)
  on conflict (workspace_id,system_key) where system_key is not null do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into financial_app.categories(workspace_id,system_key,name,kind,parent_category_id,icon_key,color_token,lifecycle,sort_order)
  select p_workspace_id,v.system_key,v.name,'expense',p.id,v.icon_key,v.color_token,'active',v.sort_order
  from (values
    ('expense.transport.insurance','Seguro del vehículo','expense.transport','shield','category.blue',5),
    ('expense.shopping.sport','Deporte y equipamiento','expense.shopping','dumbbell','category.teal',4),
    ('expense.shopping.tobacco','Estancos','expense.shopping','receipt','category.slate',5)
  ) as v(system_key,name,parent_key,icon_key,color_token,sort_order)
  join financial_app.categories p
    on p.workspace_id=p_workspace_id and p.system_key=v.parent_key
  on conflict (workspace_id,system_key) where system_key is not null do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;
  return v_count;
end;
$$;

revoke all on function financial_app.ensure_category_catalog_extras(uuid) from public,anon,authenticated;

create or replace function financial_app.bootstrap_category_catalog_after_workspace_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform financial_app.ensure_default_category_catalog(new.id);
  perform financial_app.ensure_category_catalog_extras(new.id);
  return new;
end;
$$;

revoke all on function financial_app.bootstrap_category_catalog_after_workspace_insert() from public,anon,authenticated;

drop trigger if exists workspaces_bootstrap_category_catalog on financial_app.workspaces;
create trigger workspaces_bootstrap_category_catalog
after insert on financial_app.workspaces
for each row execute function financial_app.bootstrap_category_catalog_after_workspace_insert();

do $$
declare
  v_workspace record;
begin
  for v_workspace in select id from financial_app.workspaces loop
    perform financial_app.ensure_category_catalog_extras(v_workspace.id);
  end loop;
end $$;

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
    if v_concept ~ '(^| )bizum( |$)' then v_key := 'income.bizum';
    elsif v_concept ~ '(nomina|nom ina|abenewco|codesa|cox infra|cox corporate|ca infra corporativo)' then v_key := 'income.salary';
    elsif v_concept ~ '(sepe|inem|prestacion|subsidio|pension|ayuda)' then v_key := 'income.benefits';
    elsif v_concept ~ '(devolucion|reembolso|refund|retrocesion|regularizacion compra|energia xxi|amazon|amzn|aliexpress|adobe)' then v_key := 'income.refund';
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
    elsif v_concept ~ '(mercadona|carrefour|lidl|aldi|supermercado|hipercor|(^| )dia( |$)|dia sevilla|coviran|mas supermercado|alcampo)' then v_key := 'expense.food.supermarket';
    elsif v_concept ~ '(mcdonald|burger king|telepizza|dominos|glovo|uber eats|just eat|restaurante|gastrobar|todoporelclienterestauran|greco y boteros)' then v_key := 'expense.food.restaurant';
    elsif v_concept ~ '(bar terraza|(^| )(bar|cafe|cafeteria)( |$)|starbucks|casa julian|capitol)' then v_key := 'expense.food.cafe';
    elsif v_concept ~ '(easyvending|vending|nyx comasa|abserviciosselecta)' then v_key := 'expense.food.vending';
    elsif v_concept ~ '(repsol|moeve|cepsa|gasolinera|gasoleo|combustible|(^| )bp( |$)|shell|eess macarena)' then v_key := 'expense.transport.fuel';
    elsif v_concept ~ '(uber trip|cabify|taxi|bolt ride)' then v_key := 'expense.transport.taxi';
    elsif v_concept ~ '(tussam|consorcio transporte|metro sevilla|renfe cercanias|autobus urbano)' then v_key := 'expense.transport.public';
    elsif v_concept ~ '(parking|aparcamiento|telpark|empark|peaje)' then v_key := 'expense.transport.parking';
    elsif v_concept ~ '(taller|norauto|feu vert|itv|neumatic|mantenimiento vehiculo)' then v_key := 'expense.transport.maintenance';
    elsif v_concept ~ '(linea directa aseguradora|seguro coche|seguro auto|seguro vehiculo)' then v_key := 'expense.transport.insurance';
    elsif v_concept ~ '(farmacia|parafarmacia)' then v_key := 'expense.health.pharmacy';
    elsif v_concept ~ '(clinica|hospital|dentista|dental|medico|optica|fisioterapia)' then v_key := 'expense.health.medical';
    elsif v_concept ~ '(gimnasio|basic fit|fitness|gym)' then v_key := 'expense.health.sport';
    elsif v_concept ~ '(the cube urban)' then v_key := 'expense.health';
    elsif v_concept ~ '(netflix|disney|hbo|prime video|filmin|skyshowtime|movistar plus)' then v_key := 'expense.leisure.streaming';
    elsif v_concept ~ '(playstation|nintendo|xbox|steam|epic games)' then v_key := 'expense.leisure.gaming';
    elsif v_concept ~ '(cine|teatro|ticketmaster|entradas|sevilla arte y cultura)' then v_key := 'expense.leisure.cinema';
    elsif v_concept ~ '(spotify|apple music|youtube music)' then v_key := 'expense.leisure.music';
    elsif v_concept ~ '(loterias|apuestas|once|euromillones|primitiva|liquidacion dineraria de premios)' then v_key := 'expense.leisure.lottery';
    elsif v_concept ~ '(zara|primark|mango|bershka|pull bear|stradivarius|lefties|hm |h m |calzados)' then v_key := 'expense.shopping.clothing';
    elsif v_concept ~ '(decathlon|sprinter)' then v_key := 'expense.shopping.sport';
    elsif v_concept ~ '(estanco|palacio del fumador)' then v_key := 'expense.shopping.tobacco';
    elsif v_concept ~ '(mediamarkt|pccomponentes|apple com|samsung|fnac|electronica)' then v_key := 'expense.shopping.technology';
    elsif v_concept ~ '(ikea|leroy merlin|merlin eucalipto|conforama|bricomart|obrama)' then v_key := 'expense.shopping.home';
    elsif v_concept ~ '(regalo|floristeria)' then v_key := 'expense.shopping.gifts';
    elsif v_concept ~ '(adobe|openai|chatgpt|google one|icloud|dropbox|microsoft 365|onedrive|vercel)' then v_key := 'expense.services.software';
    elsif v_concept ~ '(suscripcion|membership|patreon)' then v_key := 'expense.services.subscriptions';
    elsif v_concept ~ '(comision|mantenimiento cuenta|gastos bancarios)' then v_key := 'expense.services.banking';
    elsif v_concept ~ '(booking|airbnb|hotel|hostal|apartamento turistico)' then v_key := 'expense.travel.accommodation';
    elsif v_concept ~ '(vueling|iberia|ryanair|easyjet|iryo|ouigo|renfe ave|venta billetes renfe)' then v_key := 'expense.travel.transport';
    elsif v_concept ~ '(hacienda|aeat|impuesto|ibi|irpf)' then v_key := 'expense.admin.tax';
    elsif v_concept ~ '(multa|sancion|(^| )tasa( |$)|dgt)' then v_key := 'expense.admin.fees';
    elsif v_concept ~ '(peluquer|barber|estetica|manicura)' then v_key := 'expense.personal.beauty';
    elsif v_concept ~ '(veterin|tiendanimal|kiwoko|mascota)' then v_key := 'expense.pets';
    elsif v_concept ~ '(academia|universidad|curso|udemy|domestika|formacion)' then v_key := 'expense.education';
    elsif v_concept ~ '(cajero|reintegro|retirada efectivo)' then v_key := 'expense.cash';
    elsif v_concept ~ '(amazon|amzn|aliexpress|el corte ingles)' then v_key := 'expense.shopping';
    else v_key := 'expense.other'; end if;
  end if;

  select id into v_id
  from financial_app.categories
  where workspace_id=p_workspace_id and system_key=v_key and lifecycle='active'
  limit 1;
  return v_id;
end;
$$;

with resolved as (
  select t.id,financial_app.resolve_builtin_category_id(t.workspace_id,t.concept_normalized,t.kind,t.amount_cents) as category_id
  from financial_app.transactions t
  where t.category_origin='builtin'
    and not exists (
      select 1 from financial_app.transaction_overrides o
      where o.transaction_id=t.id and o.category_override_set=true
    )
)
update financial_app.transactions t
set category_id=r.category_id,category_origin='builtin',updated_at=now()
from resolved r
where t.id=r.id and r.category_id is not null and t.category_id is distinct from r.category_id;

commit;