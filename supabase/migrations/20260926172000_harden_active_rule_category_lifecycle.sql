create or replace function financial_app.validate_active_rule_category_lifecycle()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if new.status = 'active'
     and new.category_id is not null
     and not exists (
       select 1
       from financial_app.categories c
       where c.id = new.category_id
         and c.lifecycle = 'active'
     ) then
    raise exception 'rule_category_not_active';
  end if;

  if new.target_category_id is not null
     and not exists (
       select 1
       from financial_app.categories c
       where c.id = new.target_category_id
         and c.lifecycle = 'active'
     ) then
    raise exception 'rule_target_category_not_active';
  end if;

  return new;
end;
$$;

drop trigger if exists categorization_rules_active_category_lifecycle
  on financial_app.categorization_rules;

create trigger categorization_rules_active_category_lifecycle
before insert or update of status, category_id, target_category_id
on financial_app.categorization_rules
for each row
execute function financial_app.validate_active_rule_category_lifecycle();
