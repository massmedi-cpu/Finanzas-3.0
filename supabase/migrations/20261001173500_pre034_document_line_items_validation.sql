-- Financial App · PRE-034 · defensa en profundidad para líneas OCR confirmadas.
-- La API valida primero; esta capa impide persistir JSON documental inválido aunque
-- una llamada futura omita accidentalmente esa validación.

create or replace function financial_app.document_line_items_valid(p_items jsonb)
returns boolean
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_item jsonb;
  v_number numeric;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 200 then
    return false;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then return false; end if;
    if jsonb_typeof(v_item->'description') is distinct from 'string' then return false; end if;
    if char_length(trim(coalesce(v_item->>'description',''))) not between 1 and 500 then return false; end if;

    if v_item ? 'quantity' and v_item->'quantity' <> 'null'::jsonb then
      if jsonb_typeof(v_item->'quantity') is distinct from 'number' then return false; end if;
      v_number := (v_item->>'quantity')::numeric;
      if abs(v_number) > 1000000 then return false; end if;
    end if;

    if v_item ? 'unitPriceCents' and v_item->'unitPriceCents' <> 'null'::jsonb then
      if jsonb_typeof(v_item->'unitPriceCents') is distinct from 'number' then return false; end if;
      v_number := (v_item->>'unitPriceCents')::numeric;
      if v_number <> trunc(v_number) or abs(v_number) > 9007199254740991 then return false; end if;
    end if;

    if v_item ? 'totalCents' and v_item->'totalCents' <> 'null'::jsonb then
      if jsonb_typeof(v_item->'totalCents') is distinct from 'number' then return false; end if;
      v_number := (v_item->>'totalCents')::numeric;
      if v_number <> trunc(v_number) or abs(v_number) > 9007199254740991 then return false; end if;
    end if;
  end loop;

  return true;
exception
  when others then return false;
end;
$$;

revoke all on function financial_app.document_line_items_valid(jsonb) from public, anon, authenticated;
grant execute on function financial_app.document_line_items_valid(jsonb) to financial_app_gateway;

alter table financial_app.documents
  drop constraint if exists documents_line_items_array_check,
  drop constraint if exists documents_line_items_shape_check,
  add constraint documents_line_items_shape_check
    check (financial_app.document_line_items_valid(line_items));
