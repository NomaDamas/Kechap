import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {Kechap} from '../src/index.js';
import {replayAdapter, REPLAY_SURFACES} from '../src/replay.js';

const pageHtml = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kechap owned interaction research</title><style>body{font:18px/1.5 system-ui;max-width:800px;margin:30px auto;padding:16px}button{padding:12px;margin:5px}button:focus-visible{outline:3px solid #b54d00;outline-offset:3px}</style><main><h1>Kechap interaction research</h1><p>Owned toy environment. Successful interaction is not proof of a human. You may cancel at any time.</p><button id="start" type="button">Start experiment</button><button id="cancel" type="button">Cancel experiment</button><section id="world" aria-label="Interaction challenge"></section><p id="result" role="status"></p></main><script type="module">
import {mountReplayWorld} from '/replay-browser.js';
let cleanup;
document.querySelector('#cancel').onclick=()=>{cleanup?.();window.__kechapCancelled=true;document.querySelector('#result').textContent='Cancelled. No protected action performed.';};
document.querySelector('#start').onclick=async()=>{
 document.querySelector('#start').disabled=true;
 cleanup?.();window.__kechapResult=null;window.__kechapCancelled=false;
 const params=new URLSearchParams(location.search);
 const response=await fetch('/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({surface:params.get('surface')||'static-choice',seed:params.get('seed')||undefined})});
 if(!response.ok)throw new Error('Owned challenge could not start');
 const issued=await response.json();window.__kechapPublicWorld=issued.challenge;window.__kechapSession=issued.session;
 cleanup=mountReplayWorld(document.querySelector('#world'),issued.challenge,{onError:error=>{document.querySelector('#result').textContent=error.message;},onResponse:async payload=>{
  const response=await fetch('/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:issued.id,session:issued.session,response:payload})});
  const result=await response.json();window.__kechapResult=result;document.querySelector('#result').textContent=result.ok?'Interaction replay accepted. Human presence not proven.':'Interaction rejected.';
 }});
};
</script></html>`;

/** Loopback research harness only. It performs no real account/payment action. */
export function createReplayHarness() {
  const sessions = new Map();
  const adapters = Object.fromEntries(REPLAY_SURFACES.map(surface => [surface, replayAdapter({surface})]));
  const kechap = new Kechap({adapters, ttlMs: 15000});
  const server = createServer(async (req, res) => {
    const origin = `http://localhost:${server.address().port}`;
    const send = (code, data) => {res.writeHead(code, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});res.end(JSON.stringify(data));};
    if (req.headers.host !== new URL(origin).host) return send(403, {ok: false});
    if (req.method === 'GET' && req.url?.split('?')[0] === '/') {res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});res.end(pageHtml);return;}
    if (req.method === 'GET' && req.url === '/replay-browser.js') {res.writeHead(200, {'Content-Type': 'text/javascript'});res.end(await readFile(new URL('../src/replay-browser.js', import.meta.url)));return;}
    if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['content-type'] !== 'application/json' || !['/challenge', '/verify'].includes(req.url)) return send(403, {ok: false});
    try {
      let length = 0;const chunks=[];
      for await(const chunk of req){length+=chunk.length;if(length>20000)return send(413,{ok:false});chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString());
      for(const [id,session]of sessions)if(session.expiresAt<Date.now())sessions.delete(id);
      if(req.url==='/challenge'){
        if(!REPLAY_SURFACES.includes(body.surface)||sessions.size>=1000)return send(400,{ok:false});
        const session=randomBytes(24).toString('base64url');
        const context={tenant:'owned-replay-research',action:'research-trial',subject:session};
        // Optional seed changes are researcher-owned public worlds, not deployment policy.
        if(body.seed!==undefined&& (typeof body.seed!=='string'||body.seed.length>128||!body.seed))return send(400,{ok:false});
        const runtime=body.seed===undefined?kechap:new Kechap({adapters:{[body.surface]:replayAdapter({surface:body.surface,seedFactory:()=>body.seed})},store:kechap.store,ttlMs:15000});
        const issued=await runtime.issue({context,sessionId:session,providers:[body.surface],assurance:'interaction'});
        sessions.set(session,{context,runtime,expiresAt:Date.now()+15000});return send(200,{...issued,session});
      }
      const session=sessions.get(body.session);if(!session)return send(403,{ok:false});
      sessions.delete(body.session);
      const verified=await session.runtime.verify({id:body.id,context:session.context,response:body.response});
      if(!verified.ok)return send(403,{ok:false});
      const consumed=await session.runtime.consume({token:verified.token,context:session.context});
      return send(consumed.ok?200:403,{ok:consumed.ok,assurance:consumed.assurance,provider:consumed.provider});
    }catch{return send(400,{ok:false});}
  });
  server.requestTimeout=10000;return server;
}

export async function interactWithWorld(page, mode = 'dom-script') {
  await page.getByRole('button',{name:'Start experiment',exact:true}).click();
  await page.waitForFunction(()=>Boolean(window.__kechapPublicWorld));
  const world=await page.evaluate(()=>window.__kechapPublicWorld);
  if(world.surface==='static-choice'){
    await page.locator(`[data-choice="${mode==='fixed-macro'?0:world.target}"]`).click();
  }else if(world.surface==='dynamic-sequence'){
    for(let i=0;i<world.cues.length;i++){
      await page.waitForFunction(index=>document.querySelector('[data-cue]')?.dataset.activeCue===String(index),i);
      const choice=mode==='fixed-macro'?0:world.cues[i].choice;
      await page.locator(`[data-choice="${choice}"]`).click();
    }
  }else{
    const object=page.locator('[data-object]');
    if(mode==='keyboard'){
      await object.focus();await page.keyboard.press('Space');await page.waitForTimeout(50);
      let x=world.start.x,y=world.start.y;
      for(const axis of ['x','y']){
        let current=axis==='x'?x:y;const target=world.target[axis];
        while(Math.abs(target-current)>12){
          const amount=Math.abs(target-current)>50?50:10;
          const positive=target>current;
          const key=axis==='x'?(positive?'ArrowRight':'ArrowLeft'):(positive?'ArrowDown':'ArrowUp');
          await page.keyboard.press(amount===10?'Shift+'+key:key);await page.waitForTimeout(40);current+=positive?amount:-amount;
        }
        if(axis==='x')x=current;else y=current;
      }
      for(let angle=0;angle<world.targetAngle;angle+=90)await page.keyboard.press('r');
      await page.keyboard.press('Enter');
    }else{
    const rect=await page.locator('[data-board]').boundingBox();
    const target=mode==='fixed-macro'?{x:750,y:500}:world.target;
    const start=world.start;
    await page.mouse.move(rect.x+rect.width*start.x/1000,rect.y+rect.height*start.y/1000);
    await page.mouse.down();
    for(let step=1;step<=12;step++){
      await page.waitForTimeout(50);
      await page.mouse.move(rect.x+rect.width*(start.x+(target.x-start.x)*step/12)/1000,rect.y+rect.height*(start.y+(target.y-start.y)*step/12)/1000);
    }
    await page.mouse.up();
    for(let angle=0;angle<(mode==='fixed-macro'?90:world.targetAngle);angle+=90)await page.getByRole('button',{name:'Rotate 90°',exact:true}).click();
    await page.getByRole('button',{name:'Place object',exact:true}).click();
    await object.count();
    }
  }
  await page.waitForFunction(()=>window.__kechapResult!==null&&window.__kechapResult!==undefined);
  return {world, result:await page.evaluate(()=>window.__kechapResult)};
}

export async function runReplayBrowserSmoke() {
  const server=createReplayHarness();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const trials=[];
    for(const surface of REPLAY_SURFACES){
      const seed=`browser-smoke-${surface}`;await page.goto(`http://localhost:${server.address().port}/?surface=${surface}&seed=${seed}`);
      const started=performance.now();const trial=await interactWithWorld(page);
      assert.equal(trial.result.ok,true,`Real browser replay must pass for ${surface}`);
      trials.push({surface,seed,elapsedMs:performance.now()-started,accepted:trial.result.ok,assurance:trial.result.assurance});
    }
    await page.goto(`http://localhost:${server.address().port}/?surface=drag-rotate&seed=browser-smoke-drag-rotate`);
    const keyboard=await interactWithWorld(page,'keyboard');assert.equal(keyboard.result.ok,true,'Keyboard drag and rotate must be replayed');
    trials.push({surface:'drag-rotate',seed:'browser-smoke-drag-rotate',mode:'keyboard',accepted:true,assurance:'interaction'});
    await page.goto(`http://localhost:${server.address().port}/?surface=dynamic-sequence`);
    await page.getByRole('button',{name:'Start experiment',exact:true}).click();await page.waitForFunction(()=>Boolean(window.__kechapPublicWorld));
    await page.getByRole('button',{name:'Cancel experiment',exact:true}).click();
    assert.equal(await page.locator('#world').textContent(),'');assert.equal(await page.evaluate(()=>window.__kechapCancelled),true);
    assert.deepEqual(errors,[]);await mkdir('.local/replay-browser',{recursive:true});
    await page.screenshot({path:'.local/replay-browser/demo.png',fullPage:true});
    const report={schemaVersion:1,testedAt:new Date().toISOString(),browser:await browser.version(),mode:'real-headless-DOM-and-pointer',trials,humanResults:null,securityClaim:'None. Rule-aware automation is expected to pass.'};
    await writeFile('.local/replay-browser/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
  }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await runReplayBrowserSmoke();
