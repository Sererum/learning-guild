import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGuildServer} from '../server.mjs';
import {createEngine} from '../shared/engine-core.mjs';
import {findPython312} from '../local-config.mjs';
import {learningCourseFixture} from './learning-course-fixture.mjs';

const solution='answer = value * 2\nprint(answer)';
const reward={gems:60,gold:100,books:1,materials:{ore:2,cloth:2,notes:2}};
const beforeMidnight='2026-10-22T20:59:59.000Z',afterMidnight='2026-10-22T21:00:00.000Z';
function balances(state){return {currency:state.currency,gold:state.gold,books:state.books,materials:{...state.materials}};}

async function fixture(t,{learned=true}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-daily-http-'));
 const course=learningCourseFixture(),stateFile=path.join(directory,'state.json');
 course.daily={timeZone:'Europe/Moscow',reward,variants:[{id:'synthetic-double',topicId:'source-topic',title:'Удвоение тестового числа',prompt:'Сохрани удвоенное value в answer и выведи answer.',starter:'value = 3\n',reviewed:true,tests:[{label:'Открытый пример',inputs:{value:3},expected:{answer:6}},{label:'Скрытый пример',inputs:{value:789123},expected:{answer:1578246},hidden:true}]}]};
 // Keep a retired task to check that the previous endpoint cannot award it.
 course.tasks.push({id:'legacy-daily',name:'Старый дэйлик',description:'Техническая проверка миграции.',starter:'value = 3\n',tests:[{label:'Пример',inputs:{value:3},expected:{answer:6}}],reward:60});
 course.engineConfig.recurringTasks=['legacy-daily'];course.engineConfig.taskRewards['legacy-daily']=60;
 const state=createEngine(course).initialState();
 if(learned)for(const id of ['source-1','source-2','source-3'])state.claims[id]=true;
 fs.writeFileSync(stateFile,JSON.stringify(state));
 let now=beforeMidnight,crossOnNext=false,clockReads=0;
 const server=createGuildServer({course,stateFile,python:findPython312(),importHistory:false,reviewProvider:'off',learningProvider:'off',sharedDirectory:path.join(directory,'shared'),dailyClock:()=>{
  if(crossOnNext&&clockReads++>0)now=afterMidnight;
  return new Date(now);
 }});
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const base='http://127.0.0.1:'+server.address().port;
 const html=await (await fetch(base+'/')).text(),token=html.match(/name="guild-token" content="([^"]+)"/)?.[1];assert.ok(token);
 const get=async()=>{const response=await fetch(base+'/api/state');assert.equal(response.status,200);return response.json();};
 const post=async(url,input,headers={})=>{const response=await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,'X-Guild-Token':token,...headers},body:JSON.stringify(input)});return {status:response.status,body:await response.json()};};
 return {get,post,stateFile,advance:()=>{now=afterMidnight;},crossDuringCheck:()=>{crossOnNext=true;clockReads=0;}};
}

test('daily HTTP checks real Python without awarding; claim is explicit, durable and idempotent',async t=>{
 const f=await fixture(t),initial=await f.get(),id=initial.daily.today.id,before=balances(initial.state);
 assert.equal(initial.program.nodes.find(n=>n.id==='source-topic').completed,true);
 assert.equal(initial.daily.today.status,'available');assert.equal((await f.get()).daily.today.id,id);
 assert.equal(Object.hasOwn(initial.state,'daily'),false);
 assert.equal(Object.hasOwn(initial.daily.today,'task'),false);
 assert.doesNotMatch(JSON.stringify(initial.daily),/789123|1578246|"expected"|"inputs"/);
 assert.equal((await f.post('/api/daily',{action:'claim',id})).status,400);
 const wrong=await f.post('/api/daily',{action:'check',id,code:'answer = 6\nprint(answer)'});
 assert.equal(wrong.status,200);assert.equal(wrong.body.result.ok,false);assert.equal(wrong.body.daily.today.status,'available');assert.deepEqual(balances(wrong.body.state),before);
 const checked=await f.post('/api/daily',{action:'check',id,code:solution});
 assert.equal(checked.status,200,JSON.stringify(checked.body));assert.equal(checked.body.result.ok,true);assert.equal(checked.body.daily.today.status,'completed');assert.deepEqual(balances(checked.body.state),before);
 assert.equal(Object.hasOwn(checked.body.state,'daily'),false);assert.equal(checked.body.result.tests[1].hidden,true);assert.doesNotMatch(JSON.stringify(checked.body.result),/789123|1578246/);
 assert.doesNotMatch(JSON.stringify(checked.body.daily),/789123|1578246|"expected"|"inputs"/);
 const claimed=await f.post('/api/daily',{action:'claim',id});assert.equal(claimed.status,200);assert.equal(claimed.body.daily.today.status,'claimed');
 assert.equal(claimed.body.state.currency,before.currency+60);assert.equal(claimed.body.state.gold,before.gold+100);assert.equal(claimed.body.state.books,before.books+1);
 for(const key of ['ore','cloth','notes'])assert.equal(claimed.body.state.materials[key],(before.materials[key]||0)+2);
 const repeated=await f.post('/api/daily',{action:'claim',id});assert.equal(repeated.status,200);assert.equal(repeated.body.result.already,true);assert.deepEqual(balances(repeated.body.state),balances(claimed.body.state));
 const saved=JSON.parse(fs.readFileSync(f.stateFile));assert.equal(saved.daily.entries['2026-10-22'].status,'claimed');assert.deepEqual(balances(saved),balances(claimed.body.state));
});

test('daily HTTP requires session and origin; legacy check cannot bypass daily reward rules',async t=>{
 const f=await fixture(t),initial=await f.get(),id=initial.daily.today.id;
 for(const headers of [{Origin:'https://example.com'},{'X-Guild-Token':''}]){
  const result=await f.post('/api/daily',{action:'check',id,code:solution},headers);assert.equal(result.status,403);
 }
 const legacy=await f.post('/api/check',{task:'legacy-daily',code:solution});assert.equal(legacy.status,400);assert.match(legacy.body.error,/дэйлик|ежедневн/i);
 const after=await f.get();assert.deepEqual(balances(after.state),balances(initial.state));assert.equal(after.daily.today.status,'available');assert.equal(Object.hasOwn(after.state.testProofs||{},'legacy-daily'),false);
});

test('daily HTTP does not assign a task when no topic is mastered',async t=>{
 const f=await fixture(t,{learned:false}),state=await f.get();assert.equal(state.daily.today,null);assert.match(state.daily.reason,/освоенной темы/);assert.equal(state.program.nodes.some(n=>n.completed),false);
 const guessed=await f.post('/api/daily',{action:'claim',id:'invented-daily'});assert.equal(guessed.status,400);assert.deepEqual(balances((await f.get()).state),balances(state.state));
});

test('daily HTTP rejects old claims and checks after the course midnight',async t=>{
 const f=await fixture(t),initial=await f.get(),id=initial.daily.today.id;
 const checked=await f.post('/api/daily',{action:'check',id,code:solution});assert.equal(checked.status,200);assert.equal(checked.body.daily.today.status,'completed');f.advance();
 for(const action of ['claim','check','run']){const old=await f.post('/api/daily',{action,id,code:solution});assert.equal(old.status,400);assert.match(old.body.error,/завершился/);}
 const next=await f.get();assert.notEqual(next.daily.today.id,id);assert.equal(next.daily.today.day,'2026-10-23');assert.equal(next.daily.today.status,'available');assert.equal(next.daily.history[0].status,'expired');assert.equal(next.daily.history[0].code,solution);assert.deepEqual(balances(next.state),balances(initial.state));
});

test('Python check that crosses midnight preserves the solution without earning completion or reward',async t=>{
 const f=await fixture(t),initial=await f.get(),id=initial.daily.today.id;f.crossDuringCheck();
 const result=await f.post('/api/daily',{action:'check',id,code:solution});assert.equal(result.status,400);assert.match(result.body.error,/завершился/);
 const state=await f.get(),old=state.daily.history.find(entry=>entry.id===id);assert.ok(old);assert.equal(old.completed,false);assert.equal(old.receivedAfterDeadline,true);assert.equal(old.code,solution);assert.equal(state.daily.today.status,'available');assert.deepEqual(balances(state.state),balances(initial.state));
});
