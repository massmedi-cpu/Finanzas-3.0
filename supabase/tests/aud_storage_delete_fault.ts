/**
 * REC-DOC-DELETE-267 — isolated Storage fault injection, NEVER cloud.
 * Only called by disposable AUD E2E after Supabase CLI start.
 * Never log private object paths, filenames, credentials, signed URLs or bytes.
 */
import postgres from "postgres";
const mode = Deno.args[0];
const path = Deno.args[1];
const url = Deno.env.get("SUPABASE_DB_URL") ?? "";
const origin = Deno.env.get("SUPABASE_URL") ?? "";
const eligible = Deno.env.get("GITHUB_ACTIONS") === "true"
  && Boolean(Deno.env.get("AUD_ISOLATED_DIR"))
  && /^uploads\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i.test(path ?? "");
let local = false;
try {
  local = new URL(url).hostname === "127.0.0.1"
    && new URL(origin).hostname === "127.0.0.1";
} catch { /* Fail closed */ }
if (!eligible || !local || !["install", "remove"].includes(mode)) {
  throw new Error("aud_disposable_storage_fault_only");
}
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 5 });
try {
  if (mode === "install") {
    await sql`create table if not exists public.aud_storage_delete_faults (path text primary key)`;
    await sql`insert into public.aud_storage_delete_faults (path) values (${path})
      on conflict (path) do nothing`;
    await sql`
      create or replace function public.aud_reject_storage_delete()
      returns trigger language plpgsql security invoker set search_path = ''
      as $fn$
      begin
        if old.bucket_id = 'financial-app-documents'
          and exists(select 1 from public.aud_storage_delete_faults f where f.path = old.name) then
          raise exception 'AUD_DISPOSABLE_STORAGE_DELETE_FAILED';
        end if;
        return old;
      end;
      $fn$`;
    await sql`drop trigger if exists aud_reject_storage_delete on storage.objects`;
    await sql`create trigger aud_reject_storage_delete
      before delete on storage.objects
      for each row execute function public.aud_reject_storage_delete()`;
  } else {
    await sql`drop trigger if exists aud_reject_storage_delete on storage.objects`;
    await sql`drop function if exists public.aud_reject_storage_delete()`;
    await sql`drop table if exists public.aud_storage_delete_faults`;
  }
  console.log("AUD_STORAGE|fault=" + (mode === "install" ? "injected" : "removed") + "|cloud_access=false");
} finally {
  await sql.end({ timeout: 2 });
}
