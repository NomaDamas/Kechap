import test from 'node:test';
import assert from 'node:assert/strict';
import {worldIdAdapter} from '../src/personhood.js';

const context = {tenant: 'owned-test', action: 'claim-reward', subject: 'session'};
const options = () => ({enabled: true, appId: 'app_owned_fixture', rpId: 'rp_owned_fixture', action: 'monthly-reward', signingKey: 'ab'.repeat(32), environment: 'sandbox', privacyPolicy: {consentVersion: 'v1', noticeUrl: 'https://product.example/privacy', fallback: 'Product-owned assisted review; same reward eligibility rules', permittedRegions: ['KR'], nullifierRetentionDays: 30}, checkConsent: async () => ({granted: true, version: 'v1', region: 'KR'}), claimNullifier: async () => true});
const payload = state => ({protocol_version: '4.0', nonce: state.nonce, action: 'monthly-reward', environment: 'sandbox', responses: [{identifier: 'proof_of_human', issuer_schema_id: 1, nullifier: '0x01', expires_at_min: 49012345, proof: ['0x1', '0x2', '0x3', '0x4', '0x5'], signal_hash: '0x0'}]});
const validResult = () => ({success: true, environment: 'sandbox', action: 'monthly-reward', results: [{identifier: 'proof_of_human', success: true, nullifier: '0x0001'}]});
const reply = result => ({ok: true, json: async () => result});

test('personhood is disabled by default and never silently activated', async () => {
  const adapter = worldIdAdapter();
  assert.equal(adapter.enabled, false); assert.equal(adapter.assurance, 'uniqueness');
  await assert.rejects(adapter.issue(), /disabled/);
  assert.equal(await adapter.verify(), false);
});
test('personhood configuration requires real scope, policy and production opt-in', () => {
  assert.throws(() => worldIdAdapter({enabled: true}));
  assert.throws(() => worldIdAdapter({...options(), environment: 'production'}));
  assert.throws(() => worldIdAdapter({...options(), checkConsent: null}));
  assert.throws(() => worldIdAdapter({...options(), claimNullifier: null}));
  assert.throws(() => worldIdAdapter({...options(), privacyPolicy: {...options().privacyPolicy, nullifierRetentionDays: 0}}));
});
test('official signing helper creates nonce/action-bound public context without private key', async () => {
  const config = options(), adapter = worldIdAdapter(config);
  const first = await adapter.issue({context}), second = await adapter.issue({context});
  assert.notEqual(first.public.rp_context.nonce, second.public.rp_context.nonce);
  assert.match(first.public.rp_context.signature, /^0x[0-9a-f]{130}$/);
  assert.equal(JSON.stringify(first).includes(config.signingKey), false);
  assert.equal(first.public.testOnly, true);
  assert.equal(first.public.privacy.rawBiometricsCollected, false);
});
test('valid mocked official response needs matching scope/environment and atomic canonical nullifier', async () => {
  const seen = new Set(); let request, claimed;
  const adapter = worldIdAdapter({...options(), fetchImpl: async (url, init) => {request = {url, init}; return reply(validResult());}, claimNullifier: async record => {claimed = record; const key = record.namespace + record.nullifier; if (seen.has(key)) return false; seen.add(key); return true;}});
  const issued = await adapter.issue({context}); const response = JSON.stringify(payload(issued.private));
  assert.equal(await adapter.verify({response, state: issued.private, context}), true);
  assert.equal(request.url, 'https://developer.world.org/api/v4/verify/rp_owned_fixture');
  assert.equal(request.init.body, response); assert.equal(request.init.redirect, 'error');
  assert.equal(claimed.nullifier, '1');
  const another = await adapter.issue({context});
  assert.equal(await adapter.verify({response: JSON.stringify(payload(another.private)), state: another.private, context}), false);
});
test('wrong nonce/action/environment/issuer/subject and raw-biometric payloads fail before upstream', async () => {
  let calls = 0;
  const adapter = worldIdAdapter({...options(), fetchImpl: async () => {calls++; return reply(validResult());}});
  const issued = await adapter.issue({context});
  const modifications = [p => {p.nonce = '0x0';}, p => {p.action = 'different';}, p => {p.environment = 'production';}, p => {p.responses[0].issuer_schema_id = 11;}, p => {p.responses[0].identifier = 'selfie';}, p => {p.cameraFrame = 'private';}, p => {p.responses[0].biometric = 'raw';}, p => {p.responses[0].proof = ['0x1'];}, p => {p.responses[0].nullifier = '0xnot-hex';}];
  for (const mutate of modifications) {const value = payload(issued.private); mutate(value); assert.equal(await adapter.verify({response: JSON.stringify(value), state: issued.private, context}), false);}
  assert.equal(await adapter.verify({response: JSON.stringify(payload(issued.private)), state: issued.private, context: {...context, subject: 'other'}}), false);
  assert.equal(calls, 0);
});
test('upstream partial success, mismatch, exceptions, malformed data and revoked consent fail closed', async () => {
  for (const result of [{success: true, environment: 'sandbox', action: 'monthly-reward', results: [{identifier: 'selfie', success: true, nullifier: '0x1'}]}, {...validResult(), environment: 'production'}, {...validResult(), action: 'other'}, {...validResult(), success: false}, null]) {
    let claims = 0;
    const adapter = worldIdAdapter({...options(), fetchImpl: async () => reply(result), claimNullifier: async () => {claims++; return true;}});
    const issued = await adapter.issue({context});
    assert.equal(await adapter.verify({response: JSON.stringify(payload(issued.private)), state: issued.private, context}), false); assert.equal(claims, 0);
  }
  let granted = true;
  const adapter = worldIdAdapter({...options(), checkConsent: async () => ({granted, version: 'v1', region: 'KR'}), fetchImpl: async () => {throw new Error('timeout');}});
  const issued = await adapter.issue({context});
  assert.equal(await adapter.verify({response: JSON.stringify(payload(issued.private)), state: issued.private, context}), false);
  granted = false;
  assert.equal(await adapter.verify({response: JSON.stringify(payload(issued.private)), state: issued.private, context}), false);
  await assert.rejects(adapter.issue({context}), /consent/);
});
test('region and signed request expiry are enforced without interpreting success as global uniqueness', async () => {
  const denied = worldIdAdapter({...options(), checkConsent: async () => ({granted: true, version: 'v1', region: 'US'})});
  await assert.rejects(denied.issue({context}), /approved region/);
  let clock = Date.now(); let calls = 0;
  const adapter = worldIdAdapter({...options(), now: () => clock, fetchImpl: async () => {calls++; return reply(validResult());}});
  const issued = await adapter.issue({context}); clock += 121000;
  assert.equal(await adapter.verify({response: JSON.stringify(payload(issued.private)), state: issued.private, context}), false);
  assert.equal(calls, 0);
});
