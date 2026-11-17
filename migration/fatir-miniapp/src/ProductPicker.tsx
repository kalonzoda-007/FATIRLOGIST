import {useEffect,useMemo,useRef,useState} from 'react';
import {Icon} from '@iconify/react';

export type CatalogProduct={
  code:string;name:string;weight:number;unit:string;
  grade?:string;category?:string;aliases?:string[];
};
const glyph=(name:string,size=18)=><Icon icon={'solar:'+name} width={size} height={size} aria-hidden="true"/>;
const tj=(x:string)=>x.toLowerCase().replace(/қ/g,'к').replace(/ғ/g,'г').replace(/ҷ/g,'ч')
  .replace(/ҳ/g,'х').replace(/ӣ/g,'и').replace(/ӯ/g,'у').replace(/ё/g,'е').replace(/ъ/g,'');
const latinToCyrillic=(value:string)=>value.toLowerCase()
 .replace(/shch/g,'щ').replace(/sch/g,'щ').replace(/zh/g,'ж').replace(/kh/g,'х')
 .replace(/gh/g,'г').replace(/sh/g,'ш').replace(/ch/g,'ч').replace(/ts/g,'ц')
 .replace(/yu/g,'ю').replace(/ya/g,'я').replace(/yo/g,'е')
 .replace(/[a-z]/g,c=>({
  a:'а',b:'б',c:'к',d:'д',e:'е',f:'ф',g:'г',h:'х',i:'и',j:'дж',k:'к',
  l:'л',m:'м',n:'н',o:'о',p:'п',q:'к',r:'р',s:'с',t:'т',u:'у',v:'в',
  w:'в',x:'кс',y:'й',z:'з'
 } as Record<string,string>)[c]||c);
export const normalizeProductQuery=(raw:string)=>{
 const value=String(raw??'').normalize('NFKC').toLowerCase().trim();
 // Distinguish a grade from arbitrary numbers; preserve numeric SKU lookup.
 const trans=value.replace(/[a-z]+/g,x=>/^(?:sku)$/.test(x)?x:latinToCyrillic(x));
 return tj(trans).replace(/[^а-я0-9]+/g,' ').replace(/\s+/g,' ').trim();
};
export const canonicalGrade=(raw:string)=>{
 const n=normalizeProductQuery(raw);
 if(!n)return '';
 if(['1','1с','1сорт','1 сорт','первый сорт'].includes(n))return '1';
 if(['2','2с','2сорт','2 сорт','второй сорт'].includes(n))return '2';
 if(['3','3с','3сорт','3 сорт','третий сорт'].includes(n))return '3';
 if(['в с','вс','выш','высший','высший сорт','выший сорт'].includes(n))return 'в/с';
 if(['о с','ос','односорт','односортка','односортный'].includes(n))return 'о/с';
 if(['м з','мз','мелкий зерно','мелкое зерно'].includes(n))return 'м/з';
 return '';
};
export const filterCatalog=(products:CatalogProduct[],query:string,grade:string,category:string)=>{
 const q=normalizeProductQuery(query);
 const tokens=q.split(' ').filter(Boolean);
 const desired=canonicalGrade(query);
 return products.map(p=>{
   if(!p.name?.trim()||!(p.weight>0))return null;
   const group=p.category||'Мука и отруби';
   if(category!=='Все'&&group!==category)return null;
   if(grade&&canonicalGrade(p.grade||'')!==grade)return null;
   const title=normalizeProductQuery(p.name);
   const code=p.code.toLowerCase();
   const aliases=(p.aliases||[]).map(normalizeProductQuery);
   const searchable=[title,normalizeProductQuery(p.grade||''),...aliases,code,normalizeProductQuery(p.code)].join(' ');
   let score=0;
   if(q){
     const pureGradeQuery=!!desired;
     if(pureGradeQuery){
       if(canonicalGrade(p.grade||'')!==desired)return null;
     }else if(!tokens.every(t=>searchable.includes(t)))return null;
     if(code===query.trim().toLowerCase()||code.endsWith(query.trim().toLowerCase()))score+=120;
     if(title===q)score+=100;
     else if(title.startsWith(q))score+=70;
     else if(title.includes(q))score+=40;
     if(aliases.some(a=>a===q))score+=85;
     if(desired&&canonicalGrade(p.grade||'')===desired)score+=55;
   }
   return {p,score};
 }).filter((x):x is {p:CatalogProduct;score:number}=>!!x)
  .sort((a,b)=>b.score-a.score||a.p.code.localeCompare(b.p.code))
  .slice(0,100).map(x=>x.p);
};
const gradeButtons=[
  {value:'',label:'Все сорта'},{value:'1',label:'1 сорт'},
  {value:'2',label:'2 сорт'},{value:'3',label:'3 сорт'},
  {value:'в/с',label:'В/С'},{value:'о/с',label:'О/С'},{value:'м/з',label:'М/З'}
];
export default function ProductPicker({products,currentCode,onSelect,onClose}:{
 products:CatalogProduct[];currentCode?:string;onSelect:(product:CatalogProduct)=>void;onClose:()=>void;
}){
 const [query,setQuery]=useState('');
 const [grade,setGrade]=useState('');
 const [category,setCategory]=useState('Все');
 const [cursor,setCursor]=useState(0);
 const searchRef=useRef<HTMLInputElement>(null);
 const matches=useMemo(()=>filterCatalog(products,query,grade,category),[products,query,grade,category]);
 useEffect(()=>{searchRef.current?.focus()},[]);
 useEffect(()=>{setCursor(0)},[query,grade,category]);
 useEffect(()=>{
   const handler=(event:KeyboardEvent)=>{
     if(event.key==='Escape'){event.preventDefault();onClose()}
     if(event.key==='ArrowDown'){event.preventDefault();setCursor(x=>Math.min(x+1,Math.max(matches.length-1,0)))}
     if(event.key==='ArrowUp'){event.preventDefault();setCursor(x=>Math.max(0,x-1))}
     if(event.key==='Enter'&&matches[cursor]){event.preventDefault();onSelect(matches[cursor])}
   };
   document.addEventListener('keydown',handler);
   return()=>document.removeEventListener('keydown',handler);
 },[matches,cursor,onSelect,onClose]);
 return (
  <div className="catalog-inline-layer">
   <section className="catalog-picker catalog-picker-inline" role="region" aria-label="Поиск товара в заявке">
    <header className="catalog-picker-head">
      <div><span className="catalog-picker-eyebrow">FATIR · КАТАЛОГ</span><h3>Добавить товар</h3>
        <p>Найдите по названию, транскрипции, сорту или коду SKU</p></div>
      <button className="catalog-picker-close" aria-label="Закрыть" type="button" onClick={onClose}>{glyph('close-circle-linear',24)}</button>
    </header>
    <div className="catalog-picker-search">
      {glyph('magnifer-linear',20)}
      <input ref={searchRef} aria-label="Поиск товаров" type="search" autoComplete="off"
        placeholder="Фатир, fatir, 1 сорт, в/с, SKU-000049…"
        value={query} onChange={e=>setQuery(e.target.value)}/>
      {query&&<button type="button" aria-label="Очистить поиск" onClick={()=>{setQuery('');searchRef.current?.focus()}}>{glyph('close-circle-linear',19)}</button>}
    </div>
    <nav className="catalog-picker-grades" aria-label="Фильтр по сорту">
      {gradeButtons.map(g=><button type="button" key={g.label} className={grade===g.value?'is-active':''}
        onClick={()=>setGrade(g.value)}>{g.label}</button>)}
    </nav>
    <nav className="catalog-picker-categories" aria-label="Категория товаров">
      {['Все','Мука и отруби','Комбикорм'].map(v=><button type="button" key={v} onClick={()=>setCategory(v)}
        className={category===v?'is-active':''}>{v}</button>)}
    </nav>
    <div className="catalog-picker-counter"><span>Найдено: {matches.length}</span><span>Код · Вес · Сорт</span></div>
    <div className="catalog-picker-results" role="listbox" aria-label="Результаты поиска">
      {matches.length===0?<div className="catalog-picker-empty">{glyph('box-minimalistic-linear',28)}
        <strong>Товар не найден</strong><span>Попробуйте другое название, код или снимите фильтр сорта.</span>
        <button type="button" onClick={()=>{setGrade('');setCategory('Все');setQuery('')}}>Сбросить фильтры</button>
      </div>:matches.map((p,i)=><button type="button" role="option" aria-selected={p.code===currentCode}
          className={'catalog-picker-result'+(cursor===i?' is-focused':'')+(p.code===currentCode?' is-selected':'')}
          key={p.code} onMouseEnter={()=>setCursor(i)} onClick={()=>onSelect(p)}>
          <span className="catalog-picker-item-icon">{glyph('box-linear',19)}</span>
          <span className="catalog-picker-item-main"><strong>{p.name}</strong>
            <small>{p.code} · {p.category||'Мука и отруби'}</small></span>
          <span className="catalog-picker-item-detail"><strong>{p.weight} кг</strong>
            <small>{p.grade?('Сорт: '+p.grade):'За мешок'}</small></span>
          {p.code===currentCode?glyph('check-circle-bold',20):glyph('alt-arrow-right-linear',17)}
        </button>)}
    </div>
    <footer className="catalog-picker-foot"><span>Выбор автоматически заполнит позицию товара</span>
      <button type="button" onClick={onClose}>Отмена</button></footer>
   </section>
  </div>);
}
