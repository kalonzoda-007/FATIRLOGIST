// FATIR migration Worker — SAFE STAGING, not a production replacement.
// Must configure TELEGRAM_BOT_TOKEN, N8N_*_URL as secrets and DB (D1) before testing.
// Discussion writes are disabled until AppDeploy transactional records have been migrated.
const encoder = new TextEncoder();
const text = (v, max=160) => String(v ?? '').trim().slice(0,max);
const hex = bytes => [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const respond=(body,status=200,origin='')=>new Response(JSON.stringify(body),{
  status, headers:{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff',
  ...(origin?{'access-control-allow-origin':origin,'vary':'Origin'}:{})}
});
const cryptoHmac=async(key, message)=>{
  const k=await crypto.subtle.importKey('raw',typeof key==='string'?encoder.encode(key):key,
      {name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',k,encoder.encode(message)));
};
const same=(a,b)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;};
const fromHex=s=>new Uint8Array(s.match(/../g).map(x=>parseInt(x,16)));
const validOrigin=(req,env)=>{
  const origin=req.headers.get('Origin')||'';
  return origin && origin===env.ALLOWED_ORIGIN ? origin : '';
};
const cors=(origin)=>({
  'access-control-allow-origin':origin,'access-control-allow-methods':'POST, GET, OPTIONS',
  'access-control-allow-headers':'Content-Type','access-control-max-age':'600',
  'vary':'Origin'
});
const fail=(msg,status,origin)=>respond({error:msg},status,origin);
async function telegramActor(initData,token) {
  if(typeof initData!=='string'||initData.length>8192)throw Object.assign(new Error('TELEGRAM_AUTH_REQUIRED'),{status:401});
  const p=new URLSearchParams(initData),hash=p.get('hash')||'',when=Number(p.get('auth_date'));
  const age=Math.floor(Date.now()/1000)-when;
  if(!/^[0-9a-f]{64}$/i.test(hash)||!Number.isSafeInteger(when)||age>7200||age< -60)
    throw Object.assign(new Error('TELEGRAM_AUTH_REQUIRED'),{status:401});
  p.delete('hash');
  const check=[...p.entries()].sort(([a],[b])=>a.localeCompare(b,'en'))
    .map(([k,v])=>k+'='+v).join('\n');
  const secret=await cryptoHmac('WebAppData',token);
  const calculated=await cryptoHmac(secret,check);
  if(!same(calculated,fromHex(hash)))throw Object.assign(new Error('TELEGRAM_SIGNATURE_INVALID'),{status:401});
  let user;try{user=JSON.parse(p.get('user')||'{}')}catch{throw Object.assign(new Error('TELEGRAM_USER_INVALID'),{status:401})}
  const id=text(user.id,22);
  if(!/^\d{4,20}$/.test(id))throw Object.assign(new Error('TELEGRAM_USER_INVALID'),{status:401});
  return {id,name:[text(user.first_name),text(user.last_name)].filter(Boolean).join(' ')};
}
async function signedWorkflow(env,key,data) {
  const url=env['N8N_'+key+'_URL'];
  if(!url||!url.startsWith('https://'))throw Object.assign(new Error('N8N_NOT_CONFIGURED'),{status:503});
  const ts=String(Date.now());
  const nonce=hex(crypto.getRandomValues(new Uint8Array(18)));
  const canonical=JSON.stringify(data);
  const signature=hex(await cryptoHmac(env.TELEGRAM_BOT_TOKEN,'FATIR-INTERNAL-V1:'+ts+':'+nonce+':'+canonical));
  const signed={...data,_fatir_auth:{ts,nonce,signature},_fatir_canonical:canonical};
  const abort=new AbortController(), timeout=setTimeout(()=>abort.abort(),27000);
  try {
    const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(signed),signal:abort.signal});
    if(!res.ok)throw Object.assign(new Error('N8N_UNAVAILABLE'),{status:503});
    const payload=await res.json();
    if(!payload||typeof payload!=='object')throw Object.assign(new Error('N8N_INVALID_RESPONSE'),{status:503});
    return payload;
  }finally{clearTimeout(timeout)}
}
async function verifySignedWorkflow(body,env) {
  const p=body?.payload;
  if(!p||typeof p!=='object'||Array.isArray(p))return {ok:false,error:'INVALID_WORKFLOW_SIGNATURE'};
  const meta=p._fatir_auth||{},ts=String(meta.ts??''),nonce=String(meta.nonce??''),
    signature=String(meta.signature??''),canonical=p._fatir_canonical;
  const {_fatir_auth,_fatir_canonical,...unsigned}=p;
  if(!/^\d{13}$/.test(ts)||!/^[0-9a-f]{36}$/.test(nonce)||!/^[0-9a-f]{64}$/.test(signature)
    ||typeof canonical!=='string'||canonical.length>100000||JSON.stringify(unsigned)!==canonical
    ||Math.abs(Date.now()-Number(ts))>90000)return {ok:false,error:'INVALID_WORKFLOW_SIGNATURE'};
  const calc=await cryptoHmac(env.TELEGRAM_BOT_TOKEN,'FATIR-INTERNAL-V1:'+ts+':'+nonce+':'+canonical);
  if(!same(calc,fromHex(signature)))return {ok:false,error:'INVALID_WORKFLOW_SIGNATURE'};
  // D1 primary-key insert prevents replay, including concurrent requests.
  if(!env.DB)return {ok:false,error:'NONCE_STORE_UNAVAILABLE'};
  try {
    await env.DB.prepare('INSERT INTO workflow_nonce (nonce, ts, created_at) VALUES (?1,?2,?3)')
      .bind(nonce,Number(ts),Date.now()).run();
  } catch {return {ok:false,error:'REPLAYED_WORKFLOW_REQUEST'};}
  return {ok:true,verified:true};
}
const validRequest=x=>/^[a-zA-Z0-9_-]{12,90}$/.test(x);
const messageId=(actor,request)=>{let h=2166136261;for(const ch of actor+':'+request)h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;return (h&2147483647)||123456789;};
async function authorize(body,env) {
  const actor=await telegramActor(body.initData,env.TELEGRAM_BOT_TOKEN);
  const catalog=await signedWorkflow(env,'BOOTSTRAP',{telegram_id:actor.id});
  if(catalog.ok!==true||String(catalog.user?.id)!==actor.id)
    throw Object.assign(new Error('ACCESS_DENIED'),{status:403});
  const role=String(catalog.user?.role||'').toLowerCase();
  if(!['admin','logistic','applicant','requester'].includes(role))
    throw Object.assign(new Error('ACCESS_DENIED'),{status:403});
  return {actor,catalog,role};
}
function itemRows(raw,products) {
  if(!Array.isArray(raw)||raw.length<1||raw.length>30)throw Object.assign(new Error('INVALID_ITEMS'),{status:400});
  return raw.map(line=>{
    const product=products.find(x=>x.code===line.productCode);
    const qty=Number(line.quantity);
    if(!product||!Number.isSafeInteger(qty)||qty<1||qty>100000
      ||!['PL-AGR','PL-ALN','PL-GLS'].includes(line.plant))
      throw Object.assign(new Error('INVALID_ITEMS'),{status:400});
    return {productCode:product.code,productName:product.name,quantity:qty,plant:line.plant};
  });
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url),origin=validOrigin(request,env);
    if(request.method==='OPTIONS')
      return origin?new Response(null,{status:204,headers:cors(origin)}):fail('ORIGIN_DENIED',403,'');
    if(url.pathname==='/api/health'&&request.method==='GET')
      return respond({server:'staging',provider:'Cloudflare Worker',ready:false,protected:true},200,origin);
    if(request.method!=='POST')return fail('NOT_FOUND',404,origin);
    // Never allow credentialed browser requests from third-party origins.
    if(!origin && url.pathname!=='/api/internal-workflow-verify')
      return fail('ORIGIN_DENIED',403,'');
    if(!env.TELEGRAM_BOT_TOKEN)return fail('AUTH_NOT_CONFIGURED',503,origin);
    let body;try{body=await request.json()}catch{return fail('INVALID_JSON',400,origin)}
    if(url.pathname==='/api/internal-workflow-verify'){
      const result=await verifySignedWorkflow(body,env);
      return respond(result,result.ok?200:result.error==='REPLAYED_WORKFLOW_REQUEST'?409:result.error==='NONCE_STORE_UNAVAILABLE'?503:401,'');
    }
    try {
      const {actor,catalog,role}=await authorize(body,env);
      if(url.pathname==='/api/bootstrap')
        return respond({user:{id:actor.id,name:actor.name||catalog.user.name,role},
          products:catalog.products||[],clients:catalog.clients||[]},200,origin);
      if(url.pathname==='/api/orders'){
        const req=text(body.requestId,100);
        if(!validRequest(req)||!/^\d{4}-\d{2}-\d{2}$/.test(text(body.deliveryDate)))
          return fail('Проверьте дату и идентификатор заявки',400,origin);
        let clientName=text(body.clientName),region=text(body.region),city=text(body.city);
        if(body.clientId){
          const client=(catalog.clients||[]).find(x=>x.code===body.clientId);
          if(!client)return fail('Клиент отсутствует в базе',400,origin);
          clientName=client.name;region ||= client.region;city ||= client.city;
        }
        if(!clientName||!city)return fail('Укажите клиента и город',400,origin);
        const items=itemRows(body.items,catalog.products||[]);
        await signedWorkflow(env,'SUBMIT',{telegram_id:actor.id,request_id:req,clientName,region,city,
          address:text(body.address),deliveryDate:text(body.deliveryDate),
          deliveryType:body.deliveryType==='Доставка'?'Доставка':'Самовывоз',
          notes:text(body.notes,400),items});
        return respond({accepted:true,pending:true,requestId:req,status:'PROCESSING'},200,origin);
      }
      if(url.pathname==='/api/order-status'){
        const id=text(body.requestId,100);
        if(!validRequest(id))return fail('Недействительный номер запроса',400,origin);
        const result=await signedWorkflow(env,'STATUS',{telegram_id:actor.id,source_key:actor.id+':'+messageId(actor.id,id)});
        if(!result.ok)return fail('Ошибка чтения статуса',503,origin);
        if(result.pending)return respond({pending:true,requestId:id},200,origin);
        return respond({pending:false,orderId:result.orderId,clientId:result.clientId,
          status:result.status,requiresReview:result.status==='NEEDS_REVIEW',delivered:null,
          totalBags:result.totalBags,totalWeightKg:result.totalWeightKg},200,origin);
      }
      if(url.pathname==='/api/discussions/list'||url.pathname==='/api/discussions/get'){
        const action=url.pathname.endsWith('/list')?'list':'get';
        const orderId=text(body.orderId);
        if(action==='get'&&!/^ORD-\d{4}-\d{6}$/.test(orderId))return fail('INVALID_ORDER_ID',400,origin);
        const result=await signedWorkflow(env,'DISCUSSION',{actor_id:actor.id,role,action,order_id:action==='get'?orderId:''});
        if(!result.ok)return fail('Нет доступа к заказу',403,origin);
        if(action==='list')return respond({orders:result.orders||[],total:result.total||0,role},200,origin);
        const order=result.order;
        if(!order||(!['admin','logistic'].includes(role)&&String(order.requesterId)!==actor.id))
          return fail('Нет доступа к заказу',403,origin);
        // Timeline is unavailable until AppDeploy transactional discussion DB is migrated.
        return respond({order,items:result.items||[],timeline:[],canEdit:false,isRequester:order.requesterId===actor.id,
          migrationNotice:'История обсуждения ещё не перенесена. Изменения заблокированы.'},200,origin);
      }
      if(url.pathname.startsWith('/api/discussions/'))
        return fail('Перенос журнала обсуждений ещё не завершён. Изменения временно запрещены в тестовой версии.',503,origin);
      return fail('NOT_FOUND',404,origin);
    }catch(e){
      const status=e?.status||503;
      return fail(status===401?'Откройте FATIR через кнопку Telegram-бота.':status===403?
        'У вас нет доступа к FATIR. Проверьте роль и активность в USERS.':
        status===400?'Проверьте данные заявки.':'Временная ошибка сервера FATIR или n8n.',status,origin);
    }
  }
};