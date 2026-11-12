import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import Ajv from 'ajv';

const schema = JSON.parse(await readFile(new URL('../catalog/provider.schema.json', import.meta.url)));
const validator = new Ajv({allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true}).compile(schema);

export function validateCatalogShape(catalog) {
  assert.ok(validator(catalog), `Catalog schema invalid: ${JSON.stringify(validator.errors)}`);
  const ids = new Set();
  for (const p of catalog.providers) {
    assert.ok(!ids.has(p.id), `Duplicate id: ${p.id}`); ids.add(p.id);
    for (const source of [p.sourceUrl, p.docsUrl, p.license.evidenceUrl].filter(Boolean)) {
      const url = new URL(source);
      assert.equal(url.protocol, 'https:', `Only public HTTPS sources: ${p.id}`);
      assert.ok(!url.username && !url.password, `Credential-bearing source rejected: ${p.id}`);
      assert.ok(!['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(url.hostname) && !/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname), `Private endpoint rejected: ${p.id}`);
    }
    if (p.stars !== null) assert.equal(p.over10k, p.stars >= 10000, `Threshold mismatch: ${p.id}`);
    if (p.sourceStatus === 'not-fetched') assert.ok(!['approved', 'source-inspected'].includes(p.license.status), `Unfetched license cannot be approved: ${p.id}`);
    if (p.productionReady) assert.equal(p.approval.revision, p.upstreamRevision, `Approval revision mismatch: ${p.id}`);
  }
  return {count: ids.size};
}

export async function checkCatalog(catalog) {
  const result = validateCatalogShape(catalog);
  for (const p of catalog.providers) {
    if (p.sourceStatus === 'source-reviewed') {
      const evidence = JSON.parse(await readFile(new URL('../' + p.evidenceFile, import.meta.url), 'utf8'));
      assert.equal(evidence.revision, p.upstreamRevision, `Revision mismatch: ${p.id}`);
      assert.equal(evidence.stars, p.stars, `Stars mismatch: ${p.id}`);
      assert.equal(evidence.fetchedAt, p.starsCheckedAt, `Timestamp mismatch: ${p.id}`);
    }
    if (p.sourceStatus === 'official-document-fetched') {
      const evidence = JSON.parse(await readFile(new URL('../' + p.evidenceFile, import.meta.url), 'utf8'));
      assert.ok(evidence.url && evidence.fetchedAt, `Official source evidence missing: ${p.id}`);
    }
  }
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const catalog = JSON.parse(await readFile(new URL('../catalog/providers.json', import.meta.url)));
  const {count} = await checkCatalog(catalog);
  console.log(`${count} unique catalog candidates; JSON schema and evidence invariants valid.`);
}
