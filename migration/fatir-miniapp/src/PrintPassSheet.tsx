import {useEffect,useRef} from 'react';

export type PassItem={name:string;quantity:number;plant:string;weightKg?:number};
export type PassData={
  orderId:string;client:string;destination:string;deliveryDate:string;createdAt:string;
  driver?:string;vehicle?:string;vehicleBrand?:string;vehicleBody?:string;
  driverPhone?:string;passNo?:string;waybillNo?:string;
  warehouseClerkName?:string;cashierName?:string;logisticName?:string;
  totalBags:number;totalWeightKg:number;items:PassItem[];status?:string;demo?:boolean;
};
// Print-only normalization: a repeated identical persisted row is shown once in
// the paired permit. The authoritative ORD/ORDER_ITEMS records remain untouched.
export function uniquePrintedItems(items:PassItem[]):PassItem[]{
 const seen=new Set<string>();
 return items.filter(x=>{
   if(!x.name?.trim()||!Number.isFinite(Number(x.quantity))||Number(x.quantity)<=0)return false;
   const identity=[x.name.trim().toLocaleLowerCase(),String(x.plant||'').trim().toLowerCase(),Number(x.quantity),x.weightKg==null?'':Number(x.weightKg)].join('|');
   if(seen.has(identity))return false;
   seen.add(identity);return true;
 });
}
export const copiesPerPage=(count:number)=>count<=5?3:count<=12?2:1;
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
function OneCopy({data,copy}:{data:PassData;copy:'МУҲОФИЗАТ'|'МИЗОҶ'}){
 const items=uniquePrintedItems(data.items);
 const totalKg=items.reduce((sum,x)=>sum+Number(x.weightKg||0),0);
 const bags=items.reduce((sum,x)=>sum+Number(x.quantity||0),0);
 return <article className={'rp-copy'+(data.demo?' rp-demo':'')}>
   <div className="rp-title">Нусха барои {copy==='МУҲОФИЗАТ'?'муҳофизат':'мизоҷ'}</div>
   <div className="rp-meta"><strong>Рухсатнома № _________</strong><strong>Лента _________</strong></div>
   <div className="rp-company">Фатир Агро</div>
   <div className="rp-details">
     <Cell label="Сана:" value={dateOnly(data.createdAt)}/>
     <Cell label="Рақами мошин:" value={data.vehicle}/>
     <Cell label="Ному насаби мизоҷ:" value={data.client}/>
     <Cell label="Тамғаи мошин:" value={data.vehicleBrand}/>
     <Cell label="Ному насаби ронанда:" value={data.driver}/>
     <Cell label="Навъи кузов:" value={data.vehicleBody}/>
     <div className="rp-cell rp-wide"><span>Рақами телефони ронанда:</span><strong>{display(data.driverPhone)}</strong></div>
   </div>
   <table className="rp-products">
     <colgroup><col style={{width:'7%'}}/><col style={{width:'43%'}}/><col style={{width:'18%'}}/><col style={{width:'14%'}}/><col style={{width:'18%'}}/></colgroup>
     <thead><tr><th>№</th><th>Номгӯи маҳсулот</th><th>Миқдор</th><th>Ченак</th><th>Вазни холис, кг</th></tr></thead>
     <tbody>{items.map((x,i)=><tr key={i}><td>{i+1}</td><td className="rp-product-name">{x.name}</td><td>{fmt(x.quantity)}</td><td>дона</td><td>{x.weightKg==null?'—':fmt(x.weightKg)}</td></tr>)}</tbody>
     <tfoot><tr><th colSpan={4}>Ҳамагӣ вазни холис</th><th>{fmt(totalKg)}</th></tr></tfoot>
   </table>
   <div className="rp-qty">Ҳамагӣ халта: <strong>{fmt(bags)}</strong> · Санаи боргирӣ: <strong>{dateOnly(data.deliveryDate)}</strong></div>
   <div className="rp-sign">Ному насаби анбордор <span>{display(data.warehouseClerkName)}</span> Имзо <span>________</span></div>
   <div className="rp-sign">Ному насаби ронанда <span>{display(data.driver)}</span> Имзо <span>________</span></div>
   <div className="rp-sign">Ному насаби хазинадори навбатдор <span>{display(data.cashierName)}</span> Имзо <span>________</span></div>
   <div className="rp-sign">Ному насаби масъули логистика <span>{display(data.logisticName)}</span> Имзо <span>________</span></div>
   {data.demo&&<div className="rp-watermark">НАМУНА</div>}
 </article>;
}
function Sheet({passes}:{passes:PassData[]}){
 // Smaller orders share the A4 sheet. Large orders use more vertical room
 // rather than overflowing into subsequent copies on the same page.
 const pages:PassData[][]=[];
 for(const pass of passes.slice(0,3)){
   const needed=copiesPerPage(uniquePrintedItems(pass.items).length);
   const last=pages[pages.length-1];
   if(!last||last.length>=Math.min(...last.map(x=>copiesPerPage(uniquePrintedItems(x.items).length)),needed)){
     pages.push([pass]);
   }else last.push(pass);
 }
 return <div className="rp-page-stack">
   {pages.map((page,pageNo)=><div className={'rp-a4 rp-layout-'+page.length} key={pageNo}>
     {page.map((p,i)=><section className="rp-pair" key={p.orderId+'-'+i}>
       <OneCopy data={p} copy="МУҲОФИЗАТ"/>
       <OneCopy data={p} copy="МИЗОҶ"/>
     </section>)}
   </div>)}
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
  <div className="pass-preview-backdrop" role="dialog" aria-modal="true" aria-label="Чопи рухсатномаҳо">
    <div className="pass-preview-panel">
      <div className="pass-preview-toolbar"><strong>Фатир Агро · Рухсатнома</strong><span>А4 · то 3 рухсатнома дар як варақ · муҳофизат ва мизоҷ</span>
        <button type="button" onClick={()=>window.print()}>🖨 Чоп / PDF</button>
        <button type="button" onClick={onClose}>Пӯшидан</button>
      </div>
      <div className="pass-screen-help">Шумораи сатрҳо ба шумораи маҳсулот мувофиқ аст; сатрҳои холӣ илова намешаванд. Агар маҳсулот зиёд бошад, пеш аз чоп ҷойгиршавии варақҳоро санҷед.</div>
      <div className="rp-paper-preview"><Sheet passes={passes}/></div>
    </div>
  </div>
  <div className="rp-print-only"><Sheet passes={passes}/></div>
 </>;
}
