import test from 'node:test';
import assert from 'node:assert/strict';
import {createDailyService,validateDailyBank,nextDailyReset,dailyDay} from '../daily-service.mjs';

const variant=(topic,id=topic+'-a')=>({id,topicId:topic,title:'Повторение '+topic,prompt:'Сохрани результат и выведи его.',starter:'value = 3\n# Решение',reviewed:true,tests:[{label:'Проверка',inputs:{value:3},expected:{answer:3}},{label:'Другой вход',hidden:true,inputs:{value:-2},expected:{answer:-2}}]});
function harness({topics=['one','two','three'],timeZone='Europe/Moscow',scope='synthetic:default'}={}){
 const course={manifest:{},daily:{timeZone,variants:topics.flatMap(topic=>[variant(topic),variant(topic,topic+'-b')]),reward:{gems:60,gold:100,books:1,materials:{ore:2}}}};
 const program={nodes:topics.map(id=>({id,title:'Тема '+id,completed:true}))};
 const state={version:1,currency:0,gold:0,books:0,materials:{},claims:{keep:true},unknown:{preserved:true}};
 let date=new Date('2026-10-22T10:00:00Z'),saved=0,fail=false;
 const options={scope,readCourse:()=>course,readProgram:()=>program,readState:()=>state,clock:()=>date,persist:()=>{if(fail)throw Error('Disk unavailable');saved++;}};
 return {course,program,state,service:createDailyService(options),reload:()=>createDailyService(options),setDate:d=>date=new Date(d),advance:()=>date=new Date(date.getTime()+86400000),writes:()=>saved,failPersist:()=>fail=true};
}
const result={ok:true,tests:[{label:'Проверка',ok:true,output:'3\n'},{label:'Другой вход',ok:true,output:'-2\n',mismatches:[],actualValues:{answer:-2}}]};

test('daily assignment freezes approved variant and reward across reload; public view has no hidden tests',()=>{
 const h=harness(),first=h.service.snapshot(),before=structuredClone(h.state);assert.equal(h.writes(),1);
 assert.equal(first.today.status,'available');assert.equal(first.resetsAt,'2026-10-22T21:00:00.000Z');
 h.course.daily.variants=[];h.course.daily.reward.gems=999;
 assert.deepEqual(h.reload().snapshot(),first);assert.deepEqual(h.state,before);assert.equal(h.writes(),1);
 const task=h.service.task(first.today.id);task.tests[0].expected.answer=999;
 assert.equal(h.service.task(first.today.id).tests[0].expected.answer,3);
 assert.ok(!JSON.stringify(first).includes('expected'));assert.ok(!JSON.stringify(first).includes('reviewed'));
});
test('only completed, non-excluded topics with reviewed variants can issue dailies',()=>{
 const h=harness();h.program.nodes[0].completed=false;h.program.nodes[1].excluded=true;h.course.daily.variants.filter(v=>v.topicId==='three').forEach(v=>v.reviewed=false);
 assert.equal(h.service.snapshot().today,null);assert.equal(h.writes(),0);
 h.course.daily.variants.find(v=>v.topicId==='three').reviewed=true;
 assert.equal(h.service.snapshot().today.topicId,'three');assert.equal(h.writes(),1);
});
test('pseudo-random rotation balances topics and variants, counts missed days, and does not repeat adjacent topics',()=>{
 const h=harness(),topics=[],variants=[];
 for(let index=0;index<30;index++){
  const daily=h.service.snapshot().today;topics.push(daily.topicId);variants.push(h.state.daily.entries[daily.day].variantId);h.advance();
 }
 for(let i=1;i<topics.length;i++)assert.notEqual(topics[i],topics[i-1]);
 const counts=Object.fromEntries(['one','two','three'].map(id=>[id,topics.filter(x=>x===id).length]));assert.deepEqual(Object.values(counts),[10,10,10]);
 for(const id of ['one','two','three']){const ids=variants.filter(v=>v.startsWith(id));assert.equal(ids.filter(v=>v===id+'-a').length,5);assert.equal(ids.filter(v=>v===id+'-b').length,5);}
 assert.equal(h.state.currency,0);assert.equal(Object.keys(h.state.daily.entries).length,30);
});
test('checking preserves code without paying; explicit claim pays all resources once',()=>{
 const h=harness(),id=h.service.snapshot().today.id,unrelated=structuredClone({claims:h.state.claims,unknown:h.state.unknown});
 assert.throws(()=>h.service.claim(id),/Сначала/);
 assert.equal(h.service.recordCheck(id,{code:'answer = value\nprint(answer)',result}).completed,true);
 assert.equal(h.state.currency,0);assert.equal(h.service.snapshot().today.status,'completed');
 assert.equal(h.service.snapshot().today.lastResult.tests[1].output,undefined);
 const paid=h.service.claim(id);assert.equal(paid.reward.gems,60);assert.equal(h.state.currency,60);assert.equal(h.state.gold,100);assert.equal(h.state.books,1);assert.equal(h.state.materials.ore,2);
 assert.equal(h.reload().claim(id).already,true);assert.equal(h.state.currency,60);
 assert.equal(h.service.snapshot().today.status,'claimed');assert.equal(h.service.snapshot().today.code,'answer = value\nprint(answer)');
 assert.deepEqual({claims:h.state.claims,unknown:h.state.unknown},unrelated);
});
test('midnight expires unclaimed rewards and old tabs; successful async check after midnight cannot complete the new day',()=>{
 const h=harness();h.setDate('2026-10-22T20:59:59.999Z');const id=h.service.snapshot().today.id;
 h.service.recordCheck(id,{code:'old solution',result});h.setDate('2026-10-22T21:00:00.000Z');
 assert.throws(()=>h.service.claim(id),/завершился/);assert.throws(()=>h.service.task(id),/завершился/);
 assert.throws(()=>h.service.recordCheck(id,{code:'late async solution',result}),/завершился/);
 const snapshot=h.service.snapshot();assert.notEqual(snapshot.today.id,id);assert.equal(snapshot.today.status,'available');assert.equal(snapshot.history[0].status,'expired');assert.equal(snapshot.history[0].completed,true);assert.equal(h.state.currency,0);
 assert.equal(h.state.daily.entries['2026-10-22'].checks[0].code,'old solution');
 assert.equal(snapshot.history[0].code,'late async solution');assert.equal(snapshot.history[0].receivedAfterDeadline,true);
 h.setDate('2026-11-01T10:00:00Z');h.service.snapshot();assert.equal(Object.keys(h.state.daily.entries).length,3);
});
test('failed checks and execute-only results cannot earn rewards; last successful proof remains valid',()=>{
 const h=harness(),id=h.service.snapshot().today.id;
 h.service.recordCheck(id,{code:'wrong',result:{ok:false,tests:[{ok:false}]}});assert.equal(h.service.snapshot().today.status,'available');
 h.service.recordCheck(id,{code:'print(1)',result:{ok:true,kind:'execution'}});assert.throws(()=>h.service.claim(id),/Сначала/);
 h.service.recordCheck(id,{code:'right',result});h.service.recordCheck(id,{code:'try again',result:{ok:false,tests:[{ok:false}]}});
 assert.equal(h.service.snapshot().today.status,'completed');h.service.claim(id);assert.equal(h.state.currency,60);
});
test('scope isolation, backward clock and failed durable writes cannot replay or partially pay rewards',()=>{
 const a=harness({scope:'first:profile'}),b=harness({scope:'second:profile'});
 const id=a.service.snapshot().today.id;assert.notEqual(id,b.service.snapshot().today.id);assert.throws(()=>b.service.claim(id),/завершился/);
 a.service.recordCheck(id,{code:'right',result});const before=structuredClone(a.state);a.failPersist();assert.throws(()=>a.service.claim(id),/Disk/);assert.deepEqual(a.state,before);
 b.advance();b.service.snapshot();b.setDate('2026-10-22T10:00:00Z');assert.equal(b.service.snapshot().today,null);assert.match(b.service.snapshot().reason,/Проверь часы/);assert.throws(()=>b.service.claim(id),/завершился/);
});
test('timezone boundaries follow real midnight including DST days and fractional offsets',()=>{
 assert.equal(nextDailyReset(new Date('2026-03-08T05:00:00Z'),'America/New_York'),'2026-03-09T04:00:00.000Z');
 assert.equal(nextDailyReset(new Date('2026-11-01T04:00:00Z'),'America/New_York'),'2026-11-02T05:00:00.000Z');
 assert.equal(nextDailyReset(new Date('2026-10-22T13:00:00Z'),'Asia/Kolkata'),'2026-10-22T18:30:00.000Z');
 assert.equal(dailyDay(new Date('2026-10-22T21:00:00Z'),'Europe/Moscow'),'2026-10-23');
});
test('invalid banks and unsafe resource keys fail closed; empty banks do not create fake tasks',()=>{
 const h=harness();h.course.daily.variants=[];assert.equal(h.service.snapshot().today,null);assert.equal(h.writes(),0);
 for(const bank of [{variants:[variant('one'),variant('one')]},{variants:[{...variant('one'),tests:[]}]},{variants:[],timeZone:'not/a-zone'},{variants:[],reward:{gems:-1}},{variants:[],reward:{materials:JSON.parse('{"__proto__":2}')}},{variants:[{...variant('one'),reviewed:'yes'}]}])assert.throws(()=>validateDailyBank(bank));
});
