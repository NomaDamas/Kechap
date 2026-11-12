import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, symlink, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {scaffoldPlan, writeScaffold} from '../src/scaffold.js';

test('scaffold creates an independent product integration with working server verification', async t => {
  const root = await mkdtemp(join(tmpdir(), 'kechap-scaffold-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const destination = join(root, 'product');
  const plan = await writeScaffold(destination, {provider: 'pow'});
  assert.ok(plan.files.includes('src/browser.js'));
  const {createDemoHandler, configuredAdapters} = await import(pathToFileURL(join(destination, 'examples/web/server.js')));
  const handler = createDemoHandler(configuredAdapters({KECHAP_PROVIDERS: 'pow'}));
  const request = async (url, body, headers = {}) => {
    const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
    Object.assign(req, {method: body === undefined ? 'GET' : 'POST', url, headers: {host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json', ...headers}});
    let status, values, payload;
    await handler(req, {writeHead(code, h) {status = code; values = h;}, end(data) {payload = data;}});
    return {status, headers: values, body: JSON.parse(payload)};
  };
  const session = await request('/api/session');
  const headers = {cookie: session.headers['Set-Cookie'].split(';')[0], 'x-kechap-csrf': session.body.csrf};
  const issued = (await request('/api/challenge', {}, headers)).body;
  let answer = 0;
  while (!createHash('sha256').update(`${issued.challenge.salt}:${answer}`).digest('hex').startsWith('0'.repeat(issued.challenge.difficulty))) answer++;
  const verified = (await request('/api/verify', {id: issued.id, response: String(answer)}, headers)).body;
  assert.equal(verified.ok, true);
  assert.equal((await request('/api/signup', {token: verified.token}, headers)).status, 200);
  assert.equal((await request('/api/signup', {token: verified.token}, headers)).status, 403);
  await assert.rejects(writeScaffold(destination, {provider: 'pow'}), /already exists/);
  assert.equal(JSON.parse(await readFile(join(destination, 'package.json'))).private, true);
});
test('scaffold validates provider, recaptcha mode and hostname without executing supplied text', async () => {
  await assert.rejects(scaffoldPlan({provider: 'unknown'}));
  await assert.rejects(scaffoldPlan({provider: 'recaptcha'}));
  await assert.rejects(scaffoldPlan({hostname: 'example.com\nSECRET=bad'}));
  const plan = await scaffoldPlan({provider: 'recaptcha', recaptchaMode: 'v3'});
  assert.match(plan.files['.env.example'], /RECAPTCHA_MIN_SCORE=0.7/);
  assert.match(plan.files['.env.example'], /RECAPTCHA_SECRET=\n/);
});
test('scaffold never writes into an existing symlink destination', async t => {
  const root = await mkdtemp(join(tmpdir(), 'kechap-scaffold-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, 'existing'));
  await symlink(join(root, 'existing'), join(root, 'link'));
  await assert.rejects(writeScaffold(join(root, 'link'), {provider: 'pow'}), /already exists/);
});
