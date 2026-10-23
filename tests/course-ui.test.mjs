import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {describePoint,lessonProgress,currentJourneyPoint,lessonQualityText} from '../public/journey.js';
import {render as renderWorld} from '../public/pages/world.js';
import {renderBook} from '../public/pages/journal-presentation.js';

function context(){
 return {data:{course:{id:'statistics-fixture',title:'Статистика'},courseMap:{start:{id:'start',x:5,y:30},routes:[{from:'start',to:'intro'},{from:'intro',to:'later'}],points:[{id:'intro',lessonId:'stats',kind:'teleport',region:'r',name:'Данные',x:20,y:30},{id:'later',lessonId:'model',kind:'teleport',region:'r',name:'Модель',x:60,y:30,prerequisites:['intro']}],regions:[{id:'r',name:'Основы',x:40,y:10}]},lessons:[{id:'stats',title:'Данные',taskIds:['task-a'],reward:160},{id:'model',title:'Модель',taskIds:['task-b'],reward:320}],tasks:[{id:'task-a',name:'Сводка',qualityCap:10},{id:'task-b',name:'Прогноз',qualityCap:20}],state:{claims:{},qualityClaims:{},courseCredits:{}},presentation:{}},rules:{},esc:x=>String(x??'')};
}
test('A different course renders in the same map and book and unlocks its own dependent lesson',()=>{
 const ctx=context(),[first,second]=ctx.data.courseMap.points;
 // The atlas consumes the complete program snapshot supplied by the server;
 // the book still uses lesson-level progress and rewards.
 ctx.data.program={blocks:[{id:'basics',title:'Основы'}],nextId:'intro',nodes:[
  {id:'intro',blockId:'basics',title:'Данные',main:true,status:'ready',available:true,lessonId:'stats',pointId:'intro'},
  {id:'later',blockId:'basics',title:'Модель',main:true,status:'future',available:false,lessonId:'model',pointId:'later',prerequisites:['intro']}
 ]};
 assert.equal(currentJourneyPoint(ctx).id,'intro');assert.equal(describePoint(ctx,first).current,true);assert.match(lessonQualityText(ctx,'stats'),/до 10 за решение/);
 assert.equal(describePoint(ctx,first).available,true);assert.equal(describePoint(ctx,second).available,false);
 for(const render of [renderWorld,renderBook]){const html=render(ctx);assert.match(html,/Данные/);assert.doesNotMatch(html,/undefined|NaN|Алисы|Базовые алгоритмы|урок 2\.4/);}
 ctx.data.state.claims['task-a']={};assert.equal(describePoint(ctx,second).available,true);assert.equal(currentJourneyPoint(ctx).id,'later');assert.equal(describePoint(ctx,second).current,true);
});
test('Lesson reward display subtracts previously paid quality without changing state',()=>{
 const ctx=context();ctx.data.state.qualityClaims['task-a']={gems:7};const before=JSON.stringify(ctx.data.state),progress=lessonProgress(ctx,'stats');
 assert.equal(progress.baseRemaining,160);assert.equal(progress.qualityRemaining,3);assert.equal(progress.remaining,163);assert.equal(JSON.stringify(ctx.data.state),before);
});
test('Legacy drafts migrate once only for the designated course/profile and remain isolated',()=>{
 const values=new Map([['alice-guild-drafts-v1','{"a":"old"}']]),native={get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)},context={window:{localStorage:native}};
 vm.runInNewContext(fs.readFileSync(new URL('../public/storage.js',import.meta.url),'utf8'),context);const storage=context.window.guildStorage;
 storage.configure({course:{id:'alice-python',storageScope:'alice-python:alice',legacyStorageMigration:true}});assert.equal(storage.getItem('alice-guild-drafts-v1'),'{"a":"old"}');storage.setItem('alice-guild-drafts-v1','alice new');
 storage.configure({course:{id:'ml',storageScope:'ml:me'}});assert.equal(storage.getItem('alice-guild-drafts-v1'),null);storage.setItem('alice-guild-drafts-v1','ml new');
 storage.configure({course:{id:'alice-python',storageScope:'alice-python:second'}});assert.equal(storage.getItem('alice-guild-drafts-v1'),null);
 storage.configure({course:{id:'alice-python',storageScope:'alice-python:alice',legacyStorageMigration:true}});assert.equal(storage.getItem('alice-guild-drafts-v1'),'alice new');assert.equal(native.getItem('alice-guild-drafts-v1'),'{"a":"old"}');
});

test('A later lesson waits for every predecessor supplied as an array',()=>{
 const ctx=context();ctx.data.presentation.previous={later:['intro','extra']};delete ctx.data.courseMap.points[1].prerequisites;ctx.data.courseMap.points.push({id:'extra',lessonId:'extra-lesson',name:'Дополнительный навык',kind:'teleport',region:'r',x:40,y:60});ctx.data.lessons.push({id:'extra-lesson',taskIds:['task-c'],reward:160});ctx.data.tasks.push({id:'task-c',qualityCap:10});
 ctx.data.state.claims['task-a']={};const later=ctx.data.courseMap.points.find(p=>p.id==='later');let info=describePoint(ctx,later);assert.equal(info.available,false);assert.deepEqual(info.requirements.map(r=>r.id),['intro','extra']);assert.deepEqual(info.requirements.map(r=>r.completed),[true,false]);ctx.data.state.claims['task-c']={};info=describePoint(ctx,later);assert.equal(info.available,true);
});
test('A course chooses its own recurring task IDs and only today counts',()=>{
 const ctx=context();ctx.data.course.recurringTasks=['task-a'];ctx.data.day='2026-10-17';ctx.data.state.claims['task-a:2026-10-17']={};assert.equal(describePoint(ctx,ctx.data.courseMap.points[0]).completed,true);ctx.data.day='2026-10-18';assert.equal(describePoint(ctx,ctx.data.courseMap.points[0]).completed,false);
});
test('The iframe wrapper never imports native legacy per-task drafts into another course or profile',async()=>{
 const values=new Map([['python-guild-app:draft:v1:starter-total','PRIVATE_ALICE_DRAFT']]),native={get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 let snapshot={course:{id:'starter-python',storageScope:'starter-python:default',legacyStorageMigration:false},tasks:[{id:'starter-total'}]};
 const window={localStorage:native,guildTransport:{load:async()=>snapshot,check(){},review(){},act(){},run(){},feedback(){}},addEventListener(){}};
 const context={window,ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}},document:{getElementById:()=>({})}};
 vm.runInNewContext(fs.readFileSync(new URL('../public/storage.js',import.meta.url),'utf8'),context);vm.runInNewContext(fs.readFileSync(new URL('../public/lesson-workbench/frame.js',import.meta.url),'utf8'),context);
 await window.guildTransport.load();assert.equal(window.guildStorage.getItem('drafts-v1'),null);assert.equal(native.getItem('alice-guild-drafts-v1'),null);
 snapshot={...snapshot,course:{id:'alice-python',storageScope:'alice-python:default',legacyStorageMigration:true}};await window.guildTransport.load();assert.equal(JSON.parse(window.guildStorage.getItem('drafts-v1'))['starter-total'],'PRIVATE_ALICE_DRAFT');
 snapshot={...snapshot,course:{id:'alice-python',storageScope:'alice-python:second',legacyStorageMigration:false}};await window.guildTransport.load();assert.equal(window.guildStorage.getItem('drafts-v1'),null);assert.equal(native.getItem('python-guild-app:draft:v1:starter-total'),'PRIVATE_ALICE_DRAFT');
});
