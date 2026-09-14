create or replace function financial_app.canonicalize_detected_merchant_label(p_label text)
returns text
language plpgsql
immutable
strict
set search_path to ''
as $$
declare
  v_label text;
  v_norm text;
begin
  v_label := pg_catalog.btrim(pg_catalog.regexp_replace(p_label, '\s+', ' ', 'g'));
  v_label := pg_catalog.btrim(pg_catalog.regexp_replace(v_label, '^(?:NYX\*|SumUp\s*\*+|LOOMISP\*)\s*', '', 'i'));
  v_norm := financial_app.normalize_merchant_label(v_label);
  if v_norm = '' then return null; end if;

  return case
    when v_norm like 'easyvending%' or v_norm like 'easy vending%' then 'Easy Vending'
    when v_norm = 'comasa' then 'Comasa'
    when v_norm = 'abserviciosselecta' then 'AB Servicios Selecta'
    when v_norm like 'mercadona%' then 'Mercadona'
    when v_norm like '%avila bar%' or v_norm like 'avila take away%' then 'Bar Ávila'
    when v_norm = 'bar terraza el cangilon' then 'Bar Terraza El Cangilón'
    when v_norm like 'carref %' or v_norm like 'carrefour %' then 'Carrefour'
    when v_norm like 'cafe tarifa%' then 'Café Tarifa'
    when v_norm like 'estanco miraflores 24%' then 'Estanco Miraflores 24h'
    when v_norm like 'media markt%' then 'MediaMarkt'
    when v_norm like 'taxi%' then 'Taxi'
    when v_norm like 'linea directa aseguradora%' or v_norm = 'linea directa aseguradora' then 'Línea Directa'
    when v_norm like 'greco y boteros%' then 'Greco y Boteros'
    when v_norm in ('la marina ii','la marina 2','cafeteria la marina') then 'La Marina'
    when v_norm in ('bambu cafeteria','cafeteria bambu') then 'Cafetería Bambú'
    when v_norm like 'vodafone%' then 'Vodafone'
    when v_norm like 'energia xxi%' then 'Energía XXI'
    when v_norm like 'emasesa%' then 'EMASESA'
    when v_norm like 'ayto de sevilla%' or v_norm like 'ayuntamiento de sevilla%' then 'Ayuntamiento de Sevilla'
    when v_norm like 'rci banque%' then 'RCI Banque'
    when v_norm like 'instituto nacional de empleo%' or v_norm like '% inem%' then 'SEPE'
    when v_norm like 'loterias y apuestas%' or v_norm like 'liquidacion dineraria de premios%' or v_norm like 'retrocesion de liquidacion dineraria de premios%' then 'Loterías y Apuestas del Estado'
    when v_norm like 'playstation network%' then 'PlayStation Network'
    when v_norm like 'amazon%' or v_norm like 'amzn %' or v_norm like 'www amazon %' then 'Amazon'
    when v_norm like 'uber %' or v_norm = 'uber' then 'Uber'
    when v_norm like 'aliexpress%' then 'AliExpress'
    when v_norm like 'adobe %' or v_norm = 'adobe' then 'Adobe'
    when v_norm like 'openai chatgpt%' then 'ChatGPT'
    when v_norm like 'nintendo %' or v_norm = 'nintendo' then 'Nintendo'
    when v_norm like 'zala ndo pay%' or v_norm like 'zalando%' then 'Zalando'
    when v_norm like 'eess macarena%' then 'EESS Macarena'
    when v_norm like 'costco %' or v_norm = 'costco' then 'Costco'
    when v_norm like 'decathlon%' then 'Decathlon'
    when v_norm like 'dia sevilla%' then 'DIA'
    when v_norm like 'el corte ingles%' then 'El Corte Inglés'
    when v_norm like 'lidl %' or v_norm = 'lidl' then 'Lidl'
    when v_norm like 'supermercados mas%' then 'Supermercados MAS'
    when v_norm like 'cash fresh%' then 'Cash Fresh'
    when v_norm like 'fnac %' or v_norm = 'fnac' then 'Fnac'
    when v_norm like 'dominos pizza%' then 'Domino''s Pizza'
    when v_norm like 'scalpers %' or v_norm = 'scalpers' then 'Scalpers'
    when v_norm like 'adidas %' or v_norm = 'adidas' then 'Adidas'
    else v_label
  end;
end;
$$;

create or replace function financial_app.infer_merchant_label(p_concept text, p_kind text)
returns text
language plpgsql
immutable
set search_path to ''
as $$
declare
  v_concept text;
  v_raw text;
begin
  v_concept := pg_catalog.btrim(pg_catalog.regexp_replace(coalesce(p_concept,''), '\s+', ' ', 'g'));
  if v_concept = '' then return null; end if;
  if p_kind='transfer' or position('bizum' in pg_catalog.lower(v_concept))>0 or v_concept ~* '^TRASPASO ' then return 'Personal'; end if;

  if v_concept ~* 'COMPRA EN ' then
    v_raw := pg_catalog.regexp_replace(v_concept, '(?is)^.*?COMPRA EN\s+(.+?),\s*CON LA T.*$', '\1');
    if v_raw is distinct from v_concept and pg_catalog.btrim(v_raw)<>'' then return financial_app.canonicalize_detected_merchant_label(v_raw); end if;
    if v_concept ~* 'REGULARIZACION.*COMPRA EN\s*,' then return 'Openbank'; end if;
  end if;
  if v_concept ~* '^EN .+CON LA T' then
    v_raw := pg_catalog.regexp_replace(v_concept, '(?is)^EN\s+(.+?),\s*CON LA T.*$', '\1');
    if v_raw is distinct from v_concept and pg_catalog.btrim(v_raw)<>'' then return financial_app.canonicalize_detected_merchant_label(v_raw); end if;
  end if;
  if v_concept ilike '%Nº RECIBO%' then
    v_raw := pg_catalog.regexp_replace(v_concept, '(?is)^(?:RECIBO\s+)?(.+?)\s+Nº\s+RECIBO.*$', '\1');
    if v_raw is distinct from v_concept and pg_catalog.btrim(v_raw)<>'' then return financial_app.canonicalize_detected_merchant_label(v_raw); end if;
  end if;
  if v_concept ~* '^TRANSFERENCIA (INMEDIATA )?DE ' then
    v_raw := pg_catalog.regexp_replace(v_concept, '(?is)^TRANSFERENCIA (?:INMEDIATA )?DE\s+(.+?)(?:[,\.]?\s+CONC\s*E?\s*P?\s*T?\s*O.*|$)', '\1');
    if v_raw is distinct from v_concept and pg_catalog.btrim(v_raw)<>'' then return financial_app.canonicalize_detected_merchant_label(v_raw); end if;
  end if;
  if v_concept ~* '^TRANSFERENCIA (INMEDIATA )?A FAVOR DE ' then
    v_raw := pg_catalog.regexp_replace(v_concept, '(?is)^TRANSFERENCIA (?:INMEDIATA )?A FAVOR DE\s+(.+?)(?:\s+CONC\s*E?\s*P?\s*T?\s*O.*|$)', '\1');
    if v_raw is distinct from v_concept and pg_catalog.btrim(v_raw)<>'' then return financial_app.canonicalize_detected_merchant_label(v_raw); end if;
  end if;
  if v_concept ~* '^A FAVOR DE ' then
    v_raw := pg_catalog.regexp_replace(v_concept, '(?is)^A FAVOR DE\s+(.+?)(?:\s+CONC\s*E?\s*P?\s*T?\s*O.*|$)', '\1');
    if v_raw is distinct from v_concept and pg_catalog.btrim(v_raw)<>'' then return financial_app.canonicalize_detected_merchant_label(v_raw); end if;
  end if;
  if v_concept ~* '^DE .+CONC\s*E?\s*P?\s*T?\s*O' then return 'Personal'; end if;
  if v_concept ~* '^NOMINA DE ' then
    v_raw := pg_catalog.regexp_replace(v_concept, '(?is)^NOMINA DE\s+(.+?)(?:\s*:\s*|$)', '\1');
    if v_raw is distinct from v_concept and pg_catalog.btrim(v_raw)<>'' then return financial_app.canonicalize_detected_merchant_label(v_raw); end if;
  end if;

  if v_concept ilike 'DISPOSICION EN CAJERO%' then return 'Efectivo / Cajero'; end if;
  if v_concept ilike 'RETENCION HACIENDA%' or v_concept ilike 'IMPUESTO:%' or v_concept ilike 'DOMICILIACION IMPUESTO:%' then return 'Agencia Tributaria'; end if;
  if v_concept ilike 'GESTION DE DEVOLUCIONES%' then return 'Openbank'; end if;
  if v_concept ilike 'UBER %' then return 'Uber'; end if;
  if v_concept ilike 'AMAZON%' or v_concept ilike 'AMZN %' or v_concept ilike 'WWW.AMAZON.%' then return 'Amazon'; end if;
  if v_concept ilike 'ALIEXPRESS%' then return 'AliExpress'; end if;
  if v_concept ilike 'ADOBE %' then return 'Adobe'; end if;
  if v_concept ilike 'PLAYSTATION NETWORK%' then return 'PlayStation Network'; end if;
  if v_concept ilike 'NINTENDO %' then return 'Nintendo'; end if;
  if v_concept ilike 'ZALA NDO PAY%' or v_concept ilike 'ZALANDO%' then return 'Zalando'; end if;
  if v_concept ilike 'CARREFOUR %' or v_concept ilike 'CARREF %' then return 'Carrefour'; end if;
  if v_concept ilike 'AYUNTAMIENTO DE CORIA%' then return 'Ayuntamiento de Coria'; end if;
  if v_concept ilike 'LOTERIAS Y APUESTAS%' or v_concept ilike '%LIQUIDACION DINERARIA DE PREMIOS%' then return 'Loterías y Apuestas del Estado'; end if;
  if v_concept ilike 'LIQUIDACION CUENTA%' or v_concept ilike 'BONIFICACION SOBRE EL IMPORTE DE RECIBOS%' then return 'Openbank'; end if;
  return null;
end;
$$;

update financial_app.merchants set name='Comasa' where normalized_name='comasa';
update financial_app.merchants set name='AB Servicios Selecta' where normalized_name='abserviciosselecta';
update financial_app.merchants set name='Bar Terraza El Cangilón' where normalized_name='bar terraza el cangilon';

with recalculated as (
  select t.id,financial_app.ensure_inferred_merchant_id(t.workspace_id,t.concept_normalized,t.kind) as merchant_id
  from financial_app.transactions t
)
update financial_app.transactions t
set merchant_id=r.merchant_id
from recalculated r
where t.id=r.id and r.merchant_id is not null and t.merchant_id is distinct from r.merchant_id;

delete from financial_app.merchants m
where m.name ~* 'CONC\s*E?\s*P?\s*T?\s*O'
  and not exists(select 1 from financial_app.transactions t where t.merchant_id=m.id)
  and not exists(select 1 from financial_app.transaction_overrides o where o.merchant_id_override=m.id)
  and not exists(select 1 from financial_app.merchant_aliases a where a.merchant_id=m.id)
  and not exists(select 1 from financial_app.categorization_rules r where r.merchant_id=m.id or r.target_merchant_id=m.id);
