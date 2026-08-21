import { readFile } from 'node:fs/promises';

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const smokeAttempts = Number(process.env.SMOKE_ATTEMPTS || 40);
const smokeIntervalMs = Number(process.env.SMOKE_INTERVAL_MS || 250);
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const expectedVersion = packageJson.version;

const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-robots-tag': 'noindex, nofollow, noarchive',
};

function assert(condition, message) { if (!condition) throw new Error(message); }
async function request(path, options = {}) { return fetch(new URL(path, baseUrl), { redirect: 'manual', ...options }); }
function assertSecurity(response, path) {
  for (const [name, expected] of Object.entries(securityHeaders)) {
    const actual = response.headers.get(name);
    assert(actual === expected, `${path}: ${name}=${JSON.stringify(actual)}; esperado ${JSON.stringify(expected)}`);
  }
  assert(!response.headers.has('x-powered-by'), `${path}: no debe exponer X-Powered-By`);
}
async function waitForServer() {
  let lastError;
  for (let attempt = 1; attempt <= smokeAttempts; attempt += 1) {
    try {
      const response = await request('/api/health');
      if (response.ok) {
        const body = await response.json();
        if (body.version === expectedVersion) return;
        lastError = new Error(`La aplicación responde como ${body.version}; esperando ${expectedVersion}`);
      }
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, smokeIntervalMs));
  }
  throw lastError || new Error('El servidor compilado no respondió a tiempo');
}
async function assertPrivateRedirect(path) {
  const response = await request(path);
  assert([307, 308].includes(response.status), `${path}: esperado redirect 307/308 sin sesión; recibido ${response.status}`);
  assertSecurity(response, path);
  const location = response.headers.get('location');
  assert(location, `${path}: redirect sin cabecera Location`);
  const redirect = new URL(location, baseUrl);
  assert(redirect.pathname === '/login', `${path}: debe redirigir a /login, recibido ${redirect.pathname}`);
  if (path !== '/') assert(redirect.searchParams.get('next') === path, `${path}: parámetro next incorrecto: ${redirect.searchParams.get('next')}`);
}

await waitForServer();
const health = await request('/api/health');
assert(health.status === 200, `/api/health: esperado 200, recibido ${health.status}`);
assertSecurity(health, '/api/health');
const healthBody = await health.json();
assert(healthBody.ok === true, '/api/health: ok debe ser true');
assert(healthBody.application === 'Finanzas 3.0', '/api/health: aplicación inesperada');
assert(healthBody.version === expectedVersion, `/api/health: versión ${healthBody.version}; esperada ${expectedVersion}`);

await assertPrivateRedirect('/');
for (const path of [
  '/movimientos?smoke=1','/informes?year=2026','/presupuestos?month=2026-08','/revision','/cierre?month=2026-07','/reglas','/explicabilidad','/control','/copias',
  '/api/private/backup','/api/private/budget','/api/private/future-event','/api/private/goal','/api/private/month-closure','/api/private/movement','/api/private/recurring','/api/private/rule','/api/private/rule-preview','/api/private/system-audit','/api/private/scenario','/api/private/split','/api/sync/status',
]) await assertPrivateRedirect(path);

const login = await request('/login');
assert(login.status === 200, `/login: esperado 200, recibido ${login.status}`);
assertSecurity(login, '/login');
const loginHtml = await login.text();
assert(loginHtml.includes('Finanzas 3.0'), '/login: falta identidad de aplicación');
assert(loginHtml.includes('Clave de acceso'), '/login: falta el campo de acceso esperado');
assert(!loginHtml.includes('BAILOUT_TO_CLIENT_SIDE_RENDERING'), '/login: no debe depender de bailout a renderizado cliente');

const manifest = await request('/manifest.webmanifest');
assert(manifest.status === 200, `/manifest.webmanifest: esperado 200, recibido ${manifest.status}`);
assertSecurity(manifest, '/manifest.webmanifest');
const manifestBody = await manifest.json();
assert(manifestBody.name === 'Finanzas 3.0', '/manifest.webmanifest: nombre inesperado');
assert(manifestBody.start_url === '/', '/manifest.webmanifest: start_url inesperado');
assert(Array.isArray(manifestBody.icons) && manifestBody.icons.some((icon) => icon.src === '/icon.svg'), '/manifest.webmanifest: icon.svg no declarado');

const icon = await request('/icon.svg');
assert(icon.status === 200, `/icon.svg: esperado 200, recibido ${icon.status}`);
assertSecurity(icon, '/icon.svg');
assert((icon.headers.get('content-type') || '').includes('image/svg+xml'), `/icon.svg: content-type inesperado ${icon.headers.get('content-type')}`);

const robots = await request('/robots.txt');
assert(robots.status === 200, `/robots.txt: esperado 200, recibido ${robots.status}`);
assertSecurity(robots, '/robots.txt');
const robotsText = await robots.text();
assert(robotsText.includes('Disallow: /'), '/robots.txt: debe bloquear indexación completa');
console.log(`Smoke built-app OK — Finanzas 3.0 ${expectedVersion}`);
