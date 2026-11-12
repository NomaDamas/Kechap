import test from 'node:test';
import assert from 'node:assert/strict';
import {recommend, resolvePolicy, Kechap} from '../src/index.js';
import {handle} from '../src/mcp.js';

test('product requirements do not confuse signup, rewards and recovery', () => {
  assert.ok(recommend({useCase: 'contact'}).candidates.some(c => c.id === 'turnstile'));
  assert.equal(recommend({useCase: 'signup', noThirdParty: true}).candidates.length, 0);
  assert.equal(recommend({useCase: 'reward'}).requirements.assurance, 'uniqueness');
  assert.equal(recommend({useCase: 'reward'}).recommendationStatus, 'unmet-requirements');
  assert.equal(recommend({useCase: 'account-recovery'}).requirements.assurance, 'identity');
  const pow = recommend({selfHosted: true, assurance: 'automation-cost', allowExperimental: true});
  assert.ok(pow.candidates.some(c => c.id === 'pow'));
  assert.ok(pow.evaluations.find(c => c.provider === 'turnstile').reasons.includes('third-party-service-required'));
});
test('unverified stars, modalities and integration evidence never pass required filters', () => {
  assert.equal(recommend({minStars: 10000}).candidates.length, 0);
  assert.equal(recommend({requireLiveEvidence: true}).candidates.length, 0);
  assert.deepEqual(recommend({assurance: 'automation-cost', selfHosted: true, requireLiveEvidence: true}).candidates.map(p => p.id), ['altcha', 'cap']);
  assert.equal(recommend({requiredModalities: ['camera']}).candidates.length, 0);
  assert.throws(() => recommend({selfHosted: 'false'}));
  assert.throws(() => recommend({budget: 10}), /Unknown requirement/);
  assert.throws(() => recommend({minStars: -1}));
  assert.throws(() => recommend({exclude: [false]}));
});
const policy = () => ({version: 'v1', actions: {signup: {normal: {assurance: 'bot-mitigation', providers: [{id: 'a', weight: 1}, {id: 'b', weight: 4}], mode: 'weighted'}}}});
const args = () => ({policy: policy(), action: 'signup', risk: 'normal', sessionId: 'server-session'});
test('weighted policy is stable, respects health, never switches to weaker fallback', () => {
  assert.deepEqual(resolvePolicy(args()), resolvePolicy(args()));
  assert.equal(resolvePolicy({...args(), health: {a: false}}).provider, 'b');
  assert.throws(() => resolvePolicy({...args(), health: {a: false, b: false}}), /No healthy/);
  assert.throws(() => resolvePolicy({...args(), requiredAssurance: 'liveness'}), /assurance/);
  assert.throws(() => resolvePolicy({...args(), risk: 'attacker-controlled'}), /Risk tier/);
  assert.throws(() => resolvePolicy({...args(), health: {a: 'healthy'}}));
  const counts = {a: 0, b: 0};
  for (let n = 0; n < 1000; n++) counts[resolvePolicy({...args(), sessionId: `s${n}`}).provider]++;
  assert.ok(counts.b > counts.a * 2 && counts.a > 0);
});
test('policy version and original provider survive policy changes after issuance', async () => {
  const a = {assurance: 'bot-mitigation', issue: async () => ({public: {}, private: {}}), verify: async ({response}) => response === 'a'};
  const b = {...a, verify: async ({response}) => response === 'b'};
  const k = new Kechap({adapters: {a, b}});
  const original = policy();
  const context = {tenant: 't', action: 'signup', subject: 's'};
  const c = await k.issueWithPolicy({context, sessionId: 's', policy: original, risk: 'normal', health: {a: true, b: false}});
  original.version = 'v2'; original.actions.signup.normal.providers = [{id: 'b'}];
  const v = await k.verify({id: c.id, context, response: 'a'});
  assert.equal(v.ok, true); assert.equal(v.policyVersion, 'v1'); assert.equal(v.provider, 'a');
  const consumed = await k.consume({token: v.token, context});
  assert.equal(consumed.policyVersion, 'v1');
  const other = await k.issueWithPolicy({context, sessionId: 's', policy: original, risk: 'normal'});
  assert.equal(other.provider, 'b');
  assert.equal((await k.verify({id: other.id, context, response: 'a'})).ok, false);
});
test('policy rejects even unhealthy weaker providers in the configured set', async () => {
  const k = new Kechap({adapters: {a: {assurance: 'bot-mitigation'}, b: {assurance: 'automation-cost'}}});
  await assert.rejects(k.issueWithPolicy({context: {tenant: 't', action: 'signup', subject: 's'}, sessionId: 's', policy: policy(), risk: 'normal', health: {b: false}}), /weaker provider/);
});
test('MCP recommendation exposes unmet star threshold and explanations', async () => {
  const response = await handle({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'kechap_recommend', arguments: {useCase: 'signup', minStars: 10000}}});
  const result = JSON.parse(response.result.content[0].text);
  assert.equal(result.recommendationStatus, 'unmet-requirements');
  assert.ok(result.evaluations.some(p => p.reasons.includes('star-count-unverified')));
});
