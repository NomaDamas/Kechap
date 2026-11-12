import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {solveChallenge} from 'altcha-lib';
import {deriveKey} from 'altcha-lib/algorithms/sha';
import {Kechap} from '../src/index.js';
import {altchaAdapter, capAdapter} from '../src/oss.js';

const secret = randomBytes(32).toString('hex');
const context = {tenant: 'owned-test', action: 'signup', subject: 'test-session'};

async function altchaResponse(issued) {
  const challenge = issued.challenge.challenge;
  const solution = await solveChallenge({challenge, deriveKey, timeout: 10000});
  assert.ok(solution);
  return Buffer.from(JSON.stringify({challenge, solution})).toString('base64');
}

async function capResponse(issued) {
  // Exercise the actual pinned upstream protocol's deterministic salt generator.
  // This direct internal import is test-only and deliberately version-pinned.
  const entry = fileURLToPath(import.meta.resolve('capjs-core'));
  const {prng} = await import(new URL('./prng.js', import.meta.resolve('capjs-core')));
  assert.ok((await readFile(resolve(dirname(entry), '../package.json'), 'utf8')).includes('0.1.15'));
  const {token, challenge: {c, s, d}} = issued.challenge.challenge;
  const solutions = [];
  for (let i = 1; i <= c; i++) {
    const salt = prng(`${token}${i}`, s), target = prng(`${token}${i}d`, d);
    let answer = 0;
    while (!createHash('sha256').update(salt + answer).digest('hex').startsWith(target)) answer++;
    solutions.push(answer);
  }
  return JSON.stringify({token, solutions});
}

for (const [name, factory, solve] of [
  ['ALTCHA v2', () => altchaAdapter({secret, keyPrefix: '0'}), altchaResponse],
  ['Cap core SHA-256', () => capAdapter({secret, challengeCount: 2, challengeDifficulty: 1}), capResponse]
]) {
  test(`${name}: real upstream generation/solve/verify and one-use attestation`, async () => {
    const adapter = factory();
    const k = new Kechap({adapters: {oss: adapter}});
    const issued = await k.issue({context, sessionId: 'server-session', providers: ['oss'], assurance: 'automation-cost'});
    assert.equal(JSON.stringify(issued).includes(secret), false);
    const response = await solve(issued);
    const verified = await k.verify({id: issued.id, context, response});
    assert.equal(verified.ok, true);
    assert.equal(verified.assurance, 'automation-cost');
    assert.equal((await k.verify({id: issued.id, context, response})).ok, false);
    assert.equal((await k.consume({token: verified.token, context})).ok, true);
    assert.equal((await k.consume({token: verified.token, context})).ok, false);
  });
  test(`${name}: another issued challenge cannot be substituted`, async () => {
    const k = new Kechap({adapters: {oss: factory()}});
    const issue = () => k.issue({context, sessionId: 'server-session', providers: ['oss'], assurance: 'automation-cost'});
    const first = await issue(), second = await issue();
    const response = await solve(first);
    assert.equal((await k.verify({id: second.id, context, response})).ok, false);
    assert.equal((await k.verify({id: first.id, context, response})).ok, true);
  });
}

test('OSS adapters validate work configuration and reject malformed payloads', async () => {
  assert.throws(() => altchaAdapter({secret: 'short'}));
  assert.throws(() => altchaAdapter({secret, keyPrefix: ''}));
  assert.throws(() => capAdapter({secret, challengeCount: 0}));
  assert.throws(() => capAdapter({secret, challengeDifficulty: 0}));
  assert.throws(() => capAdapter({secret, ttlMs: Infinity}));
  for (const adapter of [altchaAdapter({secret}), capAdapter({secret})]) {
    const issued = await adapter.issue();
    for (const response of [null, {}, '', 'not-json', 'x'.repeat(32769)]) assert.equal(await adapter.verify({response, state: issued.private}), false);
  }
});

test('ALTCHA never trusts a client-modified cheaper challenge', async () => {
  const adapter = altchaAdapter({secret, keyPrefix: '0'});
  const issued = await adapter.issue();
  const modified = structuredClone(issued.public.challenge);
  modified.parameters.keyPrefix = 'f';
  const response = Buffer.from(JSON.stringify({challenge: modified, solution: {counter: 0, derivedKey: '00'}})).toString('base64');
  assert.equal(await adapter.verify({response, state: issued.private}), false);
  issued.public.challenge.parameters.keyPrefix = 'f';
  assert.equal(issued.private.challenge.parameters.keyPrefix, '0');
});

test('Cap enforces the original issued token, scope, solution count and integer range', async () => {
  const adapter = capAdapter({secret, challengeCount: 2, challengeDifficulty: 1});
  const issued = await adapter.issue();
  for (const body of [{token: 'other', solutions: [1, 2]}, {token: issued.private.token, solutions: [1]}, {token: issued.private.token, solutions: [1, -1]}, {token: issued.private.token, solutions: [1, 1.5]}]) {
    assert.equal(await adapter.verify({response: JSON.stringify(body), state: issued.private}), false);
  }
  const response = await capResponse({challenge: issued.public});
  assert.equal(await adapter.verify({response, state: {...issued.private, scope: 'different-action-scope'}}), false);
});

test('official ALTCHA and Cap verifiers enforce their signed expiry', async t => {
  const realNow = Date.now.bind(Date);
  const altcha = altchaAdapter({secret, keyPrefix: '0', ttlMs: 1000});
  const cap = capAdapter({secret, challengeCount: 1, challengeDifficulty: 1, ttlMs: 1000});
  const a = await altcha.issue(), c = await cap.issue();
  const altchaProof = await altchaResponse({challenge: a.public});
  const capProof = await capResponse({challenge: c.public});
  t.mock.method(Date, 'now', () => realNow() + 2000);
  assert.equal(await altcha.verify({response: altchaProof, state: a.private}), false);
  assert.equal(await cap.verify({response: capProof, state: c.private}), false);
});
