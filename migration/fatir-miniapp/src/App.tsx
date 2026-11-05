
import { useCallback, useEffect, useMemo, useState } from 'react';
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
type Product = {code:string;name:string;weight:number;unit:string;aliases?:string[]};
type Client = {code:string;name:string;region:string;city:string;active:boolean};
type Line = {key:string; productCode:string; quantity:number;plant:string};
type Order = {
  orderId:string; clientId:string;clientName:string;status:string;reviewReason:string;
  region:string;city:string;address:string;deliveryDate:string;deliveryType:string;
  sourceText:string;totalBags:number;totalWeightKg:number;version:number;
  updatedAt:string;requesterId:string;logisticId:string;
};
type OrderLine = {itemId:string;productCode:string;productName:string;quantity:number;plant:string;unitWeight:number;totalWeightKg?:number;matchStatus?:string};
type RecordEvent = {
 id:string;kind:string;createdAt:string;actorId:string;actorName:string;role:string;
 text:string;status?:string;reason?:string;items?:OrderLine[];decidedBy?:string;decisionNote?:string;decidedAt?:string;
};
type Detail = {order:Order;items:OrderLine[];timeline:RecordEvent[];canEdit:boolean;isRequester:boolean};
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
const key=()=>crypto.randomUUID().replaceAll('-','');
const firstLine=():Line=>({key:key(),productCode:'',quantity:1,plant:''});
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
  const [notes,setNotes]=useState('');
  const [lines,setLines]=useState<Line[]>([firstLine()]);
  const [requestId,setRequestId]=useState(()=>stored('fatir.pending')||key());
  const [result,setResult]=useState<Result|null>(()=>stored('fatir.pending')?{pending:true,requestId:stored('fatir.pending')}:null);
  const [busy,setBusy]=useState(false);
  const [errorText,setErrorText]=useState('');
  const [pollError,setPollError]=useState('');
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
    post('/api/bootstrap').then((d)=>{
      setUser(d.user);setProducts(d.products||[]);setClients(d.clients||[]);
      setAuth('ready');
      const q=new URLSearchParams(window.location.search);
      if(q.get('order')){setSelected(q.get('order')||'');setView('inbox')}
    }).catch((e)=>{
      setAuth('denied');
      setAuthMessage(e?.response?.data?.error||e?.message||'Не удалось проверить доступ');
    });
  },[post]);
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
  const updateLine=(id:string,patch:Partial<Line>)=>setLines(arr=>arr.map(l=>l.key===id?{...l,...patch}:l));
  const submit=async()=>{
    haptic();setErrorText('');
    if(!clientId&&!clientName.trim()){setErrorText('Выберите клиента или заполните имя нового.');return}
    if(!city.trim()||!deliveryDate){setErrorText('Укажите город и дату отгрузки.');return}
    if(!lines.length||lines.some(x=>!x.productCode||!x.plant||!Number.isSafeInteger(Number(x.quantity))||x.quantity<1)){
      setErrorText('Проверьте товар, количество и завод для каждой позиции.');return;
    }
    setBusy(true);
    try{
      const d=await post('/api/orders',{requestId,clientId,clientName,region,city,address,deliveryDate,deliveryType,notes,
        items:lines.map(({productCode,quantity,plant})=>({productCode,quantity,plant}))});
      if(!d.accepted)throw Error('Сервер не подтвердил приём заявки');
      remember('fatir.pending',requestId);setResult({pending:true,requestId});
    }catch(e:any){setErrorText(e?.response?.data?.error||e?.message||'Не удалось сохранить заявку')}
    finally{setBusy(false)}
  };
  const reset=()=>{remember('fatir.pending',null);setResult(null);setClientId('');setClientName('');setCity('');setAddress('');setLines([firstLine()]);setNotes('');setDeliveryType('Самовывоз');setRequestId(key())};
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
    try{
      const d=await post('/api/discussions/apply',{orderId:selected,proposalId:applyTarget.id,eventId:key()});
      if(!d.ok)throw Error('Сервер не подтвердил применение корректировки');
      setApplyTarget(null);
      setDiscussionMessage('Корректировка применена к '+selected+'. Актуальный статус: '+d.status+'.'+(d.auditSynced===false?' Требуется проверка синхронизации журнала Google Sheets.':'')+(d.channelNotified===false?' Канал логистов не получил обновлённую карточку — уведомите логиста вручную.':''));
      await loadDetail(selected);await loadOrders();
      haptic();
    }catch(e:any){setDiscussionError(e?.response?.data?.error||e?.message||'Не удалось применить корректировку');setApplyTarget(null)}
    finally{setActionBusy(false)}
  };
  const openProposal=()=>{