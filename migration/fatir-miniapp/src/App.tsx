
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PrintPassSheet, {type PassData} from './PrintPassSheet';
import ProductPicker, {type CatalogProduct} from './ProductPicker';
import { api } from './api';
import { Icon } from '@iconify/react';

declare global {
  interface Window {
    Telegram?: { WebApp?: {
      initData: string;
      ready():void;
      expand():void;
      colorScheme?:string;
      HapticFeedback?: { impactOccurred(type:string):void; notificationOccurred(type:string):void };
    } };
  }
}

type User = {id:string; name:string; role:string};
type Product = CatalogProduct;
type Client = {code:string;name:string;region:string;city:string;active:boolean};
type Line = {key:string; productCode:string; quantity:number;plant:string};
type Order = {
  orderId:string; clientId:string;clientName:string;status:string;reviewReason:string;
  region:string;city:string;address:string;deliveryDate:string;deliveryType:string;
  sourceText:string;totalBags:number;totalWeightKg:number;version:number;
  updatedAt:string;requesterId:string;logisticId:string;
  driverName?:string;driverPhone?:string;vehiclePlate?:string;vehicleBrand?:string;vehicleBody?:string;
  warehouseClerkName?:string;cashierName?:string;logisticName?:string;
};
type OrderLine = {itemId:string;productCode:string;productName:string;quantity:number;plant:string;unitWeight:number;totalWeightKg?:number;matchStatus?:string};
type RecordEvent = {
 id:string;kind:string;createdAt:string;actorId:string;actorName:string;role:string;
 text:string;status?:string;reason?:string;items?:OrderLine[];decidedBy?:string;decisionNote?:string;decidedAt?:string;
};
type Detail = {order:Order;items:OrderLine[];timeline:RecordEvent[];canEdit:boolean;isRequester:boolean;migrationNotice?:string};
type Result = {pending?:boolean;requestId?:string;orderId?:string;clientId?:string;status?:string;requiresReview?:boolean};
const PLANTS=[{code:'PL-AGR',name:'Агро'},{code:'PL-ALN',name:'Альянс'},{code:'PL-GLS',name:'Гулистан'}];
const REGIONS=['Согдийская область','Душанбе','Хатлонская область','ГБАО'];
const statuses:Record<string,{label:string;className:string}>={
  DRAFT:{label:'Новая',className:'draft'},
  NEEDS_REVIEW:{label:'Требует проверки',className:'attention'},
  DISCUSSION:{label:'Обсуждение',className:'discussion'},
  CONFIRMED:{label:'Подтверждена',className:'confirmed'},
  REJECTED:{label:'Отклонена',className:'danger'},
  CANCELLED:{label:'Отменена',className:'danger'},
};
const key=()=>crypto.randomUUID().replace(/-/g,'');
const firstLine=():Line=>({key:key(),productCode:'',quantity:0,plant:''});
const stored=(name:string)=>{try{return sessionStorage.getItem(name)||''}catch{return ''}};
const remember=(name:string,val:string|null)=>{try{val===null?sessionStorage.removeItem(name):sessionStorage.setItem(name,val)}catch{}};
const currentTjDate=()=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dushanbe',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date());const part=(x:string)=>p.find(i=>i.type===x)?.value||'';return part('year')+'-'+part('month')+'-'+part('day')};
const plantName=(id:string)=>PLANTS.find(p=>p.code===id)?.name||'Не выбран';
const fmt=(v:number)=>Number(v||0).toLocaleString('ru-RU');
const fmtTime=(iso:string)=>{try{return new Date(iso).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dushanbe'})}catch{return iso}};
const ico=(name:string,size=20)=><Icon icon={'solar:'+name} width={size} height={size} aria-hidden="true" />;
function Status({value}:{value:string}){const s=statuses[value]||{label:value||'Неизвестно',className:'draft'};return <span className={'status status-'+s.className}><span className="status-dot"/>{s.label}</span>}
function Warning({children}:{children:React.ReactNode}){return <div className="warning">{ico('danger-circle-linear',18)} <span>{children}</span></div>}
const canDiscuss=(status:string)=>status==='DISCUSSION';
function Pill({icon,text}:{icon:string;text:string}){return <span className="pill">{ico(icon,16)}{text}</span>}

export default function App(){
  const [auth,setAuth]=useState<'checking'|'ready'|'denied'>('checking');
  const [authMessage,setAuthMessage]=useState('');
  const [authRetryKey,setAuthRetryKey]=useState(0);
  const [user,setUser]=useState<User|null>(null);
  const [products,setProducts]=useState<Product[]>([]);
  const [clients,setClients]=useState<Client[]>([]);
  const [view,setView]=useState<'new'|'inbox'>('new');
  const [clientId,setClientId]=useState('');
  const [clientName,setClientName]=useState('');
  const [region,setRegion]=useState(REGIONS[0]);
  const [city,setCity]=useState('');
  const [address,setAddress]=useState('');
  const [deliveryDate,setDeliveryDate]=useState(currentTjDate);
  const [deliveryType,setDeliveryType]=useState<'Самовывоз'|'Доставка'>('Самовывоз');
  const [driverName,setDriverName]=useState('');
  const [driverPhone,setDriverPhone]=useState('');
  const [vehiclePlate,setVehiclePlate]=useState('');
  const [vehicleBrand,setVehicleBrand]=useState('');
  const [vehicleBody,setVehicleBody]=useState('');
  const [notes,setNotes]=useState('');
  const [lines,setLines]=useState<Line[]>([firstLine()]);
  const [pickerLineKey,setPickerLineKey]=useState<string|null>(null);
  const [requestId,setRequestId]=useState(()=>stored('fatir.pending')||key());
  const [result,setResult]=useState<Result|null>(()=>stored('fatir.pending')?{pending:true,requestId:stored('fatir.pending')}:null);
  const [busy,setBusy]=useState(false);
  const [errorText,setErrorText]=useState('');
  const [validationNotice,setValidationNotice]=useState('');
  const [pollError,setPollError]=useState('');
  const [printPasses,setPrintPasses]=useState<PassData[]>([]);
  const [printKey,setPrintKey]=useState(0);
  const [printError,setPrintError]=useState('');
  const [batchIds,setBatchIds]=useState<string[]>([]);
  const [batchBusy,setBatchBusy]=useState(false);
  const lastPrintedId=useRef('');
  const botPrintRequested=useRef('');
  const [orders,setOrders]=useState<Order[]>([]);
  const [orderSearch,setOrderSearch]=useState('');
  const [filter,setFilter]=useState('ALL');
  const [selected,setSelected]=useState('');
  const [detail,setDetail]=useState<Detail|null>(null);
  const [listBusy,setListBusy]=useState(false);
  const [detailBusy,setDetailBusy]=useState(false);
  const [discussionError,setDiscussionError]=useState('');
  const [discussionMessage,setDiscussionMessage]=useState('');
  const [commentText,setCommentText]=useState('');
  const [commentKind,setCommentKind]=useState<'QUESTION'|'NOTE'>('QUESTION');
  const [proposalOpen,setProposalOpen]=useState(false);
  const [draftLines,setDraftLines]=useState<Line[]>([]);
  const [proposalReason,setProposalReason]=useState('');
  const [actionBusy,setActionBusy]=useState(false);
  const [applyTarget,setApplyTarget]=useState<RecordEvent|null>(null);
  const initData=window.Telegram?.WebApp?.initData||'';
  const isLogist=['admin','logistic'].includes(user?.role||'');
  const haptic=()=>window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
  const post=useCallback(async(path:string,payload:Record<string,unknown>={})=>{
    const res=await api.post(path,{...payload,initData});
    return res.data;
  },[initData]);
  useEffect(()=>{
    const tg=window.Telegram?.WebApp;
    if(!tg?.initData){setAuth('denied');setAuthMessage('Откройте Mini App через кнопку FATIR-бота в Telegram. Обычная ссылка не передаёт данные авторизации.');return}
    tg.ready();tg.expand();
    let active=true;
    let retryTimer:ReturnType<typeof setTimeout>|undefined;
    setAuth('checking');setAuthMessage('');
    const authenticate=async()=>{
      for(let attempt=0;attempt<2&&active;attempt++){
        try{
          const d=await post('/api/bootstrap');
          if(!active)return;
          setUser(d.user);setProducts(d.products||[]);setClients(d.clients||[]);
          setAuth('ready');setAuthMessage('');
          const q=new URLSearchParams(window.location.search);
          if(q.get('order')){setSelected(q.get('order')||'');setView('inbox')}
          return;
        }catch(e:any){
          if(!active)return;
          const status=e?.response?.status;
          if(attempt===0&&(status===503||status===502||status===504||status==null)){
            setAuthMessage('Google Sheets отвечает с задержкой. Повторная проверка соединения…');
            await new Promise<void>(resolve=>{retryTimer=setTimeout(resolve,1500)});
            continue;
          }
          setAuth('denied');
          setAuthMessage(e?.response?.data?.error||e?.message||'Не удалось проверить доступ');
          return;
        }
      }
    };
    void authenticate();
    return()=>{active=false;if(retryTimer)clearTimeout(retryTimer)};
  },[post,authRetryKey]);
  useEffect(()=>{
    if(auth!=='ready'||!result?.pending||!result.requestId)return;
    let active=true,wait:ReturnType<typeof setTimeout>,attempt=0;
    const poll=async()=>{
      try{
        const d=await post('/api/order-status',{requestId:result.requestId});
        if(!active)return;
        if(d.orderId&&!d.pending){
          remember('fatir.pending',null);setResult({...d,pending:false});setPollError('');return;
        }
        setPollError('');
      }catch{if(active)setPollError('Проверка ответа задерживается. Не отправляйте заказ повторно.')}
      if(active){attempt++;wait=setTimeout(poll,attempt<20?4000:10000)}
    };
    poll();return()=>{active=false;clearTimeout(wait)};
  },[auth,result?.pending,result?.requestId,post]);
  // The authenticated logistic's name comes only from the protected USERS lookup.
  // Never substitute the requester's name or impersonate a different assigned logistic.
  const nameOfLogistic=(order:Order):string=>{
    if(order.logisticName?.trim())return order.logisticName.trim();
    if(user?.role==='logistic'&&user.name?.trim()&&
      (!order.logisticId||String(order.logisticId)===String(user.id)))return user.name.trim();
    return '';
  };
  const openPrintSheet=(entries:PassData[])=>{
    if(!entries.length)return;
    setPrintPasses(entries.slice(0,3));
    setPrintKey(x=>x+1);
  };
  const printRegisteredOrder=useCallback(async(orderId:string)=>{
    if(!/^ORD-\\d{4}-\\d{6}$/.test(orderId))throw Error('Номер ORD не подтверждён');
    const d=await post('/api/discussions/get',{orderId}) as Detail;
    if(d.order?.orderId!==orderId)throw Error('Не удалось проверить заказ перед печатью');
    const pass:PassData={
      orderId:d.order.orderId,client:d.order.clientName,
      driver:d.order.driverName,driverPhone:d.order.driverPhone,vehicle:d.order.vehiclePlate,
      vehicleBrand:d.order.vehicleBrand,vehicleBody:d.order.vehicleBody,
      warehouseClerkName:d.order.warehouseClerkName,cashierName:d.order.cashierName,logisticName:nameOfLogistic(d.order),
      destination:[d.order.region,d.order.city].filter(Boolean).join(', '),
      deliveryDate:d.order.deliveryDate,createdAt:new Date().toISOString(),
      totalBags:d.order.totalBags,totalWeightKg:d.order.totalWeightKg,
      items:d.items.map(item=>({name:item.productName,quantity:item.quantity,plant:item.plant,weightKg:item.unitWeight*item.quantity})),
      status:d.order.status
    };
    setPrintError('');
    setPrintPasses([pass]);setPrintKey(x=>x+1);
  },[post,user]);
  useEffect(()=>{
    // Print only after the server has returned an actual ORD ID and its detail has
    // been fetched from the protected order database. Never print on a dry-run.
    const id=result?.orderId;
    if(auth!=='ready'||result?.pending||!id||!/^ORD-\\d{4}-\\d{6}$/.test(id)||lastPrintedId.current===id)return;
    let active=true;
    lastPrintedId.current=id;
    printRegisteredOrder(id).catch(()=>{
      if(active){lastPrintedId.current='';setPrintError('Пропуск не напечатан: не удалось проверить детали ORD. Используйте кнопку повторной печати.')}
    });
    return()=>{active=false};
  },[auth,result?.pending,result?.orderId,printRegisteredOrder]);
  useEffect(()=>{
    // Telegram's private web_app button opens this route. Query data is only
    // a selector: server verifies Telegram signed initData and order ownership.
    if(auth!=='ready')return;
    const qs=new URLSearchParams(window.location.search);
    const id=qs.get('print');
    if(!id||!/^ORD-\d{4}-\d{6}$/.test(id)||botPrintRequested.current===id)return;
    botPrintRequested.current=id;
    printRegisteredOrder(id).catch((e)=>{
      setPrintError(e?.response?.data?.error||e?.message||'Не удалось проверить право на печать пропуска');
    });
  },[auth,printRegisteredOrder]);
  const printDemo=()=>{
    const selectedClient=clients.find(x=>x.code===clientId);
    const pass:PassData={
      orderId:'ОБРАЗЕЦ',client:selectedClient?.name||clientName||'Тестовый клиент',
      destination:[region,city||'Худжанд'].join(', '),
      deliveryDate,createdAt:new Date().toISOString(),
      totalBags:lines.reduce((sum,x)=>sum+Number(x.quantity||0),0),
      totalWeightKg:lines.reduce((sum,x)=>sum+Number(x.quantity||0)*Number(products.find(p=>p.code===x.productCode)?.weight||0),0),
      items:validLines.map(x=>({name:products.find(p=>p.code===x.productCode)?.name||'Товар для образца',quantity:Number(x.quantity||0),plant:x.plant||''})),
      driver:driverName,driverPhone,vehicle:vehiclePlate,vehicleBrand,vehicleBody,
      logisticName:user?.role==='logistic'?user.name:'',
      demo:true,status:'DEMO'
    };
    openPrintSheet([pass]);
  };
  const togglePassOrder=(id:string)=>{
    setBatchIds(current=>current.includes(id)?current.filter(x=>x!==id):current.length<3?[...current,id]:current);
  };
  const printSelectedPasses=async()=>{
    if(!batchIds.length||batchIds.length>3)return;
    setBatchBusy(true);setDiscussionError('');
    try{
      const selectedOrders=await Promise.all(batchIds.map(async id=>{
        const d=await post('/api/discussions/get',{orderId:id}) as Detail;
        if(d.order?.orderId!==id)throw Error('Номер ORD не подтверждён: '+id);
        return d;
      }));
      openPrintSheet(selectedOrders.map(d=>({
        orderId:d.order.orderId,client:d.order.clientName,
        driver:d.order.driverName,driverPhone:d.order.driverPhone,vehicle:d.order.vehiclePlate,
        vehicleBrand:d.order.vehicleBrand,vehicleBody:d.order.vehicleBody,
        warehouseClerkName:d.order.warehouseClerkName,cashierName:d.order.cashierName,logisticName:nameOfLogistic(d.order),
        destination:[d.order.region,d.order.city].filter(Boolean).join(', '),
        deliveryDate:d.order.deliveryDate,createdAt:new Date().toISOString(),
        totalBags:d.order.totalBags,totalWeightKg:d.order.totalWeightKg,
        items:d.items.map(x=>({name:x.productName,quantity:x.quantity,plant:x.plant,weightKg:x.quantity*x.unitWeight})),
        status:d.order.status
      })));
    }catch(e:any){setDiscussionError(e?.response?.data?.error||e?.message||'Не удалось проверить заявки перед печатью')}
    finally{setBatchBusy(false)}
  };
  const loadOrders=useCallback(async()=>{
    setListBusy(true);setDiscussionError('');
    try{const d=await post('/api/discussions/list');setOrders(d.orders||[])}
    catch(e:any){setDiscussionError(e?.response?.data?.error||e.message||'Не удалось загрузить очередь')}
    finally{setListBusy(false)}
  },[post]);
  const loadDetail=useCallback(async(id:string)=>{
    if(!id)return;
    setDetailBusy(true);setDiscussionError('');
    try{const d=await post('/api/discussions/get',{orderId:id});setDetail(d);setSelected(id)}
    catch(e:any){setDiscussionError(e?.response?.data?.error||e.message||'Не удалось открыть заказ')}
    finally{setDetailBusy(false)}
  },[post]);
  useEffect(()=>{if(auth==='ready'&&view==='inbox')loadOrders()},[auth,view,loadOrders]);
  useEffect(()=>{if(auth==='ready'&&view==='inbox'&&selected)loadDetail(selected)},[auth,view,selected,loadDetail]);
  const totalBags=lines.reduce((sum,l)=>sum+(Number(l.quantity)||0),0);
  const totalWeight=lines.reduce((sum,l)=>sum+(products.find(p=>p.code===l.productCode)?.weight||0)*(Number(l.quantity)||0),0);
  const updateLine=(id:string,patch:Partial<Line>)=>setLines(arr=>{
    const updated=arr.map(l=>l.key===id?{...l,...patch}:l);
    const index=updated.findIndex(l=>l.key===id);
    const last=updated[updated.length-1];
    // Append when the last item becomes complete, regardless of field order.
    // Repeated edits on a completed earlier row never create duplicates.
    if(index===updated.length-1&&last.productCode&&last.plant&&
       Number.isSafeInteger(last.quantity)&&last.quantity>0&&updated.length<30){
      return [...updated,firstLine()];
    }
    return updated;
  });
  const preparedLines=lines.filter(l=>l.productCode||l.plant||l.quantity>0);
  const validLines=preparedLines.filter(l=>l.productCode&&l.plant&&Number.isSafeInteger(l.quantity)&&l.quantity>0);
  const dropLine=(id:string)=>setLines(arr=>{
    const next=arr.filter(l=>l.key!==id);
    return next.length?next:[firstLine()];
  });
  const openNewProduct=()=>{
    const existing=lines.find(l=>!l.productCode);
    if(existing){setPickerLineKey(existing.key);return}
    if(lines.length>=30)return;
    const next=firstLine();
    setLines(current=>[...current,next]);
    setPickerLineKey(next.key);
  };
  const onPickProduct=(product:Product)=>{
    const id=pickerLineKey;
    if(!id)return;
    updateLine(id,{productCode:product.code});
    setPickerLineKey(null);
    haptic();
  };
  const submit=async(mode:'validate'|'create'='validate')=>{
    haptic();setErrorText('');setValidationNotice('');
    if(!clientId&&!clientName.trim()){setErrorText('Выберите клиента или заполните имя нового.');return}
    if(!city.trim()||!deliveryDate){setErrorText('Укажите город и дату отгрузки.');return}
    if(!preparedLines.length||validLines.length!==preparedLines.length){
      setErrorText('Проверьте товар, количество и завод для каждой позиции.');return;
    }
    setBusy(true);
    try{
      const d=await post(mode==='create'?'/api/orders':'/api/orders/validate',{
        requestId,clientId,clientName,region,city,address,deliveryDate,deliveryType,notes,
        driverName:deliveryType==='Самовывоз'?driverName.trim():'',driverPhone:deliveryType==='Самовывоз'?driverPhone.trim():'',
        vehiclePlate:deliveryType==='Самовывоз'?vehiclePlate.trim().toUpperCase():'',
        vehicleBrand:deliveryType==='Самовывоз'?vehicleBrand.trim():'',vehicleBody:deliveryType==='Самовывоз'?vehicleBody.trim():'',
        items:validLines.map(({productCode,quantity,plant})=>({productCode,quantity,plant}))});
      if(mode==='create'){
        if(!d.accepted||!d.pending||d.requestId!==requestId)throw Error('Сервер не подтвердил регистрацию заявки');
        remember('fatir.pending',requestId);
        setResult({pending:true,requestId});
      }else{
        if(!d.ok||!d.dryRun||d.saved!==false)throw Error('Сервер не подтвердил безопасную проверку');
        setValidationNotice('Проверено: '+String(d.totalBags)+' меш., '+String(d.totalWeightKg)+' кг. Данные не отправлены и заказ не создан.');
      }
    }catch(e:any){setErrorText(e?.response?.data?.error||e?.message||'Не удалось сохранить заявку')}
    finally{setBusy(false)}
  };
  const reset=()=>{remember('fatir.pending',null);setResult(null);setClientId('');setClientName('');setCity('');setAddress('');setLines([firstLine()]);setNotes('');setDeliveryType('Самовывоз');setDriverName('');setDriverPhone('');setVehiclePlate('');setVehicleBrand('');setVehicleBody('');setRequestId(key())};
  const allFiltered=useMemo(()=>orders.filter(o=>(filter==='ALL'||o.status===filter)&&
    (o.orderId+' '+o.clientName+' '+o.city).toLowerCase().includes(orderSearch.toLowerCase())),[orders,filter,orderSearch]);
  const postAction=async(endpoint:string,payload:Record<string,unknown>)=>{
    if(!selected)return;
    setActionBusy(true);setDiscussionError('');setDiscussionMessage('');
    try{
      const d=await post(endpoint,{...payload,orderId:selected,eventId:key()});
      setDiscussionMessage(d.duplicate?'Это действие уже сохранено.':d.auditSynced===false
        ?'Действие сохранено в FATIR. Запись в Google Sheets требует проверки синхронизации.':d.delivered===null
        ?'Внутренняя заметка сохранена без уведомления заявщика.':d.delivered===false
        ?'Изменение сохранено. Telegram не доставил уведомление адресату — уточните напрямую.'
        :'Сохранено. Уведомление отправлено в Telegram.');
      await loadDetail(selected);
      setCommentText('');setProposalOpen(false);setProposalReason('');
      await loadOrders();
      haptic();
    }catch(e:any){setDiscussionError(e?.response?.data?.error||e?.message||'Не удалось сохранить действие')}
    finally{setActionBusy(false)}
  };
  const applyApproved=async()=>{
    if(!applyTarget||!selected)return;
    setActionBusy(true);setDiscussionError('');setDiscussionMessage('');
    try{      const d=await post('/api/discussions/apply',{orderId:selected,proposalId:applyTarget.id,eventId:key()});
      if(!d.ok)throw Error('Сервер не подтвердил применение корректировки');
      setApplyTarget(null);
      setDiscussionMessage('Корректировка применена к '+selected+'. Актуальный статус: '+d.status+'.'+(d.auditSynced===false?' Требуется проверка синхронизации журнала Google Sheets.':'')+(d.channelNotified===false?' Канал логистов не получил обновлённую карточку — уведомите логиста вручную.':''));
      await loadDetail(selected);await loadOrders();
      haptic();
    }catch(e:any){setDiscussionError(e?.response?.data?.error||e?.message||'Не удалось применить корректировку');setApplyTarget(null)}
    finally{setActionBusy(false)}
  };
  const openProposal=()=>{
    if(!detail)return;
    setDraftLines(detail.items.map(x=>({key:key(),productCode:x.productCode,plant:x.plant||'',quantity:x.quantity})));
    setProposalReason('');setProposalOpen(true);
  };
  const submitProposal=()=>{
    if(proposalReason.trim().length<5){setDiscussionError('Объясните причину корректировки (от 5 символов).');return}
    if(draftLines.some(x=>!x.productCode||!x.plant||!Number.isSafeInteger(Number(x.quantity))||x.quantity<1)){
      setDiscussionError('Проверьте каждый товар, завод и количество.');return;
    }
    postAction('/api/discussions/propose',{reason:proposalReason,items:draftLines.map(x=>({productCode:x.productCode,plant:x.plant,quantity:x.quantity}))});
  };
  const deliveryLabels=<div className="switcher">
    {(['Самовывоз','Доставка'] as const).map(type=><button type="button" key={type}
      className={'switch-btn '+(deliveryType===type?'selected':'')} onClick={()=>setDeliveryType(type)}>
      {ico(type==='Самовывоз'?'box-linear':'delivery-linear',20)}{type}</button>)}
  </div>;

  if(auth!=='ready')return <main className="auth-screen">
    <div className="ambient a1"/><div className="ambient a2"/>
    <div className="auth-card glass-card"><div className="mark large">F<span>·</span></div>
      <span className="overline">FATIR · SECURE WORKSPACE</span>
      <h1>{auth==='checking'?'Подключаем рабочее пространство':'Доступ ограничен'}</h1>
      <p>{authMessage||(auth==='checking'?'Проверяем подпись Telegram и список пользователей USERS…':'Не удалось проверить доступ')}</p>
      {auth==='denied'&&!!window.Telegram?.WebApp?.initData&&<button className="btn-primary" type="button" onClick={()=>setAuthRetryKey(n=>n+1)}>
        {ico('refresh-linear',18)} Повторить подключение
      </button>}
      <div className="auth-line">{ico('shield-check-linear',17)} Доступ только сотрудникам FATIR</div>
    </div>
  </main>;

  return <div className="shell">
    <div className="ambient a1"/><div className="ambient a2"/><div className="ambient a3"/>
    <div className="migration-warning" role="status">🧪 ПРОВЕРОЧНАЯ ВЕРСИЯ FATIR. Кнопка «Отправить заявку» создаёт реальный ORD в рабочей базе. «Проверить без отправки» ничего не сохраняет. Изменение согласований пока отключено.</div>
    <header className="site-header">
      <div className="header-inner glass-surface">
        <div className="brand" onClick={()=>setView('new')} role="button" tabIndex={0}>
          <div className="mark">F<span>·</span></div>
          <div className="brand-type"><strong>FATIR</strong><small>Logistics Workspace</small></div>
        </div>
        <nav className="main-nav" aria-label="Навигация">
          <button type="button" onClick={()=>setView('new')} className={view==='new'?'active':''}>{ico('document-add-linear',18)} Заявка</button>
          <button type="button" onClick={()=>setView('inbox')} className={view==='inbox'?'active':''}>{ico('chat-round-dots-linear',18)} {isLogist?'Обсуждения':'Мои заявки'}</button>
        </nav>
        <div className="user-pill">{ico('shield-check-linear',16)}
          <span><b>{user?.name||'Сотрудник'}</b><small>{isLogist?'Логистика · авторизован': 'Заявщик · авторизован'}</small></span>
          <div className="user-avatar">{(user?.name||'F').slice(0,1).toUpperCase()}</div>
        </div>
      </div>
    </header>
    <main className="app-main">
    {printError&&<Warning>{printError}</Warning>}
    {view==='new'?<>
      <section className="hero">
        <div className="hero-copy"><div className="overline"><span className="live-dot"/> FATIR / ORDER MANAGEMENT / 01</div>
          <h1>Новая <em>заявка.</em></h1>
          <p>Клиент, товары и отгрузка — всё в одном удобном рабочем пространстве.</p>
          <div className="hero-pills"><Pill icon="shield-check-linear" text="Защищено Telegram"/><Pill icon="buildings-linear" text="3 завода"/><Pill icon="box-linear" text={products.length+' товаров'}/></div>
        </div>
        <div className="hero-illustration glass-card"><div className="orb-illustration">
          {ico('box-minimalistic-linear',60)}</div><div className="orb-meta"><span>FATIR FLOW</span><b>Order → Logistics</b></div></div>
      </section>
      {result?<section className="result-card glass-card">
        <div className="result-icon">{ico(result.pending?'hourglass-line-linear':'check-circle-bold-duotone',42)}</div>
        <span className="overline">{result.pending?'ОБРАБОТКА ЗАЯВКИ':'ЗАЯВКА ЗАРЕГИСТРИРОВАНА'}</span>
        <h2>{result.pending?'Ожидаем номер ORD':result.orderId}</h2>
        <p>{result.pending?'Выполняется проверка товаров и запись в Google Sheets. Не отправляйте заявку повторно.':
          'Номер клиента: '+result.clientId+'. '+(result.requiresReview?'Нужно согласование нового клиента.':'Логистика получила заявку.')}</p>
        {pollError&&<Warning>{pollError}</Warning>}
        {printError&&<Warning>{printError}</Warning>}
        {!result.pending&&result.orderId&&<button type="button" className="btn-light" onClick={()=>printRegisteredOrder(result.orderId!).catch(()=>setPrintError('Не удалось проверить ORD для печати'))}>{ico('printer-linear',18)} Повторно распечатать 2 экземпляра</button>}
        {!result.pending&&<button type="button" className="btn-primary" onClick={reset}>{ico('add-circle-linear',20)} Создать следующую</button>}
      </section>:<div className="form-layout">
        <div className="form-panels">
          <section className="form-card glass-card">
            <div className="card-head"><div className="step-icon">{ico('user-id-linear',22)}</div><div><span className="step-label">ШАГ 01 / 03</span><h2>Клиент</h2><p>Выберите из базы или добавьте нового</p></div></div>
            <div className="field"><label htmlFor="customer">Клиент из базы</label><div className="control-wrap">{ico('users-group-rounded-linear',19)}
              <select id="customer" value={clientId} onChange={e=>{
                const v=e.target.value;setClientId(v);
                const c=clients.find(x=>x.code===v);
                if(c){setClientName('');setRegion(c.region||REGIONS[0]);setCity(c.city||'')}
              }}><option value="">+ Новый клиент</option>{clients.map(c=><option key={c.code} value={c.code}>{c.name} · {c.code}</option>)}</select>
            </div></div>
            {!clientId&&<div className="field"><label htmlFor="customer-new">Имя нового клиента</label><input id="customer-new" placeholder="Имя или название магазина"
                value={clientName} onChange={e=>setClientName(e.target.value)} maxLength={160}/><p className="field-hint">Код клиента назначится автоматически, подтвердит логист.</p></div>}
            <div className="field-grid"><div className="field"><label htmlFor="region">Регион</label><select id="region" value={region} onChange={e=>setRegion(e.target.value)}>
              {REGIONS.map(x=><option key={x}>{x}</option>)}</select></div>
              <div className="field"><label htmlFor="city">Город / район</label><input id="city" placeholder="Например, Истаравшан" value={city} onChange={e=>setCity(e.target.value)} maxLength={160}/></div></div>
          </section>
          <section className="form-card glass-card">
            <div className="card-head"><div className="step-icon">{ico('box-linear',22)}</div><div><span className="step-label">ШАГ 02 / 03</span><h2>Товары и заводы</h2><p>Один заказ с нескольких производств</p></div></div>
            {lines.map((line,i)=>{
              const p=products.find(x=>x.code===line.productCode);
              return <div className="line-card" key={line.key}>
                <div className="line-top"><span className="line-index">{String(i+1).padStart(2,'0')}</span><strong>{line.productCode&&line.plant&&line.quantity>0?'Добавлен':'Выберите товар'}</strong>
                  <button type="button" className="icon-button danger-hover" title="Убрать позицию" disabled={lines.length===1}
                   onClick={()=>dropLine(line.key)}>{ico('trash-bin-trash-linear',18)}</button>
                </div>
                <div className="field"><label htmlFor={'product-'+line.key}>Наименование товара</label>
                  <button type="button" id={'product-'+line.key} className={'catalog-select-trigger'+(p?' has-product':'')}
                    aria-haspopup="dialog" title="Открыть быстрый поиск товара"
                    onClick={()=>setPickerLineKey(line.key)}>
                    <span className="catalog-select-icon">{ico('magnifer-linear',18)}</span>
                    <span className="catalog-select-text">
                      <strong>{p?p.name:'Найти и выбрать товар'}</strong>
                      <small>{p?p.code+' · '+p.weight+' кг / мешок'+(p.grade?' · '+p.grade:''):'Поиск по имени, сорту, транскрипции или SKU'}</small>
                    </span>
                    {ico('alt-arrow-down-linear',17)}
                  </button>
                </div>
                <div className="field-grid"><div className="field"><label htmlFor={'plant-'+line.key}>Завод</label><select id={'plant-'+line.key} value={line.plant}
                  onChange={e=>updateLine(line.key,{plant:e.target.value})}><option value="">Выбрать завод</option>
                  {PLANTS.map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select></div>
                  <div className="field"><label htmlFor={'qty-'+line.key}>Количество, мешков</label><div className="quantity-control">
                    <button type="button" onClick={()=>updateLine(line.key,{quantity:Math.max(0,line.quantity-1)})}>{ico('minus-circle-linear',19)}</button>
                    <input id={'qty-'+line.key} aria-label={'Количество мешков, товар '+(i+1)} inputMode="numeric" type="number" min={1} max={100000}
                      placeholder="0" value={line.quantity>0?line.quantity:''}
                      onChange={e=>updateLine(line.key,{quantity:e.target.value===''?0:Number(e.target.value)})}/>
                    <button type="button" onClick={()=>updateLine(line.key,{quantity:line.quantity+1})}>{ico('add-circle-linear',19)}</button>
                  </div></div></div>
                {p&&<div className="line-footer"><span>{p.weight} кг / мешок</span><b>{fmt(p.weight*line.quantity)} кг</b></div>}
              </div>
            })}
            <div className="product-auto-hint">{ico('check-circle-linear',18)} Заполните товар, завод и количество — следующая позиция появится автоматически.</div>
            <button type="button" className="btn-dashed" disabled={lines.length>=30&&!lines.some(l=>!l.productCode)}
              onClick={openNewProduct}>{ico('add-circle-linear',18)} {lines.length>=30&&!lines.some(l=>!l.productCode)?'Максимум 30 товаров':'Добавить товар — быстрый поиск'}</button>
            <div className="total-strip"><div><span>Всего мешков</span><strong>{fmt(totalBags)}</strong></div>
              <div><span>Общая масса</span><strong>{fmt(totalWeight)} <small>кг</small></strong></div></div>
            <p className="notice-line">{ico('info-circle-linear',16)} Выбранный завод не означает резервирование. Остатки подтверждает склад.</p>
          </section>
          <section className="form-card glass-card">
            <div className="card-head"><div className="step-icon">{ico('delivery-linear',23)}</div><div><span className="step-label">ШАГ 03 / 03</span><h2>Отгрузка</h2><p>Условия получения и дополнительные сведения</p></div></div>
            <div className="field"><label>Способ получения</label>{deliveryLabels}</div>
            {deliveryType==='Самовывоз'&&<div className="pickup-driver-panel">
              <div className="pickup-driver-header">{ico('steering-wheel-linear',22)}<div><strong>Водитель самовывоза</strong>
                <p>Информация для охраны и печатного пропуска. Если водитель ещё неизвестен, поля можно дополнить позднее.</p></div></div>
              <div className="field"><label htmlFor="pickup-driver-name">Ф.И.О. водителя</label>
                <input id="pickup-driver-name" value={driverName} onChange={e=>setDriverName(e.target.value)}
                  placeholder="Имя и фамилия" maxLength={120} autoComplete="off"/></div>
              <div className="field-grid">
                <div className="field"><label htmlFor="pickup-driver-phone">Телефон водителя</label>
                  <input id="pickup-driver-phone" type="tel" inputMode="tel" autoComplete="tel"
                    value={driverPhone} onChange={e=>setDriverPhone(e.target.value)}
                    placeholder="+992 9XX XX XX XX" maxLength={30}/></div>
                <div className="field"><label htmlFor="pickup-plate">Госномер автомобиля</label>
                  <input id="pickup-plate" value={vehiclePlate}
                    onChange={e=>setVehiclePlate(e.target.value.toUpperCase())}
                    placeholder="Например, 4488WA01" maxLength={24}/></div>
              </div>
              <div className="field-grid">
                <div className="field"><label htmlFor="pickup-brand">Марка автомобиля</label>
                  <input id="pickup-brand" value={vehicleBrand} onChange={e=>setVehicleBrand(e.target.value)}
                    placeholder="Например, Mercedes-Benz" maxLength={80}/></div>
                <div className="field"><label htmlFor="pickup-body">Тип кузова</label>
                  <select id="pickup-body" value={vehicleBody} onChange={e=>setVehicleBody(e.target.value)}>
                    <option value="">Не указан</option><option>Фургон</option><option>Бортовой</option>
                    <option>Тентованный</option><option>Микроавтобус</option><option>Другой</option>
                  </select></div>
              </div>
            </div>}
            <div className="field-grid"><div className="field"><label htmlFor="date">Желаемая дата</label><input id="date" type="date" value={deliveryDate} onChange={e=>setDeliveryDate(e.target.value)}/></div>
              <div className="field"><label htmlFor="address">Адрес / ориентир</label><input id="address" value={address} onChange={e=>setAddress(e.target.value)} placeholder="При необходимости" maxLength={160}/></div></div>
            <div className="field"><label htmlFor="notes">Примечание к заказу</label><textarea id="notes" rows={3} value={notes}
              onChange={e=>setNotes(e.target.value)} placeholder="Уточнения, автомобиль клиента, пожелания..." maxLength={400}/></div>
          </section>
          {errorText&&<Warning>{errorText}</Warning>}
          {validationNotice&&<div className="notice-success">{ico('check-circle-linear',18)} {validationNotice}</div>}
          <div className="pass-demo-actions"><button type="button" className="btn-light" onClick={printDemo}>{ico('printer-linear',18)} Посмотреть образец пропуска A4 (2 копии)</button><small>Образец с водяным знаком, не является пропуском на территорию</small></div>
          <div className="submit-row"><p>{ico('shield-check-linear',17)} Только авторизованные заявки</p>
            <div className="submit-actions">
              <button type="button" className="btn-light" disabled={busy||!products.length||!preparedLines.length}
                onClick={()=>submit('validate')}>{busy?'Проверяем…':'Проверить без отправки'}</button>
              <button type="button" className="btn-primary" disabled={busy||!products.length||!preparedLines.length}
                title="Сохранить реальный заказ в рабочей системе FATIR" onClick={()=>submit('create')}>
                {busy?'Обработка…':'Отправить заявку'} {ico('arrow-right-up-linear',19)}</button>
            </div></div>
        </div>
        <aside className="summary-column"><div className="summary-card glass-card">
          <div className="summary-head">{ico('clipboard-list-linear',21)}<span>Обзор заказа</span></div>
          <div className="summary-number">{String(totalBags).padStart(2,'0')}<small>мешков</small></div>
          <div className="summary-kpi"><span>Масса</span><b>{fmt(totalWeight)} кг</b></div>
          <div className="summary-kpi"><span>Заводов</span><b>{new Set(lines.filter(x=>x.plant).map(x=>x.plant)).size}</b></div>
          <div className="summary-kpi"><span>Способ получения</span><b>{deliveryType}</b></div>
          <div className="summary-divider"/>
          <p>{ico('shield-check-linear',18)} Регистрация через защищённый сервер FATIR</p>
        </div></aside>
      </div>}
    </>:<>
      <section className="hero inbox-hero"><div><div className="overline"><span className="live-dot"/> FATIR / DISCUSSION DESK / 02</div>
        <h1>{isLogist?'Рабочее место':'Мои'} <em>{isLogist?'логиста.':'заявки.'}</em></h1>
        <p>История решений, уточнения и согласование изменений по каждому ORD.</p></div>
        <button className="btn-light" onClick={loadOrders} disabled={listBusy}>{ico('refresh-linear',19)} Обновить</button>
      </section>
      <div className="workspace">
        <aside className={'queue glass-card '+(selected?'queue-mobile-hide':'')}>
          <div className="queue-head"><div><span className="overline">РАБОЧАЯ ОЧЕРЕДЬ</span><h2>Заявки <span>{orders.length}</span></h2></div>
            <button title="Обновить" className="icon-button" onClick={loadOrders}>{ico('refresh-circle-linear',20)}</button></div>
          <div className="queue-search">{ico('magnifer-linear',19)}<input placeholder="Поиск ORD, клиента, города..." value={orderSearch} onChange={e=>setOrderSearch(e.target.value)}/></div>
          <div className="filters">
            {[['ALL','Все'],['DISCUSSION','Обсуждение'],['NEEDS_REVIEW','Проверить'],['DRAFT','Новые']].map(([val,label])=>
              <button key={val} className={filter===val?'on':''} onClick={()=>setFilter(val)}>{label}</button>)}
          </div>
          <div className="pass-batch-selector">
            <div className="pass-batch-title">Печать на A4 · до 3 пропусков, по 2 копии</div>
            <div className="pass-batch-picks">
              {allFiltered.slice(0,40).map(o=><label key={o.orderId} className="pass-batch-choice">
                <input type="checkbox" checked={batchIds.includes(o.orderId)}
                  disabled={!batchIds.includes(o.orderId)&&batchIds.length>=3}
                  onChange={()=>togglePassOrder(o.orderId)}/>
                <span>{o.orderId}</span>
              </label>)}
            </div>
            <button type="button" className="btn-light pass-batch-go" disabled={!batchIds.length||batchBusy}
              onClick={printSelectedPasses}>{ico('printer-linear',16)}
              {batchBusy?'Проверяем заказы…':'Печать выбранных ('+batchIds.length+'/3)'}</button>
          </div>
          <div className="queue-list">
            {listBusy&&<div className="queue-empty">Обновляем список…</div>}
            {!listBusy&&!allFiltered.length&&<div className="queue-empty">{ico('box-linear',25)}<span>Заявок по фильтру нет</span></div>}
            {allFiltered.map(o=><button type="button" key={o.orderId} className={'queue-item '+(selected===o.orderId?'active':'')}
              onClick={()=>{haptic();setSelected(o.orderId);setDetail(null);setProposalOpen(false)}}>
              <div className="queue-top"><b>{o.orderId}</b><span>{fmtTime(o.updatedAt)}</span></div>
              <div className="queue-client">{o.clientName||'Клиент не указан'}</div>
              <div className="queue-bottom"><Status value={o.status}/><span>{fmt(o.totalBags)} меш.</span></div>
            </button>)}
          </div>
        </aside>
        <div className="order-desk glass-card">
          {selected&&<button type="button" className="back-mobile" onClick={()=>{setSelected('');setDetail(null)}}>{ico('alt-arrow-left-linear',19)} Все заявки</button>}
          {discussionError&&<Warning>{discussionError}</Warning>}
          {discussionMessage&&<div className="notice-success">{ico('check-circle-linear',18)} {discussionMessage}</div>}
          {!selected?<div className="blank-desk"><div className="blank-graphic">{ico('chat-round-dots-linear',45)}</div>
            <h2>Выберите заявку</h2><p>Здесь появятся детали заказа, история обсуждения и инструменты логиста.</p></div>:
          detailBusy&&!detail?<div className="blank-desk"><div className="loader"/><p>Загружаем историю заказа…</p></div>:
          detail?<div className="desk-content">
            <div className="order-top"><div><span className="overline">ЗАЯВКА / {detail.order.orderId}</span>
              <h2>{detail.order.clientName||'Неизвестный клиент'}</h2>
              <p>{ico('map-point-linear',17)} {detail.order.region}, {detail.order.city}</p></div>
              <div className="order-actions"><Status value={detail.order.status}/><button className="icon-button" title="Обновить карточку" onClick={()=>loadDetail(selected)}>{ico('refresh-linear',19)}</button></div></div>
            <div className="metrics">
              <div>{ico('box-linear',20)}<div><span>Мешки</span><b>{fmt(detail.order.totalBags)}</b></div></div>
              <div>{ico('scale-linear',20)}<div><span>Масса</span><b>{fmt(detail.order.totalWeightKg)} кг</b></div></div>
              <div>{ico('calendar-linear',20)}<div><span>Дата</span><b>{detail.order.deliveryDate||'Не указана'}</b></div></div>
              <div>{ico('delivery-linear',20)}<div><span>Получение</span><b>{detail.order.deliveryType||'Не указано'}</b></div></div>
            </div>
            {!!detail.order.reviewReason&&<Warning>Причина проверки: {detail.order.reviewReason}</Warning>}
            <div className="desk-section"><div className="desk-title"><div>{ico('box-linear',21)}<h3>Состав заявки</h3></div><span>{detail.items.length} поз.</span></div>              <div className="goods-table">{detail.items.map((line,i)=><div className="goods-row" key={line.itemId||i}>
                <div className="goods-num">{String(i+1).padStart(2,'0')}</div><div className="goods-name"><b>{line.productName}</b><small>{line.productCode||'SKU не подтверждён'} · {plantName(line.plant)}</small></div>
                <div className="goods-qty"><b>{fmt(line.quantity)}</b><small>меш.</small></div>
                <div className="goods-mass"><b>{fmt(line.quantity*line.unitWeight)}</b><small>кг</small></div>
              </div>)}</div>
            </div>
            <div className="desk-section"><div className="desk-title"><div>{ico('chat-line-linear',21)}<h3>Обсуждение и история</h3></div><span>{detail.timeline.length} событий</span></div>
              {!detail.timeline.length&&<div className="conversation-empty">{ico('chat-round-dots-linear',24)}
                <p>{detail.migrationNotice || 'Пока нет сообщений. История обсуждений ещё не подтверждена.'}</p></div>}
              <div className="timeline">{detail.timeline.map(ev=><div className={'message '+(ev.actorId===user?.id?'mine':'')} key={ev.id}>
                <div className="message-avatar">{ev.actorName?.charAt(0)||'F'}</div><div className="message-body">
                  <div className="message-meta"><b>{ev.actorName||ev.role}</b><span>{fmtTime(ev.createdAt)}</span></div>
                  {ev.kind==='PROPOSAL'?<div className="proposal-message">
                    <div className="proposal-header">{ico('document-add-linear',19)} Предложение по товарам <Status value={ev.status==='PENDING'?'DISCUSSION':ev.status==='ACCEPTED'?'CONFIRMED':'REJECTED'}/></div>
                    <p>{ev.reason||ev.text}</p>
                    {ev.items?.map((li,i)=><div className="proposal-summary" key={i}>
                      <span>{li.productName} · {plantName(li.plant)}</span><b>{fmt(li.quantity)} меш.</b></div>)}
                    {ev.status==='PENDING'&&detail.isRequester&&ev.actorId!==user?.id&&<div className="decision-actions">
                      <button className="btn-primary small" disabled={actionBusy} onClick={()=>postAction('/api/discussions/decision',{proposalId:ev.id,approve:true})}>{ico('check-circle-linear',18)} Согласовать</button>
                      <button className="btn-light small" disabled={actionBusy} onClick={()=>postAction('/api/discussions/decision',{proposalId:ev.id,approve:false})}>{ico('close-circle-linear',18)} Отклонить</button>
                    </div>}
                    {ev.status==='ACCEPTED'&&<div className="apply-panel">
                      <p className="proposal-foot">{ico('info-circle-linear',17)} Заявщик согласовал предложенные изменения. Логист может применить их к ORD после проверки.</p>
                      {detail.canEdit&&detail.order.status==='DISCUSSION'&&<button className="btn-primary small" disabled={actionBusy}
                        onClick={()=>setApplyTarget(ev)}>{ico('check-circle-linear',17)} Применить к ORD</button>}
                    </div>}
                    {ev.status==='APPLIED'&&<p className="proposal-foot">{ico('check-circle-linear',17)} Изменения сохранены в Google Sheets. Заявка передана на повторную проверку.</p>}
                  </div>:<p>{ev.text}</p>}
                </div>
              </div>)}</div>
              {!canDiscuss(detail.order.status)&&['DRAFT','NEEDS_REVIEW'].includes(detail.order.status)&&detail.canEdit&&<div className="notice-line start-hint">{ico('info-circle-linear',17)} Для начала обсуждения нажмите «Обсудить» в карточке этого ORD в Telegram-канале логистов. После этого бот пришлёт вам кнопку входа.</div>}
              {canDiscuss(detail.order.status)?<div className="composer">
                <div className="composer-title">{ico('pen-new-square-linear',18)} {isLogist?'Ответ / уточнение от логиста':'Ответ заявщика'}</div>
                <textarea value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder={isLogist?'Что нужно уточнить у заявщика?':'Ответьте на запрос логиста…'} rows={3}/>
                <div className="composer-footer">{isLogist&&<div className="type-toggle"><button className={commentKind==='QUESTION'?'on':''} onClick={()=>setCommentKind('QUESTION')}>Вопрос</button>
                    <button className={commentKind==='NOTE'?'on':''} onClick={()=>setCommentKind('NOTE')}>Заметка</button></div>}
                  <button type="button" className="btn-primary small" disabled={actionBusy||commentText.trim().length<3}
                    onClick={()=>postAction('/api/discussions/comment',{text:commentText,kind:commentKind})}>{ico('plain-2-linear',17)} Отправить</button></div>
              </div>:<div className="notice-line">{ico('lock-keyhole-linear',16)} Обсуждение закрыто для текущего статуса заявки.</div>}
            </div>
            {detail.canEdit&&canDiscuss(detail.order.status)&&<div className="desk-section proposal-panel">
              <div className="desk-title"><div>{ico('pen-new-square-linear',21)}<h3>Уточнение товаров</h3></div>
                <button className="btn-light small" onClick={()=>proposalOpen?setProposalOpen(false):openProposal()}>{ico(proposalOpen?'close-circle-linear':'add-circle-linear',18)} {proposalOpen?'Закрыть':'Предложить правки'}</button></div>
              <p className="muted-copy">Исправления отправляются заявщику на согласование. Исходный ORD и товары остаются неизменными до отдельного применения.</p>
              {proposalOpen&&<div className="proposal-editor">
                {draftLines.map((li,i)=>{
                  const prod=products.find(p=>p.code===li.productCode);
                  return <div className="line-card" key={li.key}><div className="line-top"><b>Позиция {i+1}</b>
                    <span className="proposal-locked-count">{ico('lock-keyhole-linear',14)} Фиксированная позиция</span></div>
                    <div className="field"><label>Товар</label><select value={li.productCode} onChange={e=>setDraftLines(arr=>arr.map(x=>x.key===li.key?{...x,productCode:e.target.value}:x))}>
                      <option value="">Выберите товар</option>{products.map(p=><option value={p.code} key={p.code}>{p.name} · {p.code}</option>)}</select></div>
                    <div className="field-grid"><div className="field"><label>Завод</label><select value={li.plant} onChange={e=>setDraftLines(arr=>arr.map(x=>x.key===li.key?{...x,plant:e.target.value}:x))}>
                      <option value="">Выбрать завод</option>{PLANTS.map(p=><option value={p.code} key={p.code}>{p.name}</option>)}</select></div>
                      <div className="field"><label>Мешки</label><input type="number" min="1" max="100000" value={li.quantity} onChange={e=>setDraftLines(arr=>arr.map(x=>x.key===li.key?{...x,quantity:Number(e.target.value)}:x))}/></div></div>
                    {prod&&<div className="line-footer">{prod.weight} кг за мешок<span>{fmt(prod.weight*li.quantity)} кг</span></div>}
                  </div>;
                })}
                <p className="notice-line">{ico('info-circle-linear',17)} В этой версии можно менять товар, завод и количество существующих позиций. Добавление и удаление строк требует отдельного согласования.</p>
                <div className="field"><label>Причина исправления *</label><textarea value={proposalReason} onChange={e=>setProposalReason(e.target.value)} placeholder="Например: клиент подтвердил 40 вместо 50 мешков, другой завод..." rows={3}/></div>
                <button className="btn-primary" disabled={actionBusy} onClick={submitProposal}>{ico('plain-2-linear',19)} Отправить на согласование</button>
              </div>}
            </div>}
            {!!detail.order.sourceText&&<details className="original-details"><summary>{ico('document-text-linear',18)} Исходное сообщение</summary><pre>{detail.order.sourceText}</pre></details>}
          </div>:<div className="blank-desk"><Warning>Не удалось получить данные заявки. Повторите загрузку.</Warning></div>}
        </div>
      </div>
    </>}
    </main>
    {applyTarget&&<div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="apply-title">
      <div className="dialog-card glass-card">
        <div className="dialog-icon">{ico('shield-check-linear',30)}</div>
        <span className="overline">FATIR / КОНТРОЛЬ ИЗМЕНЕНИЙ</span>
        <h2 id="apply-title">Применить исправления?</h2>
        <p>Будут обновлены товары и итоговая масса заказа <strong>{selected}</strong> в Google Sheets. Перед записью сервер проверит статус, версию ORD, полномочия логиста и официальные SKU.</p>
        <div className="dialog-buttons"><button className="btn-light" disabled={actionBusy} onClick={()=>setApplyTarget(null)}>Отмена</button>
          <button className="btn-primary" disabled={actionBusy} onClick={applyApproved}>{actionBusy?'Применяем…':'Подтвердить применение'} {ico('check-circle-linear',19)}</button></div>
      </div>
    </div>}
    {pickerLineKey&&<ProductPicker products={products}
      currentCode={lines.find(l=>l.key===pickerLineKey)?.productCode}
      onSelect={onPickProduct} onClose={()=>setPickerLineKey(null)}/>}
    {!!printPasses.length&&<PrintPassSheet passes={printPasses} printKey={printKey} onClose={()=>setPrintPasses([])}/>}
    <footer className="site-footer"><span>© FATIR • Logistics Workspace</span><span>Solar icons — 480 Design / IconBuddy · CC BY 4.0</span></footer>
    <nav className="mobile-dock glass-surface" aria-label="Мобильная навигация">
      <button className={view==='new'?'active':''} onClick={()=>setView('new')}>{ico('document-add-linear',22)}<span>Заявка</span></button>
      <button className={view==='inbox'?'active':''} onClick={()=>setView('inbox')}>{ico('chat-round-dots-linear',22)}<span>{isLogist?'Логистика':'Мои заявки'}</span></button>
      <button onClick={()=>{haptic();view==='inbox'?loadOrders():setView('inbox')}}>{ico('refresh-circle-linear',22)}<span>Обновить</span></button>
    </nav>
  </div>;
}
