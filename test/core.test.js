import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Kechap, MemoryStore, powAdapter, siteverifyAdapter, recommend, selectProvider} from '../src/index.js';
import {handle} from '../src/mcp.js';

const context = {tenant: 't', action: 'signup', subject: 'session'};
function setup() {
  let time = 1000;
  const now = () => time;
  const kechap = new Kechap({now, store: new MemoryStore({now}), ttlMs: 100, attestationTtlMs: 50, adapters: {pow: powAdapter({difficulty: 1})}});
  return {kechap, advance: ms => {time += ms;}};
}
const issue = k => k.issue({context, sessionId: 's', providers: ['pow'], assurance: 'automation-cost'});
function solve(c) {
  for (let i = 0; ; i++) if (createHash('sha256').update(`${c.challenge.salt}:${i}`).digest('hex').startsWith('0'.repeat(c.challenge.difficulty))) return String(i);
}
test('proof and attestation are each single-use even under concurrent replay', async () => {
  const {kechap: k} = setup(); const c = await issue(k);
  const results = await Promise.all([1, 2].map(() => k.verify({id: c.id, context, response: solve(c)})));
  assert.equal(results.filter(r => r.ok).length, 1);
  const token = results.find(r => r.ok).token;
  const consumes = await Promise.all([1, 2].map(() => k.consume({token, context})));
  assert.equal(consumes.filter(r => r.ok).length, 1);
});
test('expired challenges and attestations fail', async () => {
  const {kechap: k, advance} = setup(); const c = await issue(k); advance(101);
  assert.equal((await k.verify({id: c.id, context, response: solve(c)})).ok, false);
  const c2 = await issue(k); const v = await k.verify({id: c2.id, context, response: solve(c2)}); advance(51);
  assert.equal((await k.consume({token: v.token, context})).ok, false);
});
test('default store uses the SDK clock', async () => {
  const k = new Kechap({now: () => 1000, adapters: {pow: powAdapter({difficulty: 1})}});
  const c = await issue(k);
  assert.equal((await k.verify({id: c.id, context, response: solve(c)})).ok, true);
});
test('binding prevents cross-tenant/action/subject use and failed attempts burn challenge', async () => {
  for (const key of ['tenant', 'action', 'subject']) {
    const {kechap: k} = setup(); const c = await issue(k);
    assert.equal((await k.verify({id: c.id, context: {...context, [key]: 'other'}, response: solve(c)})).ok, false);
    assert.equal((await k.verify({id: c.id, context, response: solve(c)})).ok, false);
    const c2 = await issue(k); const v = await k.verify({id: c2.id, context, response: solve(c2)});
    assert.equal((await k.consume({token: v.token, context: {...context, [key]: 'other'}})).ok, false);
  }
});
test('invalid answer fails and cannot be retried', async () => {
  const {kechap: k} = setup(); const c = await issue(k);
  assert.equal((await k.verify({id: c.id, context, response: '../bad'})).ok, false);
  assert.equal((await k.verify({id: c.id, context, response: solve(c)})).ok, false);
});
test('rotation cannot downgrade assurance', async () => {
  const {kechap: k} = setup();
  await assert.rejects(k.issue({context, sessionId: 's', providers: ['pow'], assurance: 'liveness'}));
  assert.equal(recommend({selfHosted: true}).candidates.length, 0);
  assert.equal(recommend({assurance: 'uniqueness'}).candidates.length, 0);
  assert.equal(selectProvider({providers: ['a', 'b'], sessionId: 's', mode: 'rotate', previous: 'a'}), 'b');
});
test('official verification enforces hostname, action, score and timeout failure', async () => {
  const make = (data, extra = {}) => siteverifyAdapter({provider: 'recaptcha', recaptchaMode: 'v3', siteKey: 'public', secret: 'server-only', hostname: 'example.com', action: 'signup', minScore: 0.7, fetchImpl: async (url, opts) => {
    assert.match(url, /^https:\/\/www.google.com\//); assert.equal(opts.body.get('secret'), 'server-only');
    return {ok: true, json: async () => data};
  }, ...extra});
  const valid = {success: true, hostname: 'example.com', action: 'signup', score: 0.9};
  assert.equal(await make(valid).verify({response: 'token'}), true);
  for (const patch of [{hostname: 'attacker.com'}, {action: 'login'}, {score: 0.1}, {score: undefined}, {success: false}]) assert.equal(await make({...valid, ...patch}).verify({response: 't'}), false);
  await assert.rejects(make(valid, {fetchImpl: async () => {throw new Error('offline');}}).verify({response: 't'}), /unavailable/);
  assert.equal(JSON.stringify(await make(valid).issue()).includes('server-only'), false);
});
test('provider config rejects inherited names and unsafe reCAPTCHA v3', () => {
  const config = {secret: 'secret', siteKey: 'public', hostname: 'example.com'};
  assert.throws(() => siteverifyAdapter({...config, provider: 'toString'}));
  assert.throws(() => siteverifyAdapter({...config, provider: 'recaptcha'}));
  assert.throws(() => siteverifyAdapter({...config, provider: 'recaptcha', recaptchaMode: 'v3', action: 'signup'}));
  assert.throws(() => siteverifyAdapter({...config, provider: 'hcaptcha', siteKey: '10000000-ffff-ffff-ffff-000000000001'}), /testMode/);
  assert.doesNotThrow(() => siteverifyAdapter({...config, provider: 'hcaptcha', siteKey: '10000000-ffff-ffff-ffff-000000000001', testMode: true}));
});
test('Turnstile proof must echo this challenge cData', async () => {
  let result;
  const adapter = siteverifyAdapter({provider: 'turnstile', secret: 'secret', siteKey: 'public', hostname: 'example.com', fetchImpl: async () => ({ok: true, json: async () => result})});
  const first = await adapter.issue(); const second = await adapter.issue();
  result = {success: true, hostname: 'example.com', cdata: first.public.cData};
  assert.equal(await adapter.verify({response: 'token', state: first.private}), true);
  assert.equal(await adapter.verify({response: 'token', state: second.private}), false);
});
test('expiry while upstream verification is in flight fails closed', async () => {
  let time = 1000;
  const k = new Kechap({now: () => time, ttlMs: 10, adapters: {x: {assurance: 'liveness', issue: async () => ({public: {}, private: {}}), verify: async () => {time += 11; return true;}}}});
  const c = await k.issue({context, providers: ['x'], assurance: 'liveness', sessionId: 's'});
  assert.deepEqual(await k.verify({id: c.id, context, response: 'x'}), {ok: false});
});
test('adapter exceptions fail closed', async () => {
  const k = new Kechap({adapters: {x: {assurance: 'liveness', issue: async () => ({public: {}, private: {}}), verify: async () => {throw new Error('down');}}}});
  const c = await k.issue({context, providers: ['x'], assurance: 'liveness', sessionId: 's'});
  assert.deepEqual(await k.verify({id: c.id, context, response: 'x'}), {ok: false});
});
test('MCP initialize, discovery, tools and malformed calls', async () => {
  const call = (method, params) => handle({jsonrpc: '2.0', id: 1, method, params});
  assert.equal((await call('initialize', {protocolVersion: '2025-03-26'})).result.protocolVersion, '2025-03-26');
  assert.equal((await call('tools/list')).result.tools.length, 5);
  const scaffold = await call('tools/call', {name: 'kechap_scaffold', arguments: {provider: 'pow'}});
  assert.ok(JSON.parse(scaffold.result.content[0].text).files['examples/web/server.js']);
  assert.equal((await call('tools/call', {name: 'kechap_recommend', arguments: {assurance: 'identity'}})).result.isError, undefined);
  assert.equal((await call('tools/call', {name: 'kechap_plan', arguments: {selfHosted: 'yes'}})).result.isError, true);
  assert.equal((await call('tools/call', {name: 'unknown'})).result.isError, true);
  assert.equal((await call('unknown')).error.code, -32601);
  assert.equal(await handle({jsonrpc: '2.0', method: 'notifications/initialized'}), null);
});
