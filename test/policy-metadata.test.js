import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {capabilities, recommend, recommendationProperties} from '../src/policy.js';
import {validateCatalogShape, checkCatalog} from '../scripts/check-catalog.js';

const catalog = JSON.parse(await readFile(new URL('../catalog/providers.json', import.meta.url)));
const clone = () => structuredClone(catalog);

test('formal schema validates current discovery, source, library and commercial evidence levels', async () => {
  assert.equal((await checkCatalog(catalog)).count, 50);
  assert.ok(catalog.providers.some(p => p.sourceStatus === 'not-fetched'));
  assert.ok(catalog.providers.some(p => p.sourceStatus === 'official-document-fetched'));
  assert.ok(catalog.providers.some(p => p.sourceStatus === 'source-reviewed'));
});

test('schema and invariants reject missing licenses, fake popularity and unknown fields', () => {
  for (const mutate of [
    c => {delete c.providers[0].license;},
    c => {c.providers[0].stars = null; c.providers[0].over10k = true;},
    c => {c.providers[0].over10k = true;},
    c => {c.providers.push(structuredClone(c.providers[0]));},
    c => {c.providers[0].surpriseApproval = true;},
    c => {c.providers[0].license.spdx = 'unknown';},
    c => {delete c.providers[0].upstreamRevision;},
    c => {c.providers[0].productionReady = true;},
  ]) {
    const copy = clone(); mutate(copy);
    assert.throws(() => validateCatalogShape(copy));
  }
});

test('catalog admission rejects credential-bearing and private sources without making network requests', () => {
  for (const sourceUrl of ['http://example.com', 'https://secret@example.com/repo', 'https://localhost/repo', 'https://127.0.0.1/repo', 'https://169.254.169.254/latest', 'https://10.0.0.1/repo']) {
    const copy = clone(); copy.providers[0].sourceUrl = sourceUrl;
    assert.throws(() => validateCatalogShape(copy));
  }
});

test('four product fixtures explain scope and never lower assurance to find a provider', () => {
  const contact = recommend({useCase: 'contact', framework: 'node-http', runtime: 'node', nodeMajor: 20});
  assert.ok(contact.candidates.length > 0);
  assert.ok(contact.candidates.every(p => p.licenseReview.status !== 'unknown'));
  const signup = recommend({useCase: 'signup', assurance: 'automation-cost', selfHosted: true, privacy: 'no-third-party', commercialUse: true});
  assert.deepEqual(signup.candidates.map(p => p.id), ['altcha', 'cap']);
  const reward = recommend({useCase: 'reward', monthlyTraffic: 10000, maxMonthlyCostUsd: 10});
  assert.equal(reward.requirements.assurance, 'uniqueness');
  assert.equal(reward.candidates.length, 0);
  assert.ok(reward.evaluations.every(p => p.reasons.includes('traffic-capacity-not-measured')));
  const recovery = recommend({useCase: 'account-recovery', dataRegion: 'KR', requiredAccessibility: ['non-puzzle-fallback']});
  assert.equal(recovery.requirements.assurance, 'identity');
  assert.equal(recovery.candidates.length, 0);
  assert.ok(recovery.evaluations.every(p => p.reasons.includes('data-region-not-verified') && p.reasons.includes('accessibility-non-puzzle-fallback-not-verified')));
});

test('commercial terms, capacity, total infrastructure cost and accessibility are not invented', () => {
  assert.equal(recommend({commercialUse: true}).candidates.length, 0);
  assert.equal(recommend({assurance: 'automation-cost', maxMonthlyCostUsd: 0}).candidates.length, 0);
  assert.equal(recommend({assurance: 'automation-cost', monthlyTraffic: 1}).candidates.length, 0);
  assert.equal(recommend({assurance: 'automation-cost', dataRegion: 'self-managed'}).candidates.length, 0);
  assert.equal(recommend({requiredAccessibility: ['keyboard']}).candidates.length, 0);
  assert.equal(recommend({framework: 'nextjs'}).candidates.length, 0);
  assert.equal(recommend({runtime: 'python'}).candidates.length, 0);
  assert.equal(recommend({nodeMajor: 18}).candidates.length, 0);
  assert.ok(capabilities.every(p => p.licenseReview && p.integration && p.accessibilityEvidence));
  for (const field of ['framework', 'runtime', 'dataRegion', 'privacy', 'monthlyTraffic', 'maxMonthlyCostUsd', 'commercialUse', 'requiredAccessibility']) assert.ok(recommendationProperties[field]);
});

test('popularity filters are separate from adoption and provide explicit no-relaxation guidance', () => {
  const unknown = recommend({minStars: 10000});
  assert.equal(unknown.candidates.length, 0);
  assert.ok(unknown.evaluations.some(p => p.reasons.includes('star-count-unverified')));
  assert.ok(unknown.constraintGuidance.some(message => message.includes('No requirement was relaxed')));
  const flexible = recommend({assurance: 'automation-cost', minStars: 5000});
  assert.deepEqual(flexible.candidates.map(p => p.id), ['cap']);
  assert.equal(flexible.candidates[0].status, 'integration-tested');
  assert.notEqual(flexible.candidates[0].evidenceScope, 'security-certified');
});

test('new requirement types reject malformed values', () => {
  for (const input of [{monthlyTraffic: -1}, {monthlyTraffic: Infinity}, {maxMonthlyCostUsd: NaN}, {commercialUse: 'true'}, {dataRegion: ''}, {privacy: 'gdpr-certified'}, {requiredAccessibility: ['ai-approved']}, {framework: false}, {runtime: {}}, {nodeMajor: '22'}]) assert.throws(() => recommend(input));
});
