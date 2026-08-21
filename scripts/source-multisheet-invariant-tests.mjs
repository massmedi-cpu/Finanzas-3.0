import fs from 'node:fs';

const source = fs.readFileSync('supabase/functions/finanzas-v3-bridge/index.ts', 'utf8');
const start = source.indexOf('function parseRows(bytes: Uint8Array) {');
const end = source.indexOf('\nfunction bearer(req: Request)', start);
if (start < 0 || end < 0) throw new Error('parseRows block not found');
const parser = source.slice(start, end);

if (!source.includes('const VERSION = 5;')) throw new Error('bridge version 5 missing');
if (!parser.includes('const sheetNames: string[] = []')) throw new Error('multi-sheet aggregation missing');
if (!parser.includes('bySourceId.set(parsed.sourceId, parsed)')) throw new Error('sourceId merge missing');
if (!parser.includes('source_duplicate_id_conflict')) throw new Error('duplicate conflict guard missing');
if (parser.includes('parsedRows = rows.slice(1); break')) throw new Error('legacy first-sheet break still present');
if (!parser.includes(String.raw`/(?:<)(?:\w+:)?row\b`.slice(5))) {
  // The parser must contain the normal XML row regex with a single regex escape.
  if (!parser.includes(String.raw`(?:\w+:)?row\b`)) throw new Error('row regex invalid');
}
if (!parser.includes(String.raw`(?:\w+:)?c\b`)) throw new Error('cell regex invalid');
if (!source.includes('grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer"')) throw new Error('Google OAuth grant changed');

console.log('source multisheet invariants: OK');
