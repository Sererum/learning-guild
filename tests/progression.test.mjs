import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticEngine} from './course-profile-fixture.mjs';
const {initialState,normalizeState,act,claim,earnedAchievements,enhancementPlan,power,discoveredZones,explorationPercent,pointRevealed,courseMap,importCourseHistory,learnedPoints,visiblePoints}=syntheticEngine();
const day='2026-10-16';
// Enhancement unit tests supply their own earned inventory. Fresh profiles earn
// these resources through study; they no longer receive a starting gift.
function enhancementFixture(){
 const state=initialState();
 Object.assign(state,{gold:800,books:4,materials:{notes:6,tomes:1,ore:8,crystal:1,cloth:8,silk:1,dust:0}});
 return state;
}
function closeCurrentTopics(s){for(const id of ['lesson','repair','daily','exam'])claim(s,id,day);}
test('Старое сохранение получает новые поля без потери баланса, коллекции и посещений',()=>{
 const s=initialState();s.currency=777;s.inventory.flower.level=3;s.visited=['variables'];delete s.materials;delete s.achievementSlots;delete s.completedTopics;delete s.statues;delete s.characterXp;delete s.inventory.quill;delete s.equipped.weapon;
 normalizeState(s);assert.equal(s.currency,777);assert.equal(s.inventory.flower.level,3);assert.deepEqual(s.visited,['variables']);assert.equal(s.achievementSlots.length,5);assert.equal(s.equipped.weapon,'quill');
 const once=JSON.stringify(s);normalizeState(s);assert.equal(JSON.stringify(s),once);
});
test('Телепорт, статуя и дэйлик не выдают достижение за закрытую тему',()=>{
 const s=initialState(),base=earnedAchievements(s).map(a=>a.id);
 act(s,{type:'teleport',id:'variables'},day);assert.throws(()=>act(s,{type:'activate-statue',id:'foundation-archon'},day),/экзамен/);claim(s,'daily',day);claim(s,'lesson',day);claim(s,'repair',day);
 assert.deepEqual(earnedAchievements(s).map(a=>a.id),base);
 claim(s,'exam',day);assert.ok(earnedAchievements(s).some(a=>a.id==='dict'));assert.ok(earnedAchievements(s).some(a=>a.id==='while'));
});
test('Можно выбрать ровно пять разных полученных достижений и менять их местами',()=>{
 const s=initialState();assert.throws(()=>act(s,{type:'achievement',slot:0,id:'dict'},day),/закрой тему/);closeCurrentTopics(s);
 const ids=['variables','math','conditions','dict','set'];ids.forEach((id,slot)=>act(s,{type:'achievement',slot,id},day));assert.deepEqual(s.achievementSlots,ids);
 act(s,{type:'achievement',slot:0,id:'dict'},day);assert.equal(s.achievementSlots[0],'dict');assert.equal(s.achievementSlots[3],'variables');assert.equal(new Set(s.achievementSlots).size,5);
 assert.throws(()=>act(s,{type:'achievement',slot:5,id:'variables'},day),/пяти/);act(s,{type:'achievement',slot:2,id:null},day);assert.equal(s.achievementSlots[2],null);
});
test('Предварительный расчёт показывает результат и не расходует материалы',()=>{
 const s=enhancementFixture(),before=JSON.stringify(s);const plan=enhancementPlan(s,'character',{books:1});assert.equal(plan.before.level,19);assert.equal(plan.after.level,20);assert.equal(plan.coins,100);assert.equal(plan.after.power,45);assert.equal(JSON.stringify(s),before);
});
test('Небольшие материалы сохраняют неполный опыт; пять заметок дают уровень',()=>{
 const s=enhancementFixture();act(s,{type:'enhance',target:'character',materials:{notes:2}},day);assert.equal(s.level,19);assert.equal(s.characterXp,200);assert.equal(s.materials.notes,4);
 act(s,{type:'enhance',target:'character',materials:{notes:3}},day);assert.equal(s.level,20);assert.equal(s.characterXp,0);assert.equal(s.materials.notes,1);assert.equal(s.gold,700);
});
test('Превышение предела, дробное количество и недостаток монет не расходуют ресурсы',()=>{
 const s=enhancementFixture();for(const materials of [{tomes:1},{books:-1},{books:1.5},{ore:1}]){const before=JSON.stringify(s);assert.throws(()=>act(s,{type:'enhance',target:'character',materials},day));assert.equal(JSON.stringify(s),before);}
 s.gold=1;const before=JSON.stringify(s);assert.throws(()=>act(s,{type:'enhance',target:'character',materials:{books:1}},day),/монет/);assert.equal(JSON.stringify(s),before);
});
test('Оружие и одежда усиливаются отдельными материалами, предметы сохраняются',()=>{
 const s=enhancementFixture(),before=power(s);act(s,{type:'enhance',target:'quill',materials:{ore:2}},day);assert.equal(s.inventory.quill.level,2);assert.equal(s.materials.ore,6);assert.equal(power(s),before+4);
 act(s,{type:'enhance',target:'novice',materials:{cloth:1}},day);assert.equal(s.inventory.novice.level,1);assert.equal(s.equipped.outfit,'novice');assert.equal(power(s),before+5);
});
test('Усиление артефакта не расходует надетый экземпляр и не принимает легендарку как материал',()=>{
 const s=enhancementFixture();s.inventory.flower.count=2;s.inventory.eternity={count:1,level:0};
 act(s,{type:'enhance',target:'flower',materials:{'fodder:flower':1}},day);assert.equal(s.inventory.flower.count,1);assert.equal(s.inventory.flower.level,1);assert.equal(s.equipped.flower,'flower');
 const before=JSON.stringify(s);assert.throws(()=>act(s,{type:'enhance',target:'flower',materials:{'fodder:eternity':1}},day));assert.equal(JSON.stringify(s),before);
});
test('Туман снимают только подтверждённые темы и экзамены, а не просмотр',()=>{
 const s=initialState();const first=explorationPercent(s);assert.ok(first>0);assert.equal(discoveredZones(s).length,3);
 importCourseHistory(s);assert.equal(discoveredZones(s).length,8);const known=explorationPercent(s);
 assert.throws(()=>act(s,{type:'teleport',id:'keys'},day),/Телепорт откроется/);assert.equal(explorationPercent(s),known);assert.equal(learnedPoints(s).includes('keys'),false);
 assert.throws(()=>act(s,{type:'activate-statue',id:'foundation-archon'},day),/экзамен/);assert.equal(explorationPercent(s),known);
 claim(s,'foundations-exam',day);assert.ok(explorationPercent(s)>known);
 const roundtrip=normalizeState(JSON.parse(JSON.stringify(s)));assert.deepEqual(discoveredZones(roundtrip),discoveredZones(s));
});
test('Старые ручные активации не притворяются пройденными темами',()=>{
 const s=initialState();s.visited=['unique','algorithms'];s.statues=['archon'];
 assert.equal(discoveredZones(s).length,3);assert.equal(pointRevealed(s,courseMap.points.find(p=>p.id==='archon')),false);
});

test('Дэйлик и разбор всегда рядом со своей изученной темой и внутри открытой территории',()=>{
 const s=initialState();assert.equal(visiblePoints(s).some(p=>['daily','repair'].includes(p.kind)),false);
 importCourseHistory(s);const before=explorationPercent(s);
 for(const id of ['daily-point','repair-point']){const point=courseMap.points.find(p=>p.id===id),topic=courseMap.points.find(p=>p.id===point.topic);assert.equal(pointRevealed(s,point),true);assert.equal(visiblePoints(s).some(p=>p.id===id),true);assert.ok(Math.hypot((point.x-topic.x)*10,(point.y-topic.y)*6.5)<92);}
 claim(s,'daily',day);claim(s,'repair',day);assert.equal(explorationPercent(s),before);
});
