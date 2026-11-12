import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {Kechap} from '../src/index.js';
import {createKechapRouter} from '../src/express.js';
test('existing Express auth stays authoritative and protected action cannot bypass server proof', async t => {
  const app=express(),calls=[];
  const context={tenant:'existing-app',action:'contact',subject:'existing-auth-user'};
  app.use((req,res,next)=>{if(req.get('authorization')==='Bearer owned-fixture')req.productAuth={sessionId:'product-session',context};next();});
  const kechap=new Kechap({adapters:{fixture:{assurance:'bot-mitigation',issue:async()=>({public:{},private:{}}),verify:async({response})=>response==='valid-owned-fixture'}}});
  const policy={version:'v1',actions:{contact:{normal:{assurance:'bot-mitigation',providers:[{id:'fixture'}]}}}};
  app.use('/security',createKechapRouter({kechap,allowedOrigins:['https://product.example'],resolveSession:req=>req.productAuth,checkCSRF:req=>req.get('x-csrf')==='owned-fixture',rateLimit:()=>true,policy,riskFor:()=> 'normal',execute:({session,proof})=>{calls.push({context:session.context,provider:proof.provider});return {submitted:true};}}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}/security`;
  const post=(path,body,extra={})=>fetch(base+path,{method:'POST',headers:{Origin:'https://product.example','Content-Type':'application/json',Authorization:'Bearer owned-fixture','X-CSRF':'owned-fixture',...extra},body:JSON.stringify(body)});
  assert.equal((await post('/challenge',{}, {Authorization:''})).status,401);
  assert.equal((await post('/execute',{token:'forged'})).status,403);assert.equal(calls.length,0);
  assert.equal((await post('/challenge',{}, {'X-CSRF':'wrong'})).status,403);
  const issued=await(await post('/challenge',{context:{subject:'attacker'},providers:['bypass']})).json();
  const verified=await(await post('/verify',{id:issued.id,response:'valid-owned-fixture'})).json();
  assert.equal(verified.ok,true);
  assert.equal((await post('/execute',{token:verified.token})).status,200);assert.equal(calls.length,1);assert.deepEqual(calls[0].context,context);
  assert.equal((await post('/execute',{token:verified.token})).status,403);assert.equal(calls.length,1);
  assert.equal((await post('/challenge',{huge:'x'.repeat(34000)})).status,413);
});
test('Express integration refuses implicit auth, CSRF or rate limiting defaults',()=>{
  assert.throws(()=>createKechapRouter({}),/Explicit product/);
});
