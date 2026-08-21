import { readFile } from 'node:fs/promises';

const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
const expectedVersion = packageJson.version;

const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-robots-tag': 'noindex, nofollow, noarchive',
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  return fetch(new URL(path, baseUrl), {
    redirect: 'manual',
    ...options,
  });
}

function assertSecurity(response, path) {
  for (const [name, expected] of Object.entries(securityHeaders)) {
    const actual = response.headers.get(name);
    assert(actual === expected, `${path}: ${name}=${JSON.stringify(actual)}; esperado ${JSON.stringify(expected)}`);
  }
  assert(!response.headers.has('x-powered-by'), `${path}: no debe exponer X-Powered-By`);
}

async function waitForServer() {
  let lastError;
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      const response = await request('/api/health');
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError || new Error('El servidor compilado no respondió a tiempo');
}

await waitForServer();

const health = await request('/api/health');
assert(health.status === 200, `/api/health: esperado 200, recibido ${health.status}`);
assertSecurity(health, '/api/health');
const healthBody = await health.json();
assert(healthBody.ok === true, '/api/health: ok debe ser true');
assert(healthBody.application === 'Finanzas 3.0', '/api/health: aplicación inesperada');
assert(healthBody.version === expectedVersion, `/api/health: versión ${healthBody.version}; esperada ${expectedVersion}`);

const root = await request('/');
assert([307, 308].includes(root.status), `/: esperado redirect 307/308 sin sesión; recibido ${root.status}`);
assertSecurity(root, '/');
const rootLocation = root.headers.get('location');
assert(rootLocation, '/: redirect sin cabecera Location');
const rootRedirect = new URL(rootLocation, baseUrl);
assert(rootRedirect.pathname === '/login', `/: debe redirigir a /login, recibido ${rootRedirect.pathname}`);

const privateRoute = await request('/movimientos?smoke=1');
assert([307, 308].includes(privateRoute.status), `/movimientos: esperado redirect 307/308 sin sesión; recibido ${privateRoute.status}`);
assertSecurity(privateRoute, '/movimientos');
const privateLocation = privateRoute.headers.get('location');
assert(privateLocation, '/movimientos: redirect sin cabecera Location');
const privateRedirect = new URL(privateLocation, baseUrl);
assert(privateRedirect.pathname === '/login', `/movimientos: debe redirigir a /login, recibido ${privateRedirect.pathname}`);
assert(privateRedirect.searchParams.get('next') === '/movimientos?smoke=1', `/movimientos: parámetro next incorrecto: ${privateRedirect.searchParams.get('next')}`);

const login = await request('/login');
assert(login.status === 200, `/login: esperado 200, recibido ${login.status}`);
assertSecurity(login, '/login');
const loginHtml = await login.text();
assert(loginHtml.includes('Finanzas 3.0'), '/login: falta identidad de aplicación');
assert(loginHtml.includes('Clave de acceso'), '/login: falta el campo de acceso esperado');

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
