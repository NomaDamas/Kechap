import {createServer} from 'node:http';
import {randomBytes, createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, appendFile, rename} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Kechap} from '../src/index.js';
import {replayAdapter} from '../src/replay.js';
import {studyAssignment, validateStudyRecord, STUDY_PROTOCOL, CONSENT_VERSION} from './analyze-study.js';

const sha = value => createHash('sha256').update(value).digest('hex');
const root = new URL('../', import.meta.url);
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kechap 참여 연구</title><style>body{font:18px/1.6 system-ui;max-width:800px;margin:4vh auto;padding:24px}button{font:inherit;padding:12px;margin:6px}button:focus-visible,input:focus-visible{outline:3px solid #b45309}section{border:1px solid #aaa;padding:20px}</style><main><h1>Kechap 참여 연구</h1><p>이것은 보안 인증이나 신원 확인 서비스가 아닙니다. 자동화도 수행할 수 있는 실험 과제입니다.</p><pre id="consent" style="white-space:pre-wrap"></pre><label><input id="agree" type="checkbox"> 설명을 읽었고 자발적으로 참여합니다.</label><p><label>기기 <select id="device"><option value="unspecified">응답 안 함</option><option value="desktop">데스크톱</option><option value="mobile">모바일</option><option value="tablet">태블릿</option></select></label></p><button id="start">동의하고 시작</button><p id="status" role="status" aria-live="polite"></p><p id="withdraw-token"></p><section id="world"></section><button id="next" disabled>다음 과제 / 다시 시도</button><button id="skip" disabled>이 과제 중단</button><button id="withdraw" disabled>전체 참여 철회·데이터 삭제</button></main><script type="module" src="/study-app.js"></script></html>`;
const app = `import {mountReplayWorld} from '/replay-browser.js';
let csrf,cleanup;const status=document.querySelector('#status'),next=document.querySelector('#next'),skip=document.querySelector('#skip');
async function request(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-Kechap-CSRF':csrf??''},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error??'실험 요청 실패');return j;}
const info=await(await fetch('/api/info')).json();document.querySelector('#consent').textContent=info.consent;status.textContent='기록 유형: '+info.source;
let withdrawal;
document.querySelector('#start').onclick=async()=>{try{if(!document.querySelector('#agree').checked)throw new Error('동의한 경우에만 시작할 수 있습니다.');const s=await request('/api/consent',{consented:true,consentVersion:info.consentVersion,device:document.querySelector('#device').value});csrf=s.csrf;withdrawal=s.withdrawalToken;document.querySelector('#withdraw-token').textContent='철회 코드 (별도 보관): '+withdrawal;document.querySelector('#withdraw').disabled=false;document.querySelector('#start').disabled=true;await begin();}catch(e){status.textContent=e.message;}};
async function begin(){cleanup?.();next.disabled=true;skip.disabled=true;try{const c=await request('/api/trial',{});if(c.complete){status.textContent='세 과제가 끝났습니다. 철회 코드는 보관하세요.';return;}status.textContent=(c.orderIndex+1)+' / 3 과제';skip.disabled=false;cleanup=mountReplayWorld(document.querySelector('#world'),c.challenge,{onResponse:async response=>{const r=await request('/api/result',{id:c.id,response});status.textContent=r.ok?'과제를 마쳤습니다.':'통과하지 못했습니다. 다시 시도하거나 중단할 수 있습니다.';next.disabled=false;skip.disabled=true;},onError:e=>{status.textContent=e.message;next.disabled=false;}});}catch(e){status.textContent=e.message;next.disabled=false;}}
next.onclick=begin;skip.onclick=async()=>{cleanup?.();try{await request('/api/dropout',{});await begin();}catch(e){status.textContent=e.message;}};
document.querySelector('#withdraw').onclick=async()=>{cleanup?.();try{await request('/api/withdraw',{withdrawalToken:withdrawal});next.disabled=true;skip.disabled=true;status.textContent='참여를 철회했고 기록을 삭제했습니다.';}catch(e){status.textContent=e.message;}};
`;

export async function createStudyServer({file = resolve('.local/study/trials.jsonl'), source = 'fixture', allocationSeed = 'kechap-study-development-allocation-v1', maxSessions = 1000, humanStudy} = {}) {
  if (!['fixture', 'human', 'automation'].includes(source)) throw new Error('Declared study source required');
  let consent = await readFile(new URL('../docs/consent.ko.md', import.meta.url), 'utf8');
  if (source === 'human') {
    if (!humanStudy || ['operator', 'contact', 'compensation'].some(k => typeof humanStudy[k] !== 'string' || !humanStudy[k].trim()) || !Number.isFinite(Date.parse(humanStudy.deleteAt)) || Date.parse(humanStudy.deleteAt) <= Date.now() || Date.parse(humanStudy.deleteAt) > Date.now() + 30*86400000 || allocationSeed === 'kechap-study-development-allocation-v1') throw new Error('Human enrollment requires operator/contact/compensation/deleteAt within30days and a preregistered allocation seed');
    consent = consent.replace('미설정 — 모집 전 입력 필요, 최대30일', humanStudy.deleteAt).replace('미설정 — 모집 전 입력 필요, 중단 불이익 금지', humanStudy.compensation).replace('미설정 — 모집 전 입력 필요', humanStudy.operator).replace('미설정 — 모집 전 입력 필요', humanStudy.contact);
  }
  studyAssignment(0, allocationSeed);
  await mkdir(dirname(file), {recursive: true});
  const sessions = new Map(); let allocationIndex = 0; let writes = Promise.resolve();
  try {
    const existing=(await readFile(file,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line));
    for(const row of existing){validateStudyRecord(row);if(row.source!==source||row.allocationSeed!==allocationSeed)throw new Error('Do not mix sources or allocation seeds');allocationIndex=Math.max(allocationIndex,row.allocationIndex+1);}
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const serialize = fn => {const next = writes.then(fn); writes = next.catch(() => {}); return next;};
  let purgeTimer;
  const markWithdrawn = hash => {for (const [id, session] of sessions) if (session.withdrawalTokenHash === hash) {session.withdrawn = true; clearTimeout(session.timer); sessions.delete(id);}};
  const kechap = new Kechap({adapters: Object.fromEntries(['static-choice', 'drag-rotate', 'dynamic-sequence'].map(surface => [surface, replayAdapter({surface})])), ttlMs: 15000});
  const server = createServer(async (req, res) => {
    const origin = `http://localhost:${server.address().port}`;
    const send = (code, body, headers = {}) => {res.writeHead(code, {'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers});res.end(JSON.stringify(body));};
    if (req.headers.host !== new URL(origin).host) return send(403, {error: 'Unexpected host'});
    if (req.method === 'GET') {
      if (req.url === '/api/info') return send(200, {consent, consentVersion: CONSENT_VERSION, source});
      const files = {'/replay-browser.js': new URL('../src/replay-browser.js', import.meta.url)};
      if (req.url === '/' || req.url === '/study-app.js' || files[req.url]) {
        const body = req.url === '/' ? html : req.url === '/study-app.js' ? app : await readFile(files[req.url]);
        res.writeHead(200, {'Content-Type': req.url === '/' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'});res.end(body);return;
      }
      return send(404, {error: 'Not found'});
    }
    if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['content-type']?.split(';')[0] !== 'application/json') return send(403, {error: 'Same-origin JSON required'});
    let lockedSession;
    try {
      if(source==='human'&&Date.now()>=Date.parse(humanStudy.deleteAt)) {
        sessions.clear();await serialize(()=>writeFile(file,'',{mode:0o600}));return send(410,{error:'Study retention deadline reached; records deleted'});
      }
      let text = '';for await(const chunk of req){text+=chunk.toString();if(Buffer.byteLength(text)>20000)return send(413,{error:'Request too large'});}
      const body = JSON.parse(text);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, {error: 'JSON object required'});
      if (req.url === '/api/withdraw') {
        if (!/^[A-Za-z0-9_-]{43}$/.test(body.withdrawalToken)) return send(400, {error: 'Withdrawal token required'});
        const hash = sha(body.withdrawalToken);
        markWithdrawn(hash);
        await serialize(async () => {
          let raw;try {raw = await readFile(file, 'utf8');}catch(e){if(e.code !== 'ENOENT')throw e;raw='';}
          const kept = raw.split('\n').filter(Boolean).filter(line => JSON.parse(line).withdrawalTokenHash !== hash);
          const temporary=file+'.withdraw-'+randomBytes(8).toString('hex');
          await writeFile(temporary, kept.length ? kept.join('\n')+'\n' : '', {mode: 0o600});await rename(temporary,file);
        });
        return send(200,{ok:true});
      }
      for(const [id,s]of sessions)if(s.expiresAt<Date.now())sessions.delete(id);
      if (req.url === '/api/consent') {
        if (Object.keys(body).some(k => !['consented','consentVersion','device'].includes(k)) || body.consented !== true || body.consentVersion !== CONSENT_VERSION || !['desktop','mobile','tablet','unspecified'].includes(body.device)) return send(400,{error:'Versioned consent and coarse device required'});
        if(sessions.size>=maxSessions)return send(503,{error:'Study capacity reached'});
        const id=randomBytes(24).toString('base64url'),csrf=randomBytes(24).toString('base64url'),withdrawalToken=randomBytes(32).toString('base64url'),index=allocationIndex++;
        sessions.set(id,{csrf,participantId:randomBytes(16).toString('base64url'),withdrawalTokenHash:sha(withdrawalToken),allocationIndex:index,order:studyAssignment(index,allocationSeed),orderIndex:0,attempts:[],device:body.device,expiresAt:Date.now()+900000});
        return send(200,{csrf,withdrawalToken},{'Set-Cookie':`kechap_study=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=900`});
      }
      const id=/(?:^|;\s*)kechap_study=([A-Za-z0-9_-]+)/.exec(req.headers.cookie??'')?.[1],session=sessions.get(id);
      if(!session || req.headers['x-kechap-csrf']!==session.csrf)return send(403,{error:'Study session required'});
      if(session.busy)return send(409,{error:'Previous study request is still processing'});
      session.busy=true;lockedSession=session;
      const context={tenant:'kechap-study',action:STUDY_PROTOCOL,subject:id};
      const finish=async()=>{
        clearTimeout(session.timer);
        const record={schemaVersion:1,protocolVersion:STUDY_PROTOCOL,participantId:session.participantId,kind:'trial',source,consentVersion:CONSENT_VERSION,consented:true,surface:session.order[session.orderIndex],benchmarkRevision:'kechap-toy-replay-v1',allocationIndex:session.allocationIndex,allocationSeed,orderIndex:session.orderIndex,repeatIndex:0,device:session.device,accessibilityGroups:['unspecified'],attempts:session.attempts,wallDurationMs:Math.min(60000,Math.max(Date.now()-session.trialStarted,session.attempts.reduce((n,a)=>n+a.durationMs,0))),withdrawalTokenHash:session.withdrawalTokenHash,fallback:null,excludedReason:null};
        validateStudyRecord(record);await serialize(()=>session.withdrawn ? undefined : appendFile(file,JSON.stringify(record)+'\n',{mode:0o600}));session.orderIndex++;session.attempts=[];session.active=null;
      };
      const attempt=outcome=>({outcome,durationMs:Math.min(15000,Math.max(0,Date.now()-session.started)),groundTruth:'unreviewed',verifierCpuMs:null,costUsd:null});
      if(req.url==='/api/trial'){
        if(session.active){session.attempts.push(attempt('dropout'));await finish();}
        if(session.orderIndex>=3)return send(200,{complete:true});
        if(!session.attempts.length)session.trialStarted=Date.now();
        const issued=await kechap.issue({context,sessionId:id,providers:[session.order[session.orderIndex]],assurance:'interaction'});session.active=issued.id;session.started=Date.now();
        const timedOut=async()=>{
          if(session.withdrawn||session.active!==issued.id)return;
          if(session.busy){session.timer=setTimeout(timedOut,100);session.timer.unref();return;}
          session.busy=true;
          try{session.attempts.push(attempt('dropout'));await finish();}catch{session.withdrawn=true;sessions.delete(id);}finally{session.busy=false;}
        };
        session.timer=setTimeout(timedOut,15000);session.timer.unref();
        return send(200,{...issued,orderIndex:session.orderIndex});
      }
      if(req.url==='/api/result'){
        if(!session.active||session.active!==body.id)return send(403,{error:'Current trial required'});
        clearTimeout(session.timer);
        const result=await kechap.verify({context,id:body.id,response:body.response});
        if(result.ok)await kechap.consume({context,token:result.token});
        session.attempts.push(attempt(result.ok?'success':'rejected'));session.active=null;
        if(result.ok||session.attempts.length>=2)await finish();return send(200,{ok:result.ok});
      }
      if(req.url==='/api/dropout'){
        if(!session.active)return send(400,{error:'No active trial'});
        session.attempts.push(attempt('dropout'));await finish();return send(200,{ok:true});
      }
      return send(404,{error:'Not found'});
    }catch{return send(400,{error:'Study request failed; no success assumed'});}
    finally{if(lockedSession)lockedSession.busy=false;}
  });
  server.requestTimeout=10000;
  server.once('close',()=>{for(const session of sessions.values())clearTimeout(session.timer);});
  if(source==='human'){
    const purge=()=>{
      const remaining=Date.parse(humanStudy.deleteAt)-Date.now();
      if(remaining>0){purgeTimer=setTimeout(purge,Math.min(2147483647,remaining));purgeTimer.unref();return;}
      for(const session of sessions.values())session.withdrawn=true;sessions.clear();
      serialize(()=>writeFile(file,'',{mode:0o600})).catch(()=>{});
    };purge();server.once('close',()=>clearTimeout(purgeTimer));
  }
  return server;
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const server=await createStudyServer({source:process.env.STUDY_SOURCE??'fixture',allocationSeed:process.env.STUDY_ALLOCATION_SEED??'kechap-study-development-allocation-v1',humanStudy:process.env.STUDY_CONFIG_FILE?JSON.parse(await readFile(process.env.STUDY_CONFIG_FILE,'utf8')):undefined});
  server.listen(Number(process.env.PORT??3001),'127.0.0.1',()=>console.log(`Owned study: http://localhost:${server.address().port} (source=${process.env.STUDY_SOURCE??'fixture'})`));
}
