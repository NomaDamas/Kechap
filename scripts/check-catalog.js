import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const catalog = JSON.parse(await readFile(new URL('../catalog/providers.json', import.meta.url)));
assert.equal(catalog.schemaVersion, 1);
assert.ok(catalog.providers.length > 0);
const ids = new Set();
for (const p of catalog.providers) {
  assert.ok(p.id && !ids.has(p.id), `Duplicate/missing id: ${p.id}`); ids.add(p.id);
  assert.equal(new URL(p.sourceUrl).protocol, 'https:');
  assert.ok(p.license.status && p.sourceStatus && p.adapterStatus);
  assert.ok(p.stars === null || (Number.isInteger(p.stars) && p.stars >= 0));
  if (p.stars === null) assert.equal(p.over10k, null);
  else { assert.equal(p.over10k, p.stars >= 10000); assert.ok(p.starsCheckedAt); }
  if (p.sourceStatus === 'not-fetched') assert.notEqual(p.license.status, 'verified');
}
console.log(`${ids.size} unique catalog candidates; evidence invariants valid.`);
