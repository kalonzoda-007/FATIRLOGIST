import { useEffect, useRef } from 'react';

export type PassItem = { name: string; quantity: number; plant: string; weightKg?: number };
export type PassData = {
  orderId: string;
  client: string;
  destination: string;
  deliveryDate: string;
  createdAt: string;
  driver?: string;
  vehicle?: string;
  totalBags: number;
  totalWeightKg: number;
  items: PassItem[];
  status?: string;
  demo?: boolean;
};

const tidy=(v:string)=>v?.trim()||'—';
const fmt=(v:number)=>Number(v||0).toLocaleString('ru-RU');
function localDate(date:string){
  if(!date)return '—';
  if(/^\d{4}-\d{2}-\d{2}$/.test(date))return date.slice(8,10)+'.'+date.slice(5,7)+'.'+date.slice(0,4);
  const d=new Date(date);
  return Number.isNaN(d.valueOf())?'—':d.toLocaleDateString('ru-RU',{timeZone:'Asia/Dushanbe'});
}
function Copy({data,copy}:{data:PassData,copy:'ОХРАНА'|'СКЛАД'}){
  const preview=data.demo===true;
  const lines=data.items.filter(x=>x.name && x.quantity>0);
  return <div className={'gate-pass-copy'+(preview?' gate-pass-demo':'')}>
    <div className="pass-head"><div><b>FATIR</b><span>МУКОМОЛЬНОЕ ПРОИЗВОДСТВО</span></div>
      <div className="pass-head-right"><strong>ПРОПУСК</strong><small>Экземпляр: {copy}</small></div></div>
    <div className="pass-identity"><span>Заявка № <b>{tidy(data.orderId)}</b></span><span>Дата: <b>{localDate(data.createdAt)}</b></span></div>
    <div className="pass-field"><span>Клиент:</span><strong>{tidy(data.client)}</strong></div>
    <div className="pass-field"><span>Направление:</span><strong>{tidy(data.destination)}</strong></div>
    <div className="pass-field pass-field-split"><div><span>Водитель:</span><strong>{tidy(data.driver||'')}</strong></div>
      <div><span>Автомобиль / госномер:</span><strong>{tidy(data.vehicle||'')}</strong></div></div>
    <div className="pass-goods"><span>Товар:</span><strong>{lines.length?lines.slice(0,2).map(x=>x.name+' — '+fmt(x.quantity)+' меш.').join('; '):'—'}{lines.length>2?' (и ещё '+(lines.length-2)+' поз.)':''}</strong></div>
    <div className="pass-summary"><span>Всего: <b>{fmt(data.totalBags)} меш.</b></span><span>Масса: <b>{fmt(data.totalWeightKg)} кг</b></span>
      <span>Отгрузка: <b>{localDate(data.deliveryDate)}</b></span></div>
    <div className="pass-signatures"><span>Логист: _______________</span><span>Охрана: _______________</span></div>
    <div className="pass-foot">{preview?'ОБРАЗЕЦ — НЕ ДЕЙСТВИТЕЛЕН': 'Въезд и выдача товара — только после разрешения ответственного сотрудника'}</div>
    {preview&&<div className="pass-watermark">ОБРАЗЕЦ</div>}
  </div>;
}
export default function PrintPassSheet({passes,printKey,onClose}:{passes:PassData[];printKey:number;onClose:()=>void}){
  const lastPrint=useRef<number>(-1);
  useEffect(()=>{
    if(!passes.length||printKey===lastPrint.current)return;
    lastPrint.current=printKey;
    // After React commits the printable sheet, invoke native print. Some Telegram
    // mobile webviews may suppress print: a visible manual button remains available.
    const frame=requestAnimationFrame(()=>requestAnimationFrame(()=>{
      try{window.print()}catch{/* user may retry via the print button */}
    }));
    return ()=>cancelAnimationFrame(frame);
  },[passes,printKey]);
  if(!passes.length)return null;
  return <>
    <div className="pass-preview-backdrop" role="dialog" aria-modal="true" aria-label="Печать пропусков">
      <div className="pass-preview-panel">
        <div className="pass-preview-toolbar"><strong>Пропуска FATIR · A4</strong><span>На листе до 3 пропусков, каждый в двух экземплярах</span>
          <button type="button" onClick={()=>window.print()}>Печать / PDF</button>
          <button type="button" onClick={onClose}>Закрыть</button></div>
        <div className="pass-screen-help">Бумага A4, книжная ориентация, масштаб 100%. Если окно печати не появилось автоматически — нажмите «Печать / PDF».</div>
        <div className="pass-paper"><SheetRows passes={passes}/></div>
      </div>
    </div>
    <div className="print-only-pass-paper"><SheetRows passes={passes}/></div>
  </>;
}
function SheetRows({passes}:{passes:PassData[]}){
  return <div className="pass-a4-sheet">
    {Array.from({length:3},(_,i)=>{
      const data=passes[i];
      return <div className={'pass-row '+(!data?'pass-row-unused':'')} key={i}>
        {data?<><Copy data={data} copy="ОХРАНА"/><div className="pass-cut-line" aria-hidden="true"/><Copy data={data} copy="СКЛАД"/></>:<div className="pass-spare-slot">Место для следующего пропуска · № {i+1}</div>}
      </div>;
    })}
  </div>;
}
