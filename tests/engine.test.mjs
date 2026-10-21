import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticEngine} from './course-profile-fixture.mjs';
const {initialState,act,claim,wish,power,catalog,courseMap,activeBanner,importCourseHistory,learnedPoints,visiblePoints}=syntheticEngine();
const day='2026-10-16';
test('Учебная награда выдаётся один раз, дэйлик — по одному разу на московскую дату',()=>{
 const s=initialState();claim(s,'lesson',day);claim(s,'lesson',day);assert.equal(s.currency,160);
 claim(s,'daily',day);claim(s,'daily',day);assert.equal(s.currency,220);
 claim(s,'daily','2026-10-17');assert.equal(s.currency,280);
});
test('Легендарная находка — показанная 5★, затем баннер меняется; повторов нет',()=>{
 const s=initialState();s.currency=3200;const ids=[];
 for(let i=0;i<4;i++){const target=activeBanner(s,'outfit');const drop=wish(s,'outfit',()=>0);assert.equal(drop.id,target.id);assert.equal(drop.rarity,5);ids.push(drop.id);}
 assert.equal(new Set(ids).size,4);assert.equal(activeBanner(s,'outfit'),null);
 const before=JSON.stringify(s);assert.throws(()=>wish(s,'outfit',()=>0),/собраны/);assert.equal(JSON.stringify(s),before);
});
test('Гарантии 20 для 5★ и 5 для 4★ или выше; серии независимы',()=>{
 const s=initialState();s.currency=4000;
 for(let i=1;i<=19;i++)assert.equal(wish(s,'artifact',()=>.99).rarity,i%5===0?4:3);
 wish(s,'outfit',()=>.99);assert.equal(s.pity.artifact,19);assert.equal(s.pity.outfit,1);assert.equal(s.pityFour.artifact,4);assert.equal(s.pityFour.outfit,1);
 assert.equal(wish(s,'artifact',()=>.99).rarity,5);assert.equal(s.pity.artifact,0);assert.equal(s.pityFour.artifact,0);
});
test('Нет валюты — нет молитвы и мутаций',()=>{const s=initialState();s.currency=0;const old=JSON.stringify(s);assert.throws(()=>wish(s,'outfit'),/160/);assert.equal(JSON.stringify(s),old);});
test('Усиление сохраняет надетый артефакт; обычный дубликат становится материалом',()=>{
 const s=initialState();assert.throws(()=>act(s,{type:'upgrade',id:'flower'},day),/свободный/);
 s.gold=80;s.inventory.flower.count=2;act(s,{type:'upgrade',id:'flower'},day);assert.equal(s.inventory.flower.count,1);assert.equal(s.inventory.flower.level,1);assert.equal(s.equipped.flower,'flower');assert.equal(s.gold,0);
});
test('Легендарный артефакт не может стать материалом усиления',()=>{
 const s=initialState();s.inventory.eternity={count:1,level:0};assert.throws(()=>act(s,{type:'upgrade',id:'flower'},day),/свободный/);assert.equal(s.inventory.eternity.count,1);
});
test('Повышение и возвышение требуют материалов; мир доступен без редкой добычи',()=>{
 const s=initialState();assert.equal(power(s),43);assert.throws(()=>act(s,{type:'world'},day),/уроке/);
 claim(s,'lesson',day);act(s,{type:'level'},day);assert.equal(power(s),45);act(s,{type:'world'},day);assert.equal(s.world,1);
 assert.throws(()=>act(s,{type:'ascend'},day),/Нужны/);claim(s,'daily',day);act(s,{type:'ascend'},day);assert.equal(s.stage,1);assert.equal(s.petals,0);assert.equal(s.crystals,0);
});
test('Экзамен требует все три поручения и приносит четыре молитвы',()=>{
 const s=initialState();assert.throws(()=>claim(s,'exam',day));for(const t of ['lesson','repair','daily'])claim(s,t,day);
 const old=s.currency;claim(s,'exam',day);assert.equal(s.currency-old,640);claim(s,'exam',day);assert.equal(s.currency-old,640);
});
test('Любой выпавший предмет можно экипировать в правильный слот',()=>{
 const s=initialState();for(const x of catalog){s.inventory[x.id]={count:1,level:0};act(s,{type:'equip',id:x.id},day);assert.equal(s.equipped[x.slot||x.kind],x.id);}
});
test('Разбор даёт 40, дэйлик 60; урок и экзамен сохраняют свои награды',()=>{
 const s=initialState();let previous=s.currency;claim(s,'repair',day);assert.equal(s.currency-previous,40);
 previous=s.currency;claim(s,'daily',day);assert.equal(s.currency-previous,60);
 previous=s.currency;claim(s,'lesson',day);assert.equal(s.currency-previous,160);
 previous=s.currency;claim(s,'exam',day);assert.equal(s.currency-previous,640);
});
test('Десять молитв списывают ровно 1600 и последовательно применяют гарантию',()=>{
 const s=initialState();s.currency=1600;const result=act(s,{type:'wish',banner:'artifact',count:10},day,()=>.99);
 assert.equal(s.currency,0);assert.equal(result.drops.length,10);assert.equal(result.drops[4].rarity,4);assert.equal(result.drops[9].rarity,4);assert.equal(s.pity.artifact,10);assert.equal(s.history.length,10);
});
test('Неполная сумма на десять молитв не запускает частичную серию',()=>{
 const s=initialState();s.currency=1599;const old=JSON.stringify(s);assert.throws(()=>act(s,{type:'wish',banner:'outfit',count:10},day),/1600/);assert.equal(JSON.stringify(s),old);
});
test('Просмотр телепорта не выдаёт награду и не закрывает урок; доступен ближайший шаг',()=>{
 const s=initialState();importCourseHistory(s);const old=JSON.stringify(s);
 assert.throws(()=>act(s,{type:'teleport',id:'unique'},day),/Телепорт откроется/);
 assert.throws(()=>act(s,{type:'teleport',id:'keys'},day),/соответствующей темы/);assert.equal(JSON.stringify(s),old);assert.equal(learnedPoints(s).includes('keys'),false);
 assert.equal(visiblePoints(s).some(p=>p.id==='keys'),true);assert.equal(visiblePoints(s).some(p=>p.id==='unique'),false);
 claim(s,'lesson',day);assert.ok(learnedPoints(s).includes('safe-get'));assert.ok(visiblePoints(s).some(p=>p.id==='unique'));
});
test('Карта содержит текущий и предыдущий регионы; следующий телепорт открывается после экзамена',()=>{
 assert.deepEqual(courseMap.regions.map(r=>r.id),['foundation','structures']);
 const s=initialState();assert.throws(()=>act(s,{type:'teleport',id:'algorithms'},day),/Телепорт откроется/);
 for(const task of ['lesson','repair','daily','exam'])claim(s,task,day);
 assert.throws(()=>act(s,{type:'teleport',id:'algorithms'},day),/Телепорт откроется/);assert.ok(visiblePoints(s).some(p=>p.id==='algorithms'));assert.equal(learnedPoints(s).includes('algorithms'),false);
});
test('Экзамен предыдущего региона доступен отдельно и награждает только один раз',()=>{
 const s=initialState();claim(s,'foundations-exam',day);claim(s,'foundations-exam',day);assert.equal(s.currency,640);assert.equal(s.crystals,2);assert.equal(s.books,4);assert.equal(s.gold,1200);
});

test('Серия ×10 меняет баннер после 5★ и не списывает неиспользованные крутки при полной коллекции',()=>{
 const s=initialState();s.currency=1600;const result=act(s,{type:'wish',banner:'outfit',count:10},day,()=>0);
 assert.equal(result.drops.length,4);assert.equal(new Set(result.drops.map(x=>x.id)).size,4);assert.equal(s.currency,960);assert.equal(activeBanner(s,'outfit'),null);
});
test('Счётчики обоих гарантов переживают нормализацию и восстановление',()=>{
 const s=initialState();s.currency=8000;for(let i=0;i<14;i++)wish(s,'artifact',()=>.99);
 const restored=JSON.parse(JSON.stringify(s));act(restored,{type:'wish',banner:'outfit'},day,()=>.99);
 assert.equal(restored.pity.artifact,14);assert.equal(restored.pityFour.artifact,4);
 assert.equal(wish(restored,'artifact',()=>.99).rarity,4);assert.equal(restored.pity.artifact,15);assert.equal(restored.pityFour.artifact,0);
});
