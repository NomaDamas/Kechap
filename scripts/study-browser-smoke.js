import {chromium} from 'playwright';
import {mkdtemp, readFile, rm, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createStudyServer} from './study-server.js';
const folder=await mkdtemp(join(tmpdir(),'kechap-study-browser-')),file=join(folder,'records.jsonl');
const server=await createStudyServer({file,source:'fixture'});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://localhost:${server.address().port}`);
  await page.getByRole('button',{name:'동의하고 시작'}).click();
  await page.getByRole('status').filter({hasText:'동의한 경우에만'}).waitFor();
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'동의하고 시작'}).click();
  for(let i=0;i<3;i++){
    await page.waitForFunction(()=>!document.querySelector('#skip').disabled);
    await page.getByRole('button',{name:'이 과제 중단'}).click();
  }
  await page.getByRole('status').filter({hasText:'세 과제가 끝났습니다'}).waitFor();
  const records=(await readFile(file,'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(records.length,3);assert.equal(new Set(records.map(r=>r.surface)).size,3);assert.ok(records.every(r=>r.source==='fixture'&&r.attempts[0].outcome==='dropout'));
  await page.getByRole('button',{name:'전체 참여 철회·데이터 삭제'}).click();
  await page.getByRole('status').filter({hasText:'기록을 삭제했습니다'}).waitFor();
  assert.equal(await readFile(file,'utf8'),'');assert.deepEqual(errors,[]);
  await mkdir('.local/study-browser',{recursive:true});await writeFile('.local/study-browser/report.json',JSON.stringify({testedAt:new Date().toISOString(),source:'fixture',pass:true,consentRequired:true,threeCounterbalancedSurfaces:true,dropoutRecorded:true,withdrawalDeleted:true,actualHumanParticipants:0},null,2)+'\n');
  console.log('Study consent, real rendered3surfaces, dropout records and withdrawal deletion passed (fixture only).');
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(folder,{recursive:true,force:true});}
