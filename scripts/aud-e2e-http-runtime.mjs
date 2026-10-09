// Test-only trust anchor. Never changes the tracked production gateway.
import fs from 'node:fs';
import http from 'node:http';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import path from 'node:path';

const dir = process.env.AUD_ISOLATED_DIR;
if (process.env.GITHUB_ACTIONS !== 'true' || !dir || !/^[0-9a-f]{40}$/.test(process.env.AUD_VALIDATION_SHA ?? '')) throw Error('isolated_ci_required');
for (const name of ['SUPABASE_URL', 'SUPABASE_DB_URL']) {
  if (new URL(process.env[name]).hostname !== '127.0.0.1') throw Error('cloud_runtime_forbidden');
}
const gatewayDir = 'supabase/functions/financial-app-db-gateway';
const generated = path.join(gatewayDir, 'index.aud-local.ts');
if (process.argv[2] === 'prepare') {
  if (process.env.VERCEL_OIDC_TOKEN) throw Error('external_oidc_forbidden');
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = 'aud-disposable-key';
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: 'https://oidc.vercel.com', aud: 'https://vercel.com/massmedi-9832s-projects',
    owner_id: 'team_xrSskbkRKwQkyYc0vvLVGUnb', project_id: 'prj_SbZ64E02YhCK4ds24Yi7qf5CeQjo', project: 'finanzas-3-0',
    environment: 'production', sub: 'owner:massmedi-9832s-projects:project:finanzas-3-0:environment:production', iat: now, exp: now + 3600 };
  function token(patch = {}, key = privateKey) {
    const unsigned = [JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }), JSON.stringify({ ...claims, ...patch })]
      .map(value => Buffer.from(value).toString('base64url')).join('.');
    return unsigned + '.' + sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url');
  }
  const production = token();
  const tokens = { production, preview: token({ environment: 'preview', sub: claims.sub.replace('production', 'preview') }),
    wrongOwner: token({ owner_id: 'wrong-team' }), wrongProject: token({ project_id: 'wrong-project' }),
    wrongAudience: token({ aud: 'https://example.test' }), wrongIssuer: token({ iss: 'https://example.test' }),
    expired: token({ exp: now - 60 }), wrongSignature: token({}, generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey) };
  fs.writeFileSync(path.join(dir, 'jwks.json'), JSON.stringify({ keys: [jwk] }), { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'machine-tokens.json'), JSON.stringify(tokens), { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'http.env'), `VERCEL_OIDC_TOKEN='${production}'\nVERCEL_ENV='production'\n`, { mode: 0o600 });
  process.stderr.write(`::add-mask::${production}\n`);
  const source = fs.readFileSync(path.join(gatewayDir, 'index.ts'), 'utf8');
  let copy = source;
  for (const [before, after] of [
    ['new URL("https://oidc.vercel.com/.well-known/jwks")', 'new URL("http://127.0.0.1:54330/jwks")'],
    ['Deno.serve(async (req) => {', 'Deno.serve({ hostname: "127.0.0.1", port: 54331 }, async (req) => {'],
  ]) {
    if (copy.split(before).length !== 2) throw Error('gateway_copy_patch_not_unique');
    copy = copy.replace(before, after);
  }
  fs.writeFileSync(generated, copy, { flag: 'wx' });
  console.log(`AUD_HTTP|stage=prepared|trust_anchor=disposable_local_jwks|gateway_source_sha256=${createHash('sha256').update(source).digest('hex')}|production_source_unchanged=true`);
} else if (process.argv[2] === 'serve') {
  const jwks = fs.readFileSync(path.join(dir, 'jwks.json'));
  http.createServer((req, res) => {
    if (req.method !== 'GET' || req.url !== '/jwks') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(jwks);
  }).listen(54330, '127.0.0.1');
} else throw Error('expected_prepare_or_serve');
