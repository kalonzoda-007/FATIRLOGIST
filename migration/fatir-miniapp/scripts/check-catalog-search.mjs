import assert from 'node:assert/strict';
import {normalizeProductQuery,canonicalGrade,filterCatalog} from '../.product-picker-test.mjs';

const products=[
 {code:'SKU-000004',name:'Фатир (зард)',weight:50,unit:'bag',grade:'1',category:'Мука и отруби',aliases:['Фатири зард','фз']},
 {code:'SKU-000008',name:'Ачоиб зард',weight:50,unit:'bag',grade:'о/с',category:'Мука и отруби',aliases:['Ачоиб зард О/С']},
 {code:'SKU-000050',name:'Ачоиб в/с 10кг',weight:10,unit:'bag',grade:'в/с',category:'Мука и отруби',aliases:['Ачоиб высший сорт 10кг']},
 {code:'SKU-000051',name:'Мелкий зерно',weight:50,unit:'bag',grade:'м/з',category:'Мука и отруби',aliases:['Майда дон']},
 {code:'SKU-000100',name:'Старт.',weight:40,unit:'bag',grade:'к/к',category:'Комбикорм',aliases:['Старт']}
];
const codes=(query,grade='',category='Все')=>filterCatalog(products,query,grade,category).map(p=>p.code);
assert.equal(normalizeProductQuery('fatir'),'фатир');
assert.equal(canonicalGrade('в/с'),'в/с');
assert.equal(canonicalGrade('о/с'),'о/с');
assert.equal(canonicalGrade('м/з'),'м/з');
assert.equal(canonicalGrade('1 сорт'),'1');
assert.deepEqual(codes('fatir'),['SKU-000004']);
assert.deepEqual(codes('фз'),['SKU-000004']);
assert.deepEqual(codes('SKU-000050'),['SKU-000050']);
assert.deepEqual(codes('в/с'),['SKU-000050']);
assert.deepEqual(codes('м/з'),['SKU-000051']);
assert.deepEqual(codes('1 сорт'),['SKU-000004']);
assert.deepEqual(codes('','', 'Комбикорм'),['SKU-000100']);
assert.deepEqual(codes('','о/с'),['SKU-000008']);
assert.deepEqual(codes('несуществующий'),[]);
console.log('FATIR product search tests: passed (name, transliteration, grade, aliases, SKU and category)');
