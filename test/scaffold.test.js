import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, symlink, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {scaffoldPlan, writeScaffold, integrationPlan} from '../src/scaffold.js';
import {handle} from '../src/mcp.js';

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
  const oss = await scaffoldPlan({provider: 'cap'});
  assert.match(oss.files['README.md'], /Assurance: automation-cost/);
  assert.match(oss.files['.env.example'], /CAP_SECRET=\n/);
  assert.doesNotMatch(oss.files['.env.example'], /CAP_SITE_KEY/);
});
test('scaffold never writes into an existing symlink destination', async t => {
  const root = await mkdtemp(join(tmpdir(), 'kechap-scaffold-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(join(root, 'existing'));
  await symlink(join(root, 'existing'), join(root, 'link'));
  await assert.rejects(writeScaffold(join(root, 'link'), {provider: 'pow'}), /already exists/);
});
test('requirements select an eligible self-host adapter and never silently change assurance', async () => {
  const selected = await integrationPlan({requirements: {selfHosted: true, noThirdParty: true, assurance: 'automation-cost', requireLiveEvidence: true}});
  assert.equal(selected.provider, 'altcha');
  assert.match(selected.files['.env.example'], /ALTCHA_SECRET=/);
  assert.equal(selected.recommendation.requirements.assurance, 'automation-cost');
  const reward = await integrationPlan({requirements: {useCase: 'reward'}});
  assert.equal(reward.status, 'unmet-requirements');
  assert.deepEqual(reward.files, {});
  await assert.rejects(integrationPlan({requirements: {selfHosted: true, assurance: 'automation-cost'}, provider: 'turnstile'}), /does not satisfy/);
  await assert.rejects(integrationPlan({requirements: {region: 'KR'}}), /Unknown requirement/);
});
test('unmet requirements never create the destination directory', async t => {
  const root = await mkdtemp(join(tmpdir(), 'kechap-setup-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const destination = join(root, 'no-adapter');
  await assert.rejects(writeScaffold(destination, {requirements: {minStars: 10000, assurance: 'automation-cost'}}), /No eligible adapter/);
  await assert.rejects(readFile(join(destination, 'package.json')), {code: 'ENOENT'});
});
test('MCP setup preserves the requirement contract in generated file contents', async () => {
  const call = arguments_ => handle({jsonrpc: '2.0', id: 1, method: 'tools/call', params: {name: 'kechap_setup', arguments: arguments_}});
  const response = await call({requirements: {selfHosted: true, assurance: 'automation-cost'}, provider: 'cap'});
  const plan = JSON.parse(response.result.content[0].text);
  assert.equal(plan.provider, 'cap');
  assert.match(plan.files['.env.example'], /CAP_SECRET=/);
  assert.equal((await call({requirements: {assurance: 'identity'}, provider: 'pow'})).result.isError, undefined);
  assert.equal(JSON.parse((await call({requirements: {assurance: 'identity'}})).result.content[0].text).status, 'unmet-requirements');
  assert.equal((await call({requirements: {assurance: 'automation-cost'}, provider: 'turnstile'})).result.isError, true);
});
test('scaffold rejects malformed hosts and silently ignored options', async () => {
  for (const hostname of ['-bad.example', 'bad..example', 'good.example\n', null, false]) await assert.rejects(scaffoldPlan({hostname}));
  await assert.rejects(scaffoldPlan({provider: 'cap', recaptchaMode: 'v3'}));
  await assert.rejects(scaffoldPlan({provider: 'cap', requirements: {minStars: 10000}}));
});
