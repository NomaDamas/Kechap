import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createDemoServer} from '../examples/web/server.js';
import {powAdapter} from '../src/index.js';
const server = createDemoServer({adapters: {pow: powAdapter({difficulty: 1})}, assurance: 'automation-cost', passkeyRecovery: true});
await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
let browser;
try {
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage({reducedMotion: 'reduce'});
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {options: {protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true}});
  const captures = [];
  let capturedCSRF;
  page.on('request', request => {if (request.url().endsWith('/api/signup')) capturedCSRF = request.headers()['x-kechap-csrf'];});
  page.on('response', async response => {if (response.url().endsWith('/api/passkey/auth/verify') && response.ok()) captures.push(await response.json());});
  await page.goto(`http://localhost:${server.address().port}`);
  // The first alternative enrollment is never authorized merely by clicking it.
  assert.equal(await page.getByRole('button', {name: '검증 후 데모 패스키 등록'}).isDisabled(), true);
  await page.getByRole('button', {name: '기기에서 검증 작업 시작'}).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#submit').disabled);
  await page.getByRole('button', {name: '데모 요청 보내기'}).focus(); await page.keyboard.press('Enter');
  await page.getByRole('status').filter({hasText: '데모 요청이 접수되었습니다'}).waitFor();
  await page.getByRole('button', {name: '검증 후 데모 패스키 등록'}).click();
  await page.getByRole('status').filter({hasText: '데모 패스키를 등록했습니다'}).waitFor();
  await page.getByRole('button', {name: '등록된 패스키로 진행'}).focus(); await page.keyboard.press('Enter');
  await page.getByRole('status').filter({hasText: '패스키 계정 연속성 경로를 사용했습니다'}).waitFor();
  assert.equal(captures.length, 1); assert.equal(captures[0].assurance, 'account-continuity');
  const replay = await page.evaluate(async ({token, csrf}) => {
    const result = await fetch('/api/signup', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Kechap-CSRF': csrf}, body: JSON.stringify({recoveryToken: token})});
    return result.status;
  }, {token: captures[0].token, csrf: capturedCSRF});
  assert.equal(replay, 403, 'Valid-session replay must fail even with the correct CSRF token');
  const rejectedWithoutCSRF = await page.evaluate(async token => {
    const csrf = document.cookie;
    const result = await fetch('/api/signup', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({recoveryToken: token})});
    return {status: result.status, visibleCookie: csrf};
  }, captures[0].token);
  assert.equal(rejectedWithoutCSRF.status, 403); assert.equal(rejectedWithoutCSRF.visibleCookie.includes('kechap_demo'), false);
  await page.getByRole('button', {name: '데모 패스키 삭제'}).click();
  await page.getByRole('status').filter({hasText: '서버 등록 정보를 삭제했습니다'}).waitFor();
  await page.getByRole('button', {name: '등록된 패스키로 진행'}).click();
  await page.getByRole('status').filter({hasText: 'Verification unavailable'}).waitFor();
  assert.deepEqual(errors, []);
  await mkdir('.local/passkeys', {recursive: true});
  await writeFile('.local/passkeys/report.json', JSON.stringify({testedAt: new Date().toISOString(), browser: await browser.version(), pass: true, checks: ['server-authorized enrollment', 'actual WebAuthn registration and authentication verification', 'keyboard activation', 'reduced-motion setting', 'account-continuity assurance', 'server credential deletion'], limitations: 'Virtual authenticator; not human study or screen-reader certification. Prior enrollment required; not human proof.'}, null, 2) + '\n');
  console.log('Actual WebAuthn virtual authenticator registration, non-puzzle recovery and deletion passed.');
} finally {await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
