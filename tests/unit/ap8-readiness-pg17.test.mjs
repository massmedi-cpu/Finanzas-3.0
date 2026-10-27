import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Entirely in-memory, synthetic PostgreSQL 17. No database URLs or credentials.
const readinessSql = await readFile(new URL('../../scripts/rec-ap8-readiness-readonly.sql', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../supabase/migrations/20261011205000_ap1_private_document_original_immutable.sql', import.meta.url), 'utf8');
const foundations = await readFile(new URL('../../supabase/migrations/20260903200004_financial_app_foundations.sql', import.meta.url), 'utf8');
const match = migration.match(/AS \$\$([\s\S]*?)\$\$;/);
assert.ok(match, 'reviewed migration must contain the original guard body');
const bodyHash = createHash('sha256').update(match[1]).digest('hex');
assert.ok(readinessSql.includes(`'${bodyHash}'`), 'readiness digest must match the reviewed migration body');
const touchBody = foundations.match(/create or replace function financial_app\.touch_updated_at\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1];
assert.ok(touchBody, 'reviewed timestamp helper body must exist');
const touchHash = createHash('sha256').update(touchBody).digest('hex');
assert.ok(readinessSql.includes(`'${touchHash}'`), 'readiness digest must match the reviewed timestamp helper');

const setup = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA financial_app;
CREATE TABLE financial_app.documents (
  id integer PRIMARY KEY, storage_provider text, storage_key text,
  original_file_name text, mime_type text, size_bytes bigint,
  source_drive_file_id text, notes text, updated_at timestamptz
);
CREATE TABLE financial_app.transaction_source_records (id integer PRIMARY KEY);
CREATE TABLE financial_app.transactions (id integer PRIMARY KEY, source_record_id integer);
ALTER TABLE financial_app.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_app.transaction_source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_app.transactions ENABLE ROW LEVEL SECURITY;
INSERT INTO financial_app.documents VALUES
  (1, 'supabase', 'original', 'synthetic.pdf', 'application/pdf', 42, 'synthetic-drive-id', '', now());
INSERT INTO financial_app.transaction_source_records VALUES (1);
INSERT INTO financial_app.transactions VALUES (1,1);
CREATE FUNCTION financial_app.touch_updated_at() RETURNS trigger LANGUAGE plpgsql
  SET search_path TO pg_catalog, financial_app AS $$${touchBody}$$;
CREATE TRIGGER documents_touch_updated_at BEFORE UPDATE ON financial_app.documents
  FOR EACH ROW EXECUTE FUNCTION financial_app.touch_updated_at();
`;

await test('AP8 readiness rejects ineffective document guards in synthetic PostgreSQL 17', async t => {
  const db = new PGlite();
  try {
    const [{ version }] = (await db.query('SELECT version() AS version')).rows;
    assert.match(version, /^PostgreSQL 17\./, 'test requires a PostgreSQL 17 engine');
    await db.exec(setup);
    const status = async () => {
      const results = await db.exec(readinessSql);
      const row = results.find(result => result.rows?.[0]?.ap8_db_readiness)?.rows[0];
      assert.ok(row, 'read-only query must return a readiness row');
      return row;
    };
    const expectBlocked = async code => {
      const row = await status();
      assert.equal(row.ap8_db_readiness, 'blocked');
      assert.ok(row.blockers.includes(code), `missing blocker ${code}`);
    };
    const reset = async () => { await db.exec(migration); };
    const changeKey = "UPDATE financial_app.documents SET storage_key='changed' WHERE id=1";
    const restoreKey = "UPDATE financial_app.documents SET storage_key='original' WHERE id=1";

    await t.test('missing guard is blocked', async () => {
      await expectBlocked('original_immutability_missing');
    });
    await t.test('canonical guard is ready, blocks original changes, and allows notes', async () => {
      await reset();
      assert.equal((await status()).ap8_db_readiness, 'ready');
      for (const change of [
        "storage_provider='other'", "storage_key='changed'", "source_drive_file_id='changed'",
        "original_file_name='changed'", "mime_type='text/plain'", 'size_bytes=43',
      ]) {
        await assert.rejects(db.exec(`UPDATE financial_app.documents SET ${change} WHERE id=1`), error => error.code === '23514');
      }
      await db.exec("UPDATE financial_app.documents SET notes='allowed' WHERE id=1");
      assert.equal((await db.query('SELECT notes FROM financial_app.documents WHERE id=1')).rows[0].notes, 'allowed');
    });
    await t.test('a reset or hostile guard search path cannot report ready', async () => {
      await reset();
      await db.exec('ALTER FUNCTION financial_app.prevent_private_original_rewrite() RESET search_path');
      await expectBlocked('original_immutability_missing');

      // Keep the reviewed body byte-for-byte unchanged. A hostile operator on
      // the function search path can still change the result of its checks.
      await db.exec(`CREATE SCHEMA hostile;
        CREATE SEQUENCE hostile.op_count;
        CREATE FUNCTION hostile.text_equal(text, text) RETURNS boolean LANGUAGE sql VOLATILE
          AS $$ SELECT nextval('hostile.op_count') % 4 <> 0 $$;
        CREATE OPERATOR hostile.= (LEFTARG=text, RIGHTARG=text, FUNCTION=hostile.text_equal);
        ALTER FUNCTION financial_app.prevent_private_original_rewrite()
          SET search_path TO hostile, pg_catalog;`);
      await expectBlocked('original_immutability_missing');
      await db.exec("UPDATE financial_app.documents SET original_file_name='altered.pdf' WHERE id=1");
      assert.equal((await db.query('SELECT original_file_name FROM financial_app.documents WHERE id=1')).rows[0].original_file_name, 'altered.pdf');

      await db.exec('DROP TRIGGER documents_private_original_rewrite_guard ON financial_app.documents');
      await db.exec("UPDATE financial_app.documents SET original_file_name='synthetic.pdf' WHERE id=1");
      await db.exec('DROP SCHEMA hostile CASCADE');
      await reset();
      assert.equal((await status()).ap8_db_readiness, 'ready');
    });
    await t.test('column-specific guard cannot report ready', async () => {
      await reset();
      await db.exec(`DROP TRIGGER documents_private_original_rewrite_guard ON financial_app.documents;
        CREATE TRIGGER documents_private_original_rewrite_guard BEFORE UPDATE OF original_file_name
        ON financial_app.documents FOR EACH ROW EXECUTE FUNCTION financial_app.prevent_private_original_rewrite();`);
      await expectBlocked('original_immutability_missing');
      await db.exec(changeKey); // Demonstrate the unsafe trigger really lets this through.
      await db.exec(restoreKey);
    });
    await t.test('conditional guard cannot report ready', async () => {
      await reset();
      await db.exec(`DROP TRIGGER documents_private_original_rewrite_guard ON financial_app.documents;
        CREATE TRIGGER documents_private_original_rewrite_guard BEFORE UPDATE
        ON financial_app.documents FOR EACH ROW WHEN (false)
        EXECUTE FUNCTION financial_app.prevent_private_original_rewrite();`);
      await expectBlocked('original_immutability_missing');
      await db.exec(changeKey);
      await db.exec(restoreKey);
    });
    await t.test('comments imitating checks do not authenticate the function body', async () => {
      await reset();
      await db.exec(`CREATE OR REPLACE FUNCTION financial_app.prevent_private_original_rewrite()
        RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN
        -- NEW.storage_provider IS DISTINCT FROM OLD.storage_provider
        -- NEW.storage_key IS DISTINCT FROM OLD.storage_key
        -- NEW.source_drive_file_id IS DISTINCT FROM OLD.source_drive_file_id
        RETURN NEW; END; $$;`);
      await expectBlocked('original_immutability_missing');
      await db.exec(changeKey);
      await db.exec(restoreKey);
    });
    await t.test('a later trigger rewriting NEW is blocked by readiness', async () => {
      await reset();
      await db.exec(`CREATE FUNCTION financial_app.later_rewrite() RETURNS trigger LANGUAGE plpgsql
        AS $$ BEGIN NEW.storage_key := 'changed-after-guard'; RETURN NEW; END; $$;
        CREATE TRIGGER z_after_original_guard BEFORE UPDATE ON financial_app.documents
        FOR EACH ROW EXECUTE FUNCTION financial_app.later_rewrite();`);
      await expectBlocked('document_update_trigger_unverified');
      await db.exec("UPDATE financial_app.documents SET notes='unchanged original' WHERE id=1");
      assert.equal((await db.query('SELECT storage_key FROM financial_app.documents WHERE id=1')).rows[0].storage_key, 'changed-after-guard');
      await db.exec('DROP TRIGGER z_after_original_guard ON financial_app.documents');
      await db.exec('DROP TRIGGER documents_private_original_rewrite_guard ON financial_app.documents');
      await db.exec(restoreKey);
      await reset();
      assert.equal((await status()).ap8_db_readiness, 'ready');
    });
    await t.test('disabled, miswired, and extra-event triggers are blocked', async () => {
      await reset();
      await db.exec('ALTER TABLE financial_app.documents DISABLE TRIGGER documents_private_original_rewrite_guard');
      await expectBlocked('original_immutability_missing');
      await reset();
      await db.exec(`CREATE FUNCTION financial_app.wrong_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
        DROP TRIGGER documents_private_original_rewrite_guard ON financial_app.documents;
        CREATE TRIGGER documents_private_original_rewrite_guard BEFORE UPDATE
        ON financial_app.documents FOR EACH ROW EXECUTE FUNCTION financial_app.wrong_guard();`);
      await expectBlocked('original_immutability_missing');
      await reset();
      await db.exec(`DROP TRIGGER documents_private_original_rewrite_guard ON financial_app.documents;
        CREATE TRIGGER documents_private_original_rewrite_guard BEFORE INSERT OR UPDATE
        ON financial_app.documents FOR EACH ROW EXECUTE FUNCTION financial_app.prevent_private_original_rewrite();`);
      await expectBlocked('original_immutability_missing');
    });
    await t.test('client execution privilege, missing RLS and broken links remain blockers', async () => {
      await reset();
      await db.exec('GRANT EXECUTE ON FUNCTION financial_app.prevent_private_original_rewrite() TO anon');
      await expectBlocked('original_guard_executable_by_client');
      await db.exec('REVOKE EXECUTE ON FUNCTION financial_app.prevent_private_original_rewrite() FROM anon');
      await db.exec('ALTER TABLE financial_app.transactions DISABLE ROW LEVEL SECURITY');
      await expectBlocked('financial_rls_incomplete');
      await db.exec('ALTER TABLE financial_app.transactions ENABLE ROW LEVEL SECURITY');
      await db.exec('CREATE TABLE financial_app.unprotected_partitioned(id integer) PARTITION BY RANGE(id)');
      await expectBlocked('financial_rls_incomplete');
      await db.exec('DROP TABLE financial_app.unprotected_partitioned');
      await db.exec('UPDATE financial_app.transactions SET source_record_id=999 WHERE id=1');
      await expectBlocked('existing_transaction_links_inconsistent');
    });
  } finally {
    await db.close();
  }
});
