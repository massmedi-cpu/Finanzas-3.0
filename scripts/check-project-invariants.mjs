import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const versionSource = readFileSync('src/version.ts', 'utf8');

assert.equal(lock.lockfileVersion, 3, 'El lockfile debe ser npm lockfileVersion 3');
assert.equal(lock.packages?.['']?.version, pkg.version, 'package-lock y package.json deben compartir versión');
assert.ok(versionSource.includes(`APP_VERSION = '${pkg.version}'`) || versionSource.includes(`APP_VERSION = "${pkg.version}"`), 'src/version.ts debe coincidir con package.json');

for (const [name, value] of Object.entries({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) })) {
  assert.notEqual(value, 'latest', `La dependencia ${name} no puede volver a usar latest`);
}

const requiredFiles = [
  'docs/PROJECT_AXIOMS.md',
  'docs/ARCHITECTURE.md',
  'docs/REQUIREMENTS_TRACEABILITY.md',
  'docs/PROJECT_CHANGELOG.md',
  'docs/DESIGN_SYSTEM.md',
  'docs/TEST_MATRIX.md',
  'docs/RELEASE_GATE_V2.0.1.md',
  'database/schema-v2.0.1.sql',
  'supabase/functions/finanzas-v3-bridge/index.ts',
  'supabase/functions/finanzas-v3-data/index.ts',
  'supabase/functions/finanzas-v3-recurring/index.ts',
  'supabase/functions/finanzas-v3-splits/index.ts',
];

for (const file of requiredFiles) assert.equal(existsSync(file), true, `Falta artefacto canónico: ${file}`);
assert.equal(existsSync('Finanzas-Alberto-3.0-V0.2.0.zip'), false, 'No deben quedar ZIP históricos en el árbol activo');
assert.equal(existsSync('develop/v1.1.0/src/domain/dashboard.ts'), false, 'No debe quedar código histórico V1.1.0 mezclado en el árbol activo');

console.log('Project invariants: OK');
