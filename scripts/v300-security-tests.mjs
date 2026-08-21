import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hardenedFunctions = [
  'supabase/functions/finanzas-v3-data/index.ts',
  'supabase/functions/finanzas-v3-recurring/index.ts',
  'supabase/functions/finanzas-v3-splits/index.ts',
];

for (const file of hardenedFunctions) {
  const source = readFileSync(file, 'utf8');
  assert.equal(source.includes('response.status !== 401 && response.status !== 403'), false, `${file}: no puede aceptar respuestas arbitrarias del probe`);
  assert.equal(source.includes('response.ok || response.status === 404'), true, `${file}: debe aceptar únicamente 2xx o el 404 autenticado del probe legado`);
  assert.equal(source.includes('catch {\n    return false;\n  }'), true, `${file}: un fallo de red/autenticación debe cerrar el acceso`);
}

const normalized = readFileSync('supabase/functions/finanzas-v3-normalized/index.ts', 'utf8');
assert.equal(normalized.includes('response.ok || response.status === 404'), true, 'Normalized debe conservar autorización fail-closed');

console.log('V3.0 security regression tests: OK');
