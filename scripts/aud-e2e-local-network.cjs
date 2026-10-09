// Only loaded by the isolated CI Next process. No application route is mocked.
if (process.env.GITHUB_ACTIONS !== 'true' || !process.env.AUD_ISOLATED_DIR) throw Error('isolated_ci_required');
const localOrigin = new URL(process.env.SUPABASE_URL).origin;
if (new URL(localOrigin).hostname !== '127.0.0.1') throw Error('cloud_runtime_forbidden');
const canonicalOrigin = 'https://btzukbfesxdratqnxuoj.supabase.co';
const gatewayUrl = canonicalOrigin + '/functions/v1/financial-app-db-gateway';
const originalFetch = globalThis.fetch;
function rewriteStorage(value) {
  if (typeof value === 'string' && value.startsWith(localOrigin + '/storage/v1/')) return canonicalOrigin + value.slice(localOrigin.length);
  if (Array.isArray(value)) return value.map(rewriteStorage);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewriteStorage(child)]));
  return value;
}
globalThis.fetch = async function isolatedFetch(input, init) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  let destination = url;
  const gateway = url.href === gatewayUrl;
  if (gateway) destination = new URL('http://127.0.0.1:54331');
  else if (url.origin === canonicalOrigin && url.pathname.startsWith('/storage/v1/')) destination = new URL(url.pathname + url.search, localOrigin);
  else if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('AUD_EXTERNAL_NETWORK_FORBIDDEN');
  const request = input instanceof Request ? new Request(destination, input) : destination;
  const response = await originalFetch(request, init);
  if (!gateway) return response;
  const body = rewriteStorage(await response.json());
  const headers = new Headers(response.headers);
  headers.delete('content-length'); headers.delete('content-encoding');
  return new Response(JSON.stringify(body), { status: response.status, headers });
};
