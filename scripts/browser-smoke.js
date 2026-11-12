import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createDemoServer} from '../examples/web/server.js';
import {powAdapter} from '../src/index.js';
import {altchaAdapter, capAdapter} from '../src/oss.js';

const server = createDemoServer({
  adapters: {pow: powAdapter({difficulty: 2}), altcha: altchaAdapter({secret: 'local-test-only-'.repeat(3), keyPrefix: '0'}), cap: capAdapter({secret: 'local-test-only-'.repeat(3), challengeCount: 2, challengeDifficulty: 1})},
  assurance: 'automation-cost'
});
await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
let browser;
try {
  browser = await chromium.launch({headless: true});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const providers = [];
  page.on('response', async response => {
    if (response.url().endsWith('/api/challenge') && response.ok()) providers.push((await response.json()).provider);
  });
  await page.goto(`http://localhost:${server.address().port}`);
  for (let n = 0; n < 3; n++) {
    await page.getByRole('button', {name: '기기에서 검증 작업 시작'}).click();
    await page.waitForFunction(() => !document.querySelector('#submit').disabled);
    await page.getByRole('button', {name: '데모 요청 보내기'}).click();
    await page.getByRole('status').filter({hasText: '데모 요청이 접수되었습니다'}).waitFor();
    if (n < 2) await page.getByRole('button', {name: '새 인증 요청'}).click();
  }
  assert.equal(new Set(providers).size, 3, 'All three configured providers must rotate');
  assert.deepEqual(errors, []);
  await mkdir('.local/browser', {recursive: true});
  await page.screenshot({path: '.local/browser/demo.png', fullPage: true});
  await writeFile('.local/browser/report.json', JSON.stringify({testedAt: new Date().toISOString(), browser: await browser.version(), providers, pass: true, limitations: 'Owned local PoW/ALTCHA SHA256/Cap SHA256. Does not measure humanity, commercial vendor defense, assistive technology, or VLM resistance.'}, null, 2) + '\n');
  console.log('Browser form, OSS work, provider rotation and protected submission passed:', providers.join(' -> '));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
