import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getVercelOidcToken } from '@vercel/oidc';

// The CLI config is a transitive dependency of the SDK. Resolve it from the
// SDK rather than assuming that npm always hoists it to the repository root.
const require = createRequire(import.meta.url);
const fromOidc = createRequire(require.resolve('@vercel/oidc'));
const config = fromOidc('@vercel/cli-config');

await test('patched CLI config validates and round-trips synthetic credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'financial-app-oidc-fixture-'));
  try {
    const path = join(dir, 'auth.json');
    const dummy = { token: 'synthetic-token', userId: 'synthetic-user', expiresAt: 1900000000 };
    config.writeAuthConfigFile(path, dummy);
    assert.deepEqual(config.readAuthConfigFile(path), dummy);
    assert.equal(config.parseGlobalConfig({ credStorage: 'file', telemetry: { enabled: false } }).credStorage, 'file');
    assert.throws(() => config.parseGlobalConfig({ credStorage: 'invalid-fixture' }));
    assert.throws(() => config.parseAuthConfig({ expiresAt: 'not-a-number' }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

await test('OIDC SDK still reads a fresh synthetic runtime token without network access', async () => {
  const previous = process.env.VERCEL_OIDC_TOKEN;
  const previousFetch = globalThis.fetch;
  const encoded = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  const token = `fixture.${encoded}.fixture`;
  try {
    process.env.VERCEL_OIDC_TOKEN = token;
    globalThis.fetch = async () => { throw new Error('network_forbidden_in_synthetic_test'); };
    assert.equal(await getVercelOidcToken({ project: 'synthetic-project', team: 'synthetic-team', expirationBufferMs: 60_000 }), token);
  } finally {
    if (previous === undefined) delete process.env.VERCEL_OIDC_TOKEN;
    else process.env.VERCEL_OIDC_TOKEN = previous;
    globalThis.fetch = previousFetch;
  }
});
