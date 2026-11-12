import test from 'node:test';
import assert from 'node:assert/strict';
import {createMetrics, createCircuitBreaker, safeObserver} from '../src/observability.js';
import {Kechap, siteverifyAdapter} from '../src/index.js';

test('operational failures stay in the denominator and never count as successful verification', () => {
  const metrics = createMetrics({providers: ['turnstile'], maxLatencySamples: 3});
  for (const [outcome, durationMs] of [['success', 10], ['rejected', 20], ['error', 5000], ['error', 5001]]) metrics.observe({operation: 'verify', outcome, provider: 'turnstile', durationMs});
  const row = metrics.snapshot().rows.find(r => r.provider === 'turnstile' && r.operation === 'verify');
  assert.equal(row.total, 4); assert.deepEqual(row.outcomes, {success: 1, rejected: 1, error: 2});
  assert.equal(row.successRate, 0.25); assert.equal(row.latency.sampleCount, 3);
  assert.equal(row.latency.p50Ms, 5000); assert.equal(row.latency.p95Ms, 5001);
});

test('metric cardinality and serialized data are bounded even with attacker-controlled labels and extra secrets', () => {
  const metrics = createMetrics({providers: ['a'], maxLatencySamples: 4});
  for (let i = 0; i < 2000; i++) metrics.observe({operation: 'verify', outcome: 'rejected', provider: `untrusted-${i}`, durationMs: i, token: 'MUST_NOT_APPEAR', secret: 'MUST_NOT_APPEAR', context: {subject: 'MUST_NOT_APPEAR'}, policyVersion: `unbounded-${i}`});
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.rows.length, 8);
  assert.equal(snapshot.rows.find(r => r.provider === 'unknown' && r.operation === 'verify').total, 2000);
  assert.equal(snapshot.rows.find(r => r.provider === 'unknown' && r.operation === 'verify').latency.sampleCount, 4);
  assert.equal(JSON.stringify(snapshot).includes('MUST_NOT_APPEAR'), false);
  assert.equal(JSON.stringify(snapshot).includes('untrusted-'), false);
  assert.equal(JSON.stringify(snapshot).includes('unbounded-'), false);
  metrics.observe({operation: 'verify', outcome: 'success', provider: 'a', durationMs: NaN});
  metrics.observe({operation: 'arbitrary', outcome: 'success', provider: 'a', durationMs: 1});
  assert.equal(metrics.snapshot().droppedEvents, 2);
  snapshot.rows[0].outcomes.success = 99999;
  assert.equal(metrics.snapshot().rows[0].outcomes.success, 0);
});

test('fallback choice counters are distinct from verified authentication', () => {
  const metrics = createMetrics({providers: ['a', 'b']});
  metrics.recordFallback({provider: 'b', reason: 'outage'});
  metrics.recordFallback({provider: 'b', reason: 'retry'});
  assert.equal(metrics.snapshot().rows.find(r => r.provider === 'b' && r.operation === 'verify').total, 0);
  assert.deepEqual(metrics.snapshot().fallbacks.find(r => r.provider === 'b').reasons, {outage: 1, policy: 0, retry: 1});
  assert.throws(() => metrics.recordFallback({provider: 'b', reason: 'user-session-id'}));
  metrics.reset(); assert.ok(metrics.snapshot().rows.every(r => r.total === 0));
});

test('observer exceptions and rejected promises are isolated without exposing mutable event references', async () => {
  const event = {operation: 'verify', outcome: 'success', provider: 'a', durationMs: 10};
  const sync = safeObserver(observed => {observed.outcome = 'rejected'; throw new Error('collector down');});
  assert.doesNotThrow(() => sync(event)); assert.equal(event.outcome, 'success');
  const asyncObserver = safeObserver(async () => {throw new Error('collector down');});
  assert.doesNotThrow(() => asyncObserver(event));
  await new Promise(resolve => setImmediate(resolve));
  assert.throws(() => safeObserver('not a callback'));
});

test('circuit breaker counts operational errors, ignores wrong answers, and needs a real recovery probe', () => {
  let time = 1000;
  const breaker = createCircuitBreaker({providers: ['a'], now: () => time, failureThreshold: 2, cooldownMs: 100});
  for (let i = 0; i < 100; i++) breaker.observe({operation: 'verify', outcome: 'rejected', provider: 'a'});
  assert.deepEqual(breaker.health(), {a: true});
  breaker.observe({operation: 'verify', outcome: 'error', provider: 'a'});
  breaker.observe({operation: 'verify', outcome: 'error', provider: 'a'});
  assert.deepEqual(breaker.health(), {a: false});
  assert.equal(breaker.recordProbe('a', {ok: true}), false);
  time += 101;
  assert.deepEqual(breaker.health(), {a: false}, 'cooldown alone must not mark a failed provider healthy');
  breaker.observe({operation: 'verify', outcome: 'success', provider: 'a'});
  assert.deepEqual(breaker.health(), {a: false}, 'old in-flight success is not an explicit availability probe');
  assert.equal(breaker.recordProbe('a', {ok: true}), true);
  assert.deepEqual(breaker.health(), {a: true});
  assert.throws(() => breaker.recordProbe('unknown', {ok: true}));
});

test('circuit health preserves server policy assurance floor during a provider outage', async () => {
  const adapter = {assurance: 'bot-mitigation', issue: async () => ({public: {}, private: {}}), verify: async () => true};
  const kechap = new Kechap({adapters: {a: adapter, b: adapter, cheap: {...adapter, assurance: 'automation-cost'}}});
  const breaker = createCircuitBreaker({providers: ['a', 'b'], failureThreshold: 1});
  const policy = {version: 'v1', actions: {signup: {normal: {assurance: 'bot-mitigation', providers: [{id: 'a'}, {id: 'b'}]}}}};
  const args = {context: {tenant: 't', action: 'signup', subject: 's'}, sessionId: 'server-session', policy, risk: 'normal', requiredAssurance: 'bot-mitigation'};
  breaker.observe({operation: 'issue', outcome: 'error', provider: 'a'});
  assert.equal((await kechap.issueWithPolicy({...args, health: breaker.health()})).provider, 'b');
  breaker.observe({operation: 'issue', outcome: 'error', provider: 'b'});
  await assert.rejects(kechap.issueWithPolicy({...args, health: breaker.health()}), /No healthy/);
  policy.actions.signup.normal.providers = [{id: 'cheap'}];
  await assert.rejects(kechap.issueWithPolicy({...args, health: breaker.health()}), /weaker provider/);
});

test('metric and breaker configuration reject unbounded or invalid storage settings', () => {
  assert.throws(() => createMetrics({providers: ['same', 'same']}));
  assert.throws(() => createMetrics({providers: ['unknown']}));
  assert.throws(() => createMetrics({providers: ['a'], maxLatencySamples: 1000000}));
  assert.throws(() => createCircuitBreaker({providers: ['a'], failureThreshold: 0}));
  assert.throws(() => createCircuitBreaker({providers: ['a'], cooldownMs: Infinity}));
});

test('actual SDK upstream timeout fails closed, emits error, and does not inflate pass rate', async () => {
  const metrics = createMetrics({providers: ['turnstile']});
  const breaker = createCircuitBreaker({providers: ['turnstile'], failureThreshold: 1});
  const observed = [];
  const adapter = siteverifyAdapter({provider: 'turnstile', secret: 'DO_NOT_LOG_SECRET', siteKey: 'public', hostname: 'example.com', fetchImpl: async () => {throw new Error('DO_NOT_LOG_INTERNAL_TIMEOUT');}});
  const kechap = new Kechap({adapters: {turnstile: adapter}, onEvent(event) {observed.push(event); metrics.observe(event); breaker.observe(event);}});
  const context = {tenant: 'DO_NOT_LOG_TENANT', action: 'signup', subject: 'DO_NOT_LOG_SUBJECT'};
  const issued = await kechap.issue({context, providers: ['turnstile'], assurance: 'bot-mitigation', sessionId: 'DO_NOT_LOG_SESSION'});
  const rejected = await kechap.verify({id: issued.id, context, response: 'DO_NOT_LOG_TOKEN'});
  assert.deepEqual(rejected, {ok: false});
  assert.equal(observed.at(-1).operation, 'verify'); assert.equal(observed.at(-1).outcome, 'error');
  assert.equal(observed.at(-1).provider, 'turnstile');
  const row = metrics.snapshot().rows.find(r => r.provider === 'turnstile' && r.operation === 'verify');
  assert.equal(row.outcomes.success, 0); assert.equal(row.outcomes.error, 1); assert.equal(row.successRate, 0);
  assert.deepEqual(breaker.health(), {turnstile: false});
  assert.equal(JSON.stringify(observed).includes('DO_NOT_LOG'), false);
  assert.equal(JSON.stringify(metrics.snapshot()).includes('DO_NOT_LOG'), false);
});

test('actual SDK authorization result survives throwing or asynchronously rejecting collectors', async () => {
  const adapter = {assurance: 'bot-mitigation', issue: async () => ({public: {}, private: {}}), verify: async ({response}) => response === 'correct'};
  const context = {tenant: 't', action: 'signup', subject: 's'};
  for (const onEvent of [() => {throw new Error('sink down');}, async () => {throw new Error('sink down');}]) {
    const kechap = new Kechap({adapters: {a: adapter}, onEvent});
    const issued = await kechap.issue({context, providers: ['a'], assurance: 'bot-mitigation', sessionId: 'session'});
    const valid = await kechap.verify({id: issued.id, context, response: 'correct'});
    assert.equal(valid.ok, true);
    assert.equal((await kechap.consume({token: valid.token, context})).ok, true);
    assert.equal((await kechap.consume({token: valid.token, context})).ok, false);
  }
  await new Promise(resolve => setImmediate(resolve));
});
