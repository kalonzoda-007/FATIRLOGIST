import assert from 'node:assert/strict';
import {uniquePrintedItems,copiesPerPage} from '../.print-pass-test.mjs';

// The screenshot showed the same four products repeated through ~30 rows.
// The permit must display each exact product/quantity/plant combination once.
const source=[];
for(let i=0;i<8;i++)for(const [name,q,kg] of [
 ['Фатир (зард)',200,50],
 ['Односорт рузгор',100,10],
 ['3 сорт 30кг',70,30],
 ['Савуси майда',100,20]
])source.push({name,quantity:q,plant:'PL-AGR',weightKg:q*kg});
const printed=uniquePrintedItems(source);
assert.equal(source.length,32,'input demo remains unchanged');
assert.equal(printed.length,4,'32 repeat rows become exactly 4 print rows');
assert.deepEqual(printed.map(x=>x.quantity),[200,100,70,100]);
assert.equal(printed.reduce((sum,x)=>sum+x.quantity,0),470);
assert.equal(printed.reduce((sum,x)=>sum+(x.weightKg||0),0),15100);

const distinct=[
 {name:'Фатир',quantity:12,plant:'PL-AGR',weightKg:600},
 {name:'Фатир',quantity:12,plant:'PL-ALN',weightKg:600},
 {name:'Фатир',quantity:14,plant:'PL-AGR',weightKg:700}
];
assert.equal(uniquePrintedItems(distinct).length,3,'distinct plants and quantities remain distinct');
assert.equal(uniquePrintedItems([{name:'',quantity:2,plant:''},{name:'Мука',quantity:0,plant:''}]).length,0);
assert.equal(copiesPerPage(1),3);
assert.equal(copiesPerPage(5),3);
assert.equal(copiesPerPage(6),2);
assert.equal(copiesPerPage(12),2);
assert.equal(copiesPerPage(13),1);
assert.equal(copiesPerPage(30),1);
console.log('FATIR print regressions passed: no repeated rows, preserved distinct lines and safe A4 layout');
