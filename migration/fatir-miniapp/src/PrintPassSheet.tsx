import {useEffect,useRef} from 'react';

export type PassItem={name:string;quantity:number;plant:string;weightKg?:number};
export type PassData={
  orderId:string;client:string;destination:string;deliveryDate:string;createdAt:string;
  driver?:string;vehicle?:string;vehicleBrand?:string;vehicleBody?:string;
  driverPhone?:string;passNo?:string;waybillNo?:string;
  warehouseClerkName?:string;cashierName?:string;logisticName?:string;
  totalBags:number;totalWeightKg:number;items:PassItem[];status?:string;demo?:boolean;
};
const fmt=(v:number)=>Number(v||0).toLocaleString('ru-RU');
const display=(v?:string)=>String(v||'').trim()||'________________';
function dateOnly(v:string){
 if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v.slice(8)+'.'+v.slice(5,7)+'.'+v.slice(0,4);
 const t=new Date(v);
 return Number.isNaN(t.getTime())?'—':t.toLocaleDateString('ru-RU',{timeZone:'Asia/Dushanbe'});
}
function Cell({label,value}:{label:string;value?:string}){
 return <div className="rp-cell"><span>{label}</span><strong>{display(value)}</strong></div>;
}
function OneCopy({data,copy}:{data:PassData;copy:'ОХРАНА'|'КЛИЕНТ'}){
 const items=data.items.filter(x=>x.name&&Number(x.quantity)>0);
 return <article className={'rp-copy'+(data.demo?' rp-demo':'')}>
   <div className="rp-title">Экземпляр для {copy==='ОХРАНА'?'охраны':'клиента'}</div>
   <div className="rp-meta"><strong>Рухсатнома № _________</strong><strong>Лента _________</strong></div>
   <div className="rp-company">Фатир Агро</div>
   <div className="rp-details">
     <Cell label="Сана / Дата:" value={dateOnly(data.createdAt)}/>
     <Cell label="№ а/м:" value={data.vehicle}/>
     <Cell label="Ба кӣ / Клиент (Ф.И.О.):" value={data.client}/>
     <Cell label="Тамға а/м:" value={data.vehicleBrand}/>
     <Cell label="Ба вос. кӣ / Водитель (Ф.И.О.):" value={data.driver}/>
     <Cell label="Тип кузова:" value={data.vehicleBody}/>
     <div className="rp-cell rp-wide"><span>Тел. водителя / Рақами ронанда:</span><strong>{display(data.driverPhone)}</strong></div>
   </div>
   <table className="rp-products">
     <colgroup><col style={{width:'7%'}}/><col style={{width:'43%'}}/><col style={{width:'18%'}}/><col style={{width:'14%'}}/><col style={{width:'18%'}}/></colgroup>
     <thead><tr><th>№</th><th>Номгӯи маҳсулот</th><th>Миқдор</th><th>Ченак</th><th>Нетто, кг</th></tr></thead>
     <tbody>{items.map((x,i)=><tr key={i}><td>{i+1}</td><td className="rp-product-name">{x.name}</td><td>{fmt(x.quantity)}</td><td>шт</td><td>{x.weightKg==null?'—':fmt(x.weightKg)}</td></tr>)}</tbody>
     <tfoot><tr><th colSpan={4}>Ҳамагӣ нетто / Итого нетто</th><th>{fmt(data.totalWeightKg)}</th></tr></tfoot>
   </table>
   <div className="rp-qty">Миқдори умумӣ / Всего мешков: <strong>{fmt(data.totalBags)}</strong> · Дата отгрузки: <strong>{dateOnly(data.deliveryDate)}</strong></div>
   <div className="rp-sign">Анбордор / Кладовщик (Ф.И.О.) <span>{display(data.warehouseClerkName)}</span> Имзо <span>________</span></div>
   <div className="rp-sign">Муҳофиза / Охрана <span>________________</span> Имзо <span>________</span></div>
   <div className="rp-sign">Ронанда / Водитель (Ф.И.О.) <span>{display(data.driver)}</span> Имзо <span>________</span></div>
   <div className="rp-sign">Навбатдори хазина / Кассир (Ф.И.О.) <span>{display(data.cashierName)}</span> Имзо <span>________</span></div>
   <div className="rp-sign">Логист / Логист (Ф.И.О.) <span>{display(data.logisticName)}</span> Имзо <span>________</span></div>
   {data.demo&&<div className="rp-watermark">ОБРАЗЕЦ</div>}
   <div className="rp-footer">{data.demo?'НЕ ДЕЙСТВИТЕЛЕН':'Печать не подтверждает разрешение на въезд или отпуск товара'}</div>
 </article>;
}
function Sheet({passes}:{passes:PassData[]}){
 return <div className="rp-a4">
   {passes.slice(0,3).map((p,i)=><section className="rp-pair" key={p.orderId+'-'+i}>
      <OneCopy data={p} copy="ОХРАНА"/>
      <OneCopy data={p} copy="КЛИЕНТ"/>
   </section>)}
 </div>;
}
export default function PrintPassSheet({passes,printKey,onClose}:{passes:PassData[];printKey:number;onClose:()=>void}){
 const last=useRef(-1);
 useEffect(()=>{
   if(!passes.length||last.current===printKey)return;
   last.current=printKey;
   const frame=requestAnimationFrame(()=>requestAnimationFrame(()=>{try{window.print()}catch{/* User can tap Print/PDF */}}));
   return ()=>cancelAnimationFrame(frame);
 },[passes,printKey]);
 if(!passes.length)return null;
 return <>
  <div className="pass-preview-backdrop" role="dialog" aria-modal="true" aria-label="Печать пропусков">
    <div className="pass-preview-panel">
      <div className="pass-preview-toolbar"><strong>Фатир Агро · Рухсатнома</strong><span>А4 · 3 пропуска / лист · охрана + клиент</span>
        <button type="button" onClick={()=>window.print()}>🖨 Печать / PDF</button>
        <button type="button" onClick={onClose}>Закрыть</button>
      </div>
      <div className="pass-screen-help">Товары появляются по фактическому количеству позиций, пустые строки не добавляются. Если товаров слишком много для трёх пропусков, проверьте перенос на дополнительный лист перед печатью.</div>
      <div className="rp-paper-preview"><Sheet passes={passes}/></div>
    </div>
  </div>
  <div className="rp-print-only"><Sheet passes={passes}/></div>
 </>;
}
