import {lessons as courseLessons} from '../lessons.mjs';
import {syntheticCourse,syntheticEngine} from './course-profile-fixture.mjs';
const coursePresentation=syntheticCourse().presentation;
import test from 'node:test';
import assert from 'node:assert/strict';
const rules=syntheticEngine();
import {publicTasks} from '../tasks.mjs';
import {notebookLesson} from '../notebook.mjs';
import {render as renderWorld} from '../public/pages/world.js';

const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function context(){return {data:{course:{recurringTasks:['daily']},presentation:coursePresentation,lessons:courseLessons,state:rules.initialState(),tasks:publicTasks({}),courseMap:rules.courseMap,lesson:notebookLesson,day:'2026-10-16'},rules,esc,navigate:()=>{},openLesson:()=>{},api:async()=>{}};}
const occurrences=(html,pattern)=>[...html.matchAll(pattern)].length;
async function bookModule(id){return import(`../public/pages/book.js?case=${id}`);}
// The tiny event surface exercises view state without depending on a browser package.
function control(dataset={}){const events={};return {dataset,value:'',selectionStart:0,addEventListener(name,fn){events[name]=fn;},fire(name,event={}){return events[name]?.({target:this,...event});},focus(){},setSelectionRange(){}};}
function bookRoot(){const sections=['lessons','daily','repair','history'].map(id=>control({bookSection:id})),status=control(),search=control(),map=control();return {innerHTML:'',sections,status,search,map,querySelectorAll(selector){return selector==='[data-book-section]'?sections:[];},querySelector(selector){return {'[data-book-status]':status,'[data-book-search]':search,'[data-book-map]':map}[selector]||null;}};}

test('book uses real task records and lesson-level reward',async()=>{
  const {renderBook}=await bookModule('real-data'),ctx=context();rules.importCourseHistory(ctx.data.state);const html=renderBook(ctx);
  for(const id of ['lesson','exam','foundations-exam'])assert.ok(html.includes(ctx.data.tasks.find(t=>t.id===id).name));
  assert.ok(html.includes(esc(courseLessons[0].title)));
  assert.ok(html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').includes(`Награда · ${courseLessons[0].reward}`));
  assert.doesNotMatch(html,/undefined|NaN/);
  assert.equal(occurrences(html,/data-book-open-point=/g),rules.courseMap.points.filter(p=>!['daily','repair'].includes(p.kind)).length);
  assert.ok(html.includes('data-book-open-point="algorithms" >'));
  assert.ok(html.includes('data-book-open-point="foundation-archon" >'));
  assert.ok(html.includes('data-book-open-point="frequency" disabled'));
  assert.doesNotMatch(html,/на дереве/);
});

test('book filters sections, completion and search; map uses canonical route',async()=>{
  const {renderBook,bindBook}=await bookModule('filters'),ctx=context(),root=bookRoot();
  ctx.data.state.claims['daily:2026-10-16']=true;
  let route;ctx.navigate=page=>{route=page;};
  root.innerHTML=renderBook(ctx);bindBook(root,ctx);
  root.sections.find(x=>x.dataset.bookSection==='daily').onclick();
  assert.ok(root.innerHTML.includes('Прояви забытое имя'));
  assert.equal(occurrences(root.innerHTML,/data-book-open-point=/g),1);
  assert.ok(root.innerHTML.includes('Награда получена'));
  root.status.value='next';root.status.fire('change');
  assert.ok(root.innerHTML.includes('Пока нет таких поручений'));
  root.status.value='all';root.status.fire('change');
  root.search.value='нет такого поручения';root.search.fire('input');
  assert.equal(occurrences(root.innerHTML,/data-book-open-point=/g),0);
  root.map.fire('click');assert.equal(route,'world');
});

test('history only shows course records actually imported into the save',async()=>{
  const {renderBook,bindBook}=await bookModule('history'),ctx=context(),root=bookRoot();
  root.innerHTML=renderBook(ctx);bindBook(root,ctx);root.sections.at(-1).onclick();
  assert.equal(occurrences(root.innerHTML,/data-book-history=/g),0);
  rules.importCourseHistory(ctx.data.state);
  root.innerHTML=renderBook(ctx);
  assert.equal(occurrences(root.innerHTML,/data-book-history=/g),rules.courseHistory.length);
});

test('legacy tree rendering uses the same whole-lesson availability and route order',async()=>{
  const {renderTree}=await bookModule('tree'),ctx=context(),html=renderTree(ctx);
  assert.match(html,/data-tree-open="keys" disabled/);
  assert.match(html,/data-tree-open="algorithms" >/);
  assert.ok(html.indexOf('data-tree-open="algorithms"')<html.indexOf('data-tree-open="archon"'));
  rules.importCourseHistory(ctx.data.state);
  const progressed=renderTree(ctx);
  assert.match(progressed,/data-tree-open="keys" disabled/);
  assert.match(progressed,/Боковые ветви/);
});

test('gallery has exactly five slots and the real achievement catalogue',async()=>{
  const {renderAchievements}=await bookModule('gallery'),ctx=context(),html=renderAchievements(ctx);
  assert.equal(occurrences(html,/data-achievement-slot=/g),5);
  assert.equal(occurrences(html,/class="panel achievement-card/g),rules.achievements.length);
  assert.equal(occurrences(html,/data-achievement-equip=/g),rules.earnedAchievements(ctx.data.state).length);
  assert.equal(occurrences(html,/achievement-slot achievement-selected/g),1);
  assert.equal(occurrences(html,/data-achievement-clear disabled/g),1);
});

test('earned achievement can be placed, moved and cleared through the action contract',async()=>{
  const {renderAchievements,bindAchievements}=await bookModule('gallery-action'),ctx=context();
  const equip=control({achievementEquip:'variables'}),clear=control(),slots=Array.from({length:5},(_,i)=>control({achievementSlot:String(i)}));
  const root={innerHTML:'',querySelectorAll:selector=>selector==='[data-achievement-slot]'?slots:selector==='[data-achievement-equip]'?[equip]:[],querySelector:()=>clear};
  ctx.api=async action=>{rules.act(ctx.data.state,action,ctx.data.day);};
  bindAchievements(root,ctx);await equip.onclick();assert.equal(ctx.data.state.achievementSlots[0],'variables');
  slots[3].onclick();await equip.onclick();assert.equal(ctx.data.state.achievementSlots[3],'variables');assert.equal(ctx.data.state.achievementSlots[0],null);
  clear.fire('click');assert.equal(ctx.data.state.achievementSlots[3],null);
  assert.equal(occurrences(renderAchievements(ctx),/data-achievement-slot=/g),5);
});

test('book, tree and world do not include hidden test inputs or answers',async()=>{
  const views=await bookModule('privacy'),ctx=context();
  const hidden=ctx.data.tasks.flatMap(t=>t.cases.filter(c=>c.hidden));
  assert.ok(hidden.length>0);
  for(const item of hidden){assert.equal(item.inputs,undefined);assert.equal(item.expected,undefined);}
  // Rendering ignores cases entirely, including server-side details accidentally present.
  ctx.data.tasks.forEach(t=>t.cases.push({hidden:true,inputs:{secret:'PRIVATE_INPUT_742'},expected:{secret:'PRIVATE_EXPECTED_742'}}));
  for(const html of [views.renderBook(ctx),views.renderTree(ctx),renderWorld(ctx)])assert.doesNotMatch(html,/PRIVATE_INPUT_742|PRIVATE_EXPECTED_742|undefined|NaN/);
});

test('world exposes every point of an open region, broad trails, start flag and earned fog',()=>{
  const ctx=context(),html=renderWorld(ctx);
  assert.match(html,/Начало пути/);assert.match(html,/world-trail/);assert.doesNotMatch(html,/marker-end=/);assert.match(html,/mask="url\(#world-reveal\)"/);
  assert.equal(occurrences(html,/data-world-point=/g),ctx.data.courseMap.points.length);
  assert.match(html,/data-world-point="algorithms"/);
  assert.match(html,/data-world-start-current/);
  assert.match(html,/Частоты категорий/);
  const initialCircles=occurrences(html,/<circle cx=/g);
  rules.importCourseHistory(ctx.data.state);
  const progressed=renderWorld(ctx);
  assert.equal(occurrences(progressed,/<circle cx=/g),initialCircles,'imported reward claims do not redraw the factual roadmap');
  assert.equal(occurrences(progressed,/data-world-point=/g),ctx.data.courseMap.points.length);assert.match(progressed,/data-world-point="algorithms"/);
  assert.match(progressed,/side-trail/);
});

test('completed side assignments show completion on tree and map only for the current daily date',async()=>{
 const {renderTree}=await bookModule('side-completion'),ctx=context();rules.importCourseHistory(ctx.data.state);ctx.data.state.claims['daily:2026-10-16']=true;ctx.data.state.claims.repair=true;
 const tree=renderTree(ctx),world=renderWorld(ctx);
 assert.match(tree,/<article class="tree-node tree-complete">[^]*?Дэйлик: забытое имя/);
 assert.match(world,/class="world-point world-point-daily world-done/);
 assert.match(world,/class="world-point world-point-repair world-done/);
 ctx.data.day='2026-10-17';assert.doesNotMatch(renderWorld(ctx),/class="world-point world-point-daily world-done/);
});
