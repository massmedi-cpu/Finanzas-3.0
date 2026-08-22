-- Financial App 1.0.0-rc.1 — acceso temporal y de un solo uso a Preview.
-- No sustituye Google OAuth en producción. Permite validar previews protegidas mientras el proveedor Google se configura.

create table if not exists financial_app.preview_login_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (length(token_hash)=64),
  deployment_host text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table financial_app.preview_login_tokens enable row level security;
revoke all on financial_app.preview_login_tokens from public,anon,authenticated;
create index if not exists preview_login_tokens_expiry_idx on financial_app.preview_login_tokens(expires_at) where used_at is null;

create or replace function public.financial_app_claim_preview_login(p_token_hash text,p_host text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,financial_app,auth as $$
declare v_id uuid;v_email text;
begin
 if p_token_hash is null or length(p_token_hash)<>64 or nullif(trim(p_host),'') is null then return null; end if;
 update financial_app.preview_login_tokens set used_at=now() where token_hash=lower(p_token_hash) and used_at is null and expires_at>now() and lower(deployment_host)=lower(trim(p_host)) returning id into v_id;
 if v_id is null then return null; end if;
 select lower(trim(email)) into v_email from financial_app.allowed_users where enabled=true order by created_at limit 1;
 if v_email is null then return null; end if;
 return jsonb_build_object('ok',true,'email',v_email);
end;$$;
revoke all on function public.financial_app_claim_preview_login(text,text) from public,anon,authenticated;
grant execute on function public.financial_app_claim_preview_login(text,text) to service_role;
