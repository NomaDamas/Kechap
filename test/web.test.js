import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {createDemoHandler, createDemoServer, configuredAdapters} from '../examples/web/server.js';
import {mountChallenge} from '../src/browser.js';

function container() {
  return {ownerDocument: {}, replaceChildren() {}};
}
test('browser Turnstile passes nonce and removes old widget on rotation', async () => {
  let options, removed;
  const responses = [];
  const host = container();
  const cleanup = await mountChallenge(host, {expiresAt: Date.now() + 10000, challenge: {type: 'turnstile', siteKey: 'public', cData: 'nonce', action: 'signup'}}, {
    onResponse: response => responses.push(response),
    sdkLoader: async () => ({render: (element, opts) => {assert.equal(element, host); options = opts; return 'widget';}, remove: id => {removed = id;}})
  });
  assert.equal(options.cData, 'nonce'); assert.equal(options.action, 'signup');
  options.callback('first'); options.callback('duplicate'); await Promise.resolve(); cleanup(); options.callback('stale');
  assert.deepEqual(responses, ['first']); assert.equal(removed, 'widget');
});
test('browser cleanup during SDK load prevents a stale widget', async () => {
  const controller = new AbortController(); let finish, rendered = false;
  const waiting = mountChallenge(container(), {expiresAt: Date.now() + 10000, challenge: {type: 'hcaptcha', siteKey: 'public'}}, {
    signal: controller.signal, onResponse() {}, sdkLoader: () => new Promise(resolve => {finish = resolve;})
  });
  controller.abort(); finish({render() {rendered = true;}}); await waiting;
  assert.equal(rendered, false);
});
test('browser v3 executes configured action and suppresses disposed results', async () => {
  let ready, resolveToken; const responses = [];
  const cleanup = await mountChallenge(container(), {expiresAt: Date.now() + 10000, challenge: {type: 'recaptcha', recaptchaMode: 'v3', siteKey: 'public', action: 'signup'}}, {
    onResponse: value => responses.push(value), sdkLoader: async () => ({ready: fn => {ready = fn;}, execute(key, options) {assert.equal(key, 'public'); assert.equal(options.action, 'signup'); return new Promise(resolve => {resolveToken = resolve;});}})
  });
  ready(); await Promise.resolve(); cleanup(); resolveToken('stale'); await Promise.resolve();
  assert.deepEqual(responses, []);
});
test('demo configuration never combines PoW and hosted verification', () => {
  assert.throws(() => configuredAdapters({KECHAP_PROVIDERS: 'pow,turnstile'}));
  assert.throws(() => configuredAdapters({KECHAP_PROVIDERS: 'unknown'}));
  assert.equal(configuredAdapters({}).assurance, 'automation-cost');
});
function requests(handler) {
  const origin = 'http://localhost:3000';
  return async (method, url, body, headers = {}) => {
    const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(request, {method, url, headers: {host: 'localhost:3000', origin, 'content-type': 'application/json', ...headers}});
    let status, responseHeaders, payload;
    const response = {headersSent: false, writeHead(code, values) {status = code; responseHeaders = values; this.headersSent = true;}, end(value) {payload = value;}};
    await handler(request, response);
    return {status, headers: responseHeaders, json: () => JSON.parse(payload)};
  };
}
test('request handler session to issue/verify/consume, rotation and replay protection', async () => {
  // Owned local fixtures exercise HTTP plumbing, not a vendor security claim.
  const adapter = {assurance: 'bot-mitigation', issue: async () => ({public: {type: 'fixture'}, private: {}}), verify: async ({response}) => response === 'fixture-token'};
  const request = requests(createDemoHandler({adapters: {a: adapter, b: adapter}, assurance: 'bot-mitigation'}));
  const sessionResponse = await request('GET', '/api/session');
  const {csrf} = sessionResponse.json();
  const cookie = sessionResponse.headers['Set-Cookie'].split(';')[0];
  const post = (path, body, extra = {}) => request('POST', path, body, {cookie, 'x-kechap-csrf': csrf, ...extra});
  assert.equal((await post('/api/challenge', {}, {origin: 'http://attacker.invalid'})).status, 403);
  assert.equal((await post('/api/challenge', {}, {'x-kechap-csrf': 'wrong'})).status, 403);
  const first = (await post('/api/challenge', {})).json();
  const second = (await post('/api/challenge', {})).json();
  assert.notEqual(first.provider, second.provider);
  const verifiedResponse = await post('/api/verify', {id: first.id, response: 'fixture-token'});
  assert.equal(verifiedResponse.status, 200);
  const verified = await verifiedResponse.json();
  assert.equal((await post('/api/verify', {id: first.id, response: 'fixture-token'})).status, 403);
  const consumed = await post('/api/signup', {token: verified.token});
  assert.equal(consumed.status, 200);
  assert.equal((await consumed.json()).assurance, 'bot-mitigation');
  assert.equal((await post('/api/signup', {token: verified.token})).status, 403);
  assert.equal((await post('/api/verify', {id: second.id, response: 'wrong'})).status, 403);
  assert.equal((await post('/api/challenge', {large: 'x'.repeat(33000)})).status, 413);
});
test('request handler PoW demo verifies an actual work response', async () => {
  const request = requests(createDemoHandler(configuredAdapters({})));
  const initial = await request('GET', '/api/session');
  const {csrf} = initial.json(); const cookie = initial.headers['Set-Cookie'].split(';')[0];
  const post = (path, body) => request('POST', path, body, {cookie, 'x-kechap-csrf': csrf});
  const issued = (await post('/api/challenge', {})).json();
  let answer = 0;
  while (!createHash('sha256').update(`${issued.challenge.salt}:${answer}`).digest('hex').startsWith('0'.repeat(issued.challenge.difficulty))) answer++;
  const verified = await (await post('/api/verify', {id: issued.id, response: String(answer)})).json();
  assert.equal(verified.ok, true);
  assert.equal((await post('/api/signup', {token: verified.token})).status, 200);
});
test('live loopback HTTP session smoke (requires permission to bind a port)', async t => {
  const server = createDemoServer(configuredAdapters({}));
  try {
    await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) {t.skip(`Loopback bind unavailable: ${error.code}`); return;}
    throw error;
  }
  t.after(() => {server.closeAllConnections(); return new Promise(resolve => server.close(resolve));});
  const response = await fetch(`http://localhost:${server.address().port}/api/session`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).assurance, 'automation-cost');
});
