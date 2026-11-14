// Synthetic read capacity only. Reuses genuine local Auth, RLS and the gateway.
// No migration, production connection, cloud project or external credentials.
import postgres from "postgres";

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const dir = Deno.env.get("AUD_ISOLATED_DIR") ?? "";
assert(Deno.env.get("GITHUB_ACTIONS") === "true" && dir, "isolated_ci_required");
assert(Deno.env.get("AUD_ISOLATED_SUITE") === "capacity", "capacity_suite_required");
const dbUrl = Deno.env.get("SUPABASE_DB_URL") ?? "";
assert(new URL(dbUrl).hostname === "127.0.0.1", "cloud_runtime_forbidden");
const context = JSON.parse(await Deno.readTextFile(`${dir}/context.json`));
const sql = postgres(dbUrl, { max: 1, prepare: false });
const statePath = `${dir}/capacity.json`;

async function fingerprint() {
  const sources = await sql`select count(*)::int as count,
    md5(string_agg(md5(to_jsonb(s)::text),'' order by id)) as hash
    from financial_app.transaction_source_records s`;
  const rows = await sql`select count(*)::int as count,
    md5(string_agg(md5(to_jsonb(t)::text),'' order by id)) as hash
    from financial_app.transactions t`;
  return { sources: sources[0], transactions: rows[0] };
}

try {
  if (Deno.args[0] === "prepare") {
    const memberships = await sql`select workspace_id from financial_app.workspace_memberships
      where user_id=${context.owner.id}::uuid and active and is_default`;
    assert(memberships.length === 1, "capacity_owner_workspace_missing");
    const workspace = memberships[0].workspace_id;
    const fixtures: Array<{ volume: number; accountId: string }> = [];
    await sql.begin(async tx => {
      await tx`select set_config('financial_app.workspace_id',${workspace},true)`;
      await tx`set local statement_timeout='120s'`;
      for (const volume of [10000, 50000]) {
        const accounts = await tx`insert into financial_app.accounts(name,type,opening_balance_cents)
          values (${'CAPACITY synthetic ' + volume},'checking',0) returning id`;
        const accountId = accounts[0].id;
        fixtures.push({ volume, accountId });
        // Fixture load is not ingestion certification. Pause replication
        // triggers only inside this disposable owner transaction, as in the
        // existing SQL capacity lab. RLS/grants are never changed. Restore
        // origin before COMMIT and before every measured application read.
        await tx`set local session_replication_role=replica`;
        await tx`with fixture as (
          select n, date '2022-01-01' + (n % 1700) as bank_date,
            case when n%13=0 then 'transfer' when n%23=0 then 'refund'
              when n%10=0 then 'income' else 'expense' end as kind,
            case when n%13=0 then -700 when n%23=0 then 1999
              when n%10=0 then 200000 else -(100 + n%9700) end::bigint as amount,
            ${'__capacity_http__::' + volume + '::'} || n as identity,
            case when n%17=0 then 'CAPACITY SEARCH ' else 'CAPACITY ROW ' end || n as concept
          from generate_series(1,${volume}::int) n
        ), originals as (
          insert into financial_app.transaction_source_records(workspace_id,
            source_file_id,source_sheet_id,source_row_key,source_row_identity,source_fingerprint,
            source_payload,bank_date,concept_original,amount_cents,account_external_key)
          select ${workspace}::uuid,'__capacity_http__',${String(volume)},n::text,identity,
            md5(identity)||md5('source:'||identity),'{}'::jsonb,bank_date,concept,amount,${accountId}
          from fixture returning id,source_row_key
        ) insert into financial_app.transactions(workspace_id,source_record_id,source_row_identity,
          account_id,bank_date,concept_normalized,kind,amount_cents,review_state,duplicate_state)
          select ${workspace}::uuid,o.id,f.identity,${accountId}::uuid,f.bank_date,f.concept,
            f.kind,f.amount,'confirmed',case when f.n%31=0 then 'confirmed' else 'none' end
          from originals o join fixture f on f.n=o.source_row_key::int`;
        await tx`set local session_replication_role=origin`;
      }
    });
    const invalid = await sql`select count(*)::int as count from financial_app.transactions t
      left join financial_app.transaction_source_records s on s.id=t.source_record_id
      where t.source_row_identity like '__capacity_http__::%'
        and (s.id is null or s.workspace_id<>t.workspace_id or s.amount_cents<>t.amount_cents
          or s.bank_date<>t.bank_date or s.source_row_identity<>t.source_row_identity)`;
    assert(invalid[0].count === 0, "capacity_fixture_links_invalid");
    for (const f of fixtures) {
      const count = await sql`select count(*)::int as count from financial_app.transactions where account_id=${f.accountId}::uuid`;
      assert(count[0].count === f.volume, "capacity_fixture_count_invalid");
    }
    await sql`analyze financial_app.transactions`;
    await sql`analyze financial_app.transaction_source_records`;
    const info = await sql`select current_setting('server_version') as version,
      current_setting('session_replication_role') as triggers`;
    assert(info[0].triggers === "origin", "capacity_triggers_not_restored");
    await Deno.writeTextFile(statePath, JSON.stringify({ fixtures, baseline: await fingerprint(), postgres: info[0].version }), { mode: 0o600 });
    console.log("AUD_CAPACITY|stage=prepared|volumes=10000,50000|source_links_invalid=0|read_triggers=origin|ingestion_certified=false");
  } else if (Deno.args[0] === "verify") {
    const state = JSON.parse(await Deno.readTextFile(statePath));
    assert(JSON.stringify(await fingerprint()) === JSON.stringify(state.baseline), "capacity_read_mutated_bank_rows");
    console.log("AUD_CAPACITY|stage=verified|source_and_transactions_unchanged=true|separate_sql_connection=true");
  } else throw new Error("expected_prepare_or_verify");
} finally { await sql.end(); }
