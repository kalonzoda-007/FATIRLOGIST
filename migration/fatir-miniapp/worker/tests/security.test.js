import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../src/index.js';
const TOKEN='unit-test-bot-token-NOT-A-REAL-SECRET';
const ORIGIN='https://kalonzoda-007.github.io';
const hmac=(key,data)=>createHmac('sha256',key).update(data).digest('hex');
function telegramData(id='12345678'){
 const p=new URLSearchParams();
 p.set('auth_date',String(Math.floor(Date.now()/1000)));
 p.set('user',JSON.stringify({id:Number(id),first_name:'Tester'}));
 const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>k+'='+v).join('\n');
 const key=createHmac('sha256','WebAppData').update(TOKEN).digest();
 p.set('hash',hmac(key,check)); return p.toString();
}
const request=(path,body,origin=ORIGIN)=>new Request('https://worker.example'+path,{method:'POST',
 headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
function env(extra={}) {
 return {TELEGRAM_BOT_TOKEN:TOKEN,ALLOWED_ORIGIN:ORIGIN,
 N8N_BOOTSTRAP_URL:'https://example.invalid/bootstrap',
 N8N_SUBMIT_URL:'https://example.invalid/submit',
 N8N_STATUS_URL:'https://example.invalid/status',
 N8N_DISCUSSION_URL:'https://example.invalid/discussion',
 ...extra};
}
test('rejects requests without signed Telegram initData',async()=>{
 const r=await worker.fetch(request('/api/bootstrap',{initData:''}),env());
 assert.equal(r.status,401);
});
test('rejects cross-site browser origin',async()=>{
 const r=await worker.fetch(request('/api/bootstrap',{initData:telegramData()},'https://attacker.invalid'),env());
 assert.equal(r.status,403);
});
test('bootstrap requires user ID match and recognized role',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,user:{id:'12345678',role:'logistic',name:'Tester'},products:[],clients:[]}),{status:200});
  const r=await worker.fetch(request('/api/bootstrap',{initData:telegramData()}),env());
  assert.equal(r.status,200);assert.equal((await r.json()).user.role,'logistic');
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,user:{id:'99999999',role:'admin'},products:[],clients:[]}),{status:200});
  const rejected=await worker.fetch(request('/api/bootstrap',{initData:telegramData()}),env());
  assert.equal(rejected.status,403);
 }finally{globalThis.fetch=original}
});
test('refuses discussion writes during migration',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,user:{id:'12345678',role:'logistic'},products:[],clients:[]}),{status:200});
  const r=await worker.fetch(request('/api/discussions/apply',{initData:telegramData()}),env());
  assert.equal(r.status,503);
 }finally{globalThis.fetch=original}
});
test('HMAC verifier rejects bad signature and replay with unique D1 nonce',async()=>{
 const e=env(); const ts=String(Date.now()),nonce='a'.repeat(36);
 const plain={telegram_id:'12345678'},canonical=JSON.stringify(plain);
 const signature=hmac(TOKEN,'FATIR-INTERNAL-V1:'+ts+':'+nonce+':'+canonical);
 const payload={...plain,_fatir_auth:{ts,nonce,signature},_fatir_canonical:canonical};
 const seen=new Set();
 e.DB={prepare:()=>({bind:(nonce)=>({run:async()=>{
  if(seen.has(nonce))throw Error('UNIQUE constraint');
  seen.add(nonce);
 }})})};
 const r=await worker.fetch(request('/api/internal-workflow-verify',{payload}),e);
 assert.equal(r.status,200);assert.equal((await r.json()).verified,true);
 const replay=await worker.fetch(request('/api/internal-workflow-verify',{payload}),e);
 assert.equal(replay.status,409);
 const bad={...payload,_fatir_auth:{ts,nonce:'b'.repeat(36),signature:'0'.repeat(64)}};
 const denied=await worker.fetch(request('/api/internal-workflow-verify',{payload:bad}),e);
 assert.equal(denied.status,401);
});

test('staging never submits a real order to n8n',async()=>{
 const original=globalThis.fetch;
 try {
  let called=0;
  globalThis.fetch=async()=>{called++;throw Error('MUST_NOT_REACH_N8N')};
  const r=await worker.fetch(request('/api/orders',{
   initData:telegramData(),requestId:'test-request-0001',
   clientName:'Тест',city:'Худжанд',deliveryDate:'2026-11-08',
   items:[{productCode:'SKU-000001',quantity:1,plant:'PL-AGR'}]
  }),env());
  assert.equal(r.status,503);
  assert.equal(called,0);
 }finally{globalThis.fetch=original}
});

test('authorized dry-run validates order without invoking submit webhook',async()=>{
 const original=globalThis.fetch; let requests=0;
 try {
  globalThis.fetch=async(url)=>{
   requests++;
   if(String(url)!=='https://example.invalid/bootstrap')throw Error('STAGING_MUST_NOT_WRITE');
   return new Response(JSON.stringify({ok:true,user:{id:'12345678',role:'applicant'},products:[{code:'SKU-000001',name:'Мука',weight:50}],clients:[]}),{status:200});
  };
  const input={initData:telegramData(),requestId:'preview-request-0001',clientName:'Тестовый клиент',
    city:'Худжанд',region:'Согдийская область',deliveryDate:'2026-11-09',
    items:[{productCode:'SKU-000001',quantity:3,plant:'PL-AGR'}]};
  const res=await worker.fetch(request('/api/orders/validate',input),env());
  assert.equal(res.status,200);
  const output=await res.json();
  assert.equal(output.dryRun,true);assert.equal(output.saved,false);
  assert.equal(output.totalBags,3);assert.equal(output.totalWeightKg,150);
  assert.equal(requests,1);
 } finally {globalThis.fetch=original}
});
test('dry-run refuses products not in trusted Google catalog',async()=>{
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,user:{id:'12345678',role:'applicant'},products:[],clients:[]}),{status:200});
  const res=await worker.fetch(request('/api/orders/validate',{
   initData:telegramData(),requestId:'preview-request-0002',clientName:'Тест',city:'Худжанд',deliveryDate:'2026-11-09',
   items:[{productCode:'SKU-000001',quantity:3,plant:'PL-AGR'}]}),env());
  assert.equal(res.status,400);
 } finally {globalThis.fetch=original}
});

test('signed pickup order forwards driver details only when submission is enabled',async()=>{
 const original=globalThis.fetch;
 const calls=[];
 try{
  globalThis.fetch=async(url,opts)=>{
   calls.push({url:String(url),body:JSON.parse(opts.body)});
   if(String(url)==='https://example.invalid/bootstrap')
     return new Response(JSON.stringify({ok:true,user:{id:'12345678',role:'applicant'},products:[{code:'SKU-000001',name:'Мука',weight:50}],clients:[]}),{status:200});
   if(String(url)==='https://example.invalid/submit')
     return new Response(JSON.stringify({ok:true,message:'Workflow was started'}),{status:200});
   throw Error('UNEXPECTED_ENDPOINT');
  };
  const r=await worker.fetch(request('/api/orders',{
    initData:telegramData(),requestId:'preview-request-20261110-0002',clientName:'Тестовый клиент',
    city:'Худжанд',deliveryDate:'2026-11-12',deliveryType:'Самовывоз',
    driverName:'Пример Водителя',driverPhone:'+992 900 000 001',
    vehiclePlate:'4488wa01',vehicleBrand:'Mercedes',vehicleBody:'Фургон',
    items:[{productCode:'SKU-000001',quantity:3,plant:'PL-AGR'}]
   }),env({SUBMIT_ENABLED:'true'}));
   assert.equal(r.status,200);assert.equal((await r.json()).pending,true);
   assert.equal(calls.length,2);
   assert.equal(calls[1].body.driverName,'Пример Водителя');
   assert.equal(calls[1].body.vehiclePlate,'4488WA01');
   assert.equal(calls[1].body.items[0].quantity,3);
   assert.equal(typeof calls[1].body._fatir_auth.signature,'string');
 }finally{globalThis.fetch=original}
});
