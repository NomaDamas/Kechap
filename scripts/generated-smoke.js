import {mkdtemp, readFile, writeFile, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {writeScaffold} from '../src/scaffold.js';

const root = await mkdtemp(join(tmpdir(), 'kechap-clean-install-'));
let server, browser;
try {
  const directory = join(root, 'product');
  const generated = await writeScaffold(directory, {requirements: {selfHosted: true, noThirdParty: true, assurance: 'automation-cost', requireLiveEvidence: true, commercialUse: true}});
  assert.equal(generated.provider, 'altcha');
  const npm = spawn('npm', ['install', '--omit=optional', '--ignore-scripts', '--cache', '/tmp/kechap-npm-cache'], {cwd: directory, stdio: ['ignore', 'pipe', 'pipe']});
  const output = [];
  npm.stdout.on('data', chunk => output.push(chunk)); npm.stderr.on('data', chunk => output.push(chunk));
  await new Promise((resolve, reject) => {npm.once('error', reject); npm.once('exit', code => code === 0 ? resolve() : reject(new Error('Generated dependency install failed')));});
  const secret = randomBytes(32).toString('hex');
  await writeFile(join(directory, '.env'), `PORT=0\nKECHAP_PROVIDERS=altcha\nALTCHA_SECRET=${secret}\n`);
  server = spawn(process.execPath, ['--env-file=.env', 'examples/web/server.js'], {cwd: directory, stdio: ['ignore', 'pipe', 'pipe']});
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Generated server startup timed out')), 15000);
    let received = '';
    server.once('error', reject);
    server.stdout.on('data', chunk => {received += chunk.toString(); const match = /http:\/\/localhost:\d+/.exec(received); if (match) {clearTimeout(timer); resolve(match[0]);}});
    server.once('exit', () => {clearTimeout(timer); reject(new Error('Generated server exited before startup'));});
  });
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  assert.equal(await page.locator('#passkeys').isHidden(), true, 'Recovery remains opt-in');
  await page.getByRole('button', {name: '기기에서 검증 작업 시작'}).click();
  await page.waitForFunction(() => !document.querySelector('#submit').disabled);
  await page.getByRole('button', {name: '데모 요청 보내기'}).click();
  await page.getByRole('status').filter({hasText: '데모 요청이 접수되었습니다'}).waitFor();
  assert.deepEqual(errors, []);
  for (const file of ['src/browser.js', 'src/browser-work.js', 'examples/web/app.js', 'examples/web/index.html']) assert.equal((await readFile(join(directory, file), 'utf8')).includes(secret), false);
  const invalid = await page.request.post(url + '/api/signup', {headers: {Origin: url}, data: {token: 'client-forged'}});
  assert.equal(invalid.status(), 403);
  await mkdir('.local/generated', {recursive: true});
  await writeFile('.local/generated/report.json', JSON.stringify({testedAt: new Date().toISOString(), provider: generated.provider, framework: generated.framework, cleanDependencyInstall: true, browserSubmission: true, secretAbsentFromServedSources: true, invalidPostRejected: true, pass: true, limitations: 'Automated fixture, not two independent first users or an external adoption study.'}, null, 2) + '\n');
  console.log('Clean generated project install, actual browser submission, secret boundary and protected POST passed.');
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {server.kill('SIGTERM'); await new Promise(resolve => server.once('exit', resolve));}
  await rm(root, {recursive: true, force: true});
}
