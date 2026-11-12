// Public official hCaptcha dummy test credentials only; never production keys.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {Kechap, siteverifyAdapter} from '../src/index.js';
const adapter = siteverifyAdapter({provider: 'hcaptcha', testMode: true, siteKey: '10000000-ffff-ffff-ffff-000000000001', secret: '0x0000000000000000000000000000000000000000', hostname: 'dummy-key-pass'});
const kechap = new Kechap({adapters: {hcaptcha: adapter}});
const context = {tenant: 'owned-test', action: 'sandbox-contract', subject: 'local-smoke'};
const issued = await kechap.issue({context, sessionId: 'server-test', providers: ['hcaptcha'], assurance: 'bot-mitigation'});
const result = await kechap.verify({context, id: issued.id, response: '10000000-aaaa-bbbb-cccc-000000000001'});
assert.equal(result.ok, true);
assert.equal((await kechap.consume({context, token: result.token})).ok, true);
assert.equal((await kechap.consume({context, token: result.token})).ok, false);
await mkdir('.local/vendors', {recursive: true});
await writeFile('.local/vendors/hcaptcha.json', JSON.stringify({testedAt: new Date().toISOString(), provider: 'hcaptcha', environment: 'official-public-dummy-test', documentation: 'https://docs.hcaptcha.com/#integration-testing-test-keys', pass: true, checks: ['official siteverify response', 'expected dummy hostname', 'Kechap challenge binding and one-use consumption'], limitations: 'Test keys always permit a documented dummy token; this verifies integration only, not challenge effectiveness, browser widget or production approval.'}, null, 2) + '\n');
console.log('Official hCaptcha dummy-key server integration passed (not production defense evidence).');
