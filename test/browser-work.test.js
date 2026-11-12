import test from 'node:test';
import assert from 'node:assert/strict';
import {solveBrowserWork, capDerive} from '../src/browser-work.js';
import {altchaAdapter, capAdapter} from '../src/oss.js';
import {prng} from '../node_modules/capjs-core/src/prng.js';

test('browser Cap salt generator matches pinned upstream protocol', () => {
  for (let i = 0; i < 100; i++) for (const size of [1, 7, 32, 64]) assert.equal(capDerive(`seed-${i}`, size), prng(`seed-${i}`, size));
});
for (const [name, create] of [['altcha', () => altchaAdapter({secret: 'x'.repeat(32), keyPrefix: '0'})], ['cap', () => capAdapter({secret: 'x'.repeat(32), challengeCount: 2, challengeDifficulty: 1})]]) {
  test(`browser work response accepted by actual ${name} verifier`, async () => {
    const adapter = create();
    const challenge = await adapter.issue();
    const response = await solveBrowserWork(challenge.public);
    assert.equal(await adapter.verify({response, state: challenge.private}), true);
  });
}
test('browser work obeys cancellation, TTL and computation budget', async () => {
  const challenge = (await altchaAdapter({secret: 'x'.repeat(32), keyPrefix: 'ffff'}).issue()).public;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(solveBrowserWork(challenge, {signal: controller.signal}), /cancelled/);
  await assert.rejects(solveBrowserWork(challenge, {expiresAt: 0}), /expired/);
  await assert.rejects(solveBrowserWork(challenge, {maxAttempts: 1, digest: async () => new Uint8Array(32).buffer}), /budget/);
});
