import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {findPython312} from '../local-config.mjs';
import {executeGeneratedPython} from '../adaptation/runtime.mjs';
import {compileMaterials,hydrateExecutionTraces,verifyAuthoredMaterials} from '../adaptation/content.mjs';
import {createLearningService} from '../adaptation/service.mjs';
import {sourceCourse,material,adaptationFixtureProvider,code,hash} from './adaptation-fixtures.mjs';

const python=findPython312(process.env.GUILD_PYTHON);
const execute=input=>executeGeneratedPython({python,...input});
const maximum='values = [-4, -7, -2]\nbest = None\nfor value in values:\n    if best is None or value > best:\n        best = value\nprint(best)';

test('full Python trace starts at initialization and shows for binding before condition and assignment',async()=>{
 const result=await execute({code:maximum,trace:true});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.executionTrace.complete,true);
 assert.deepEqual(result.executionTrace.frames,result.frames,'old frames API remains available');
 assert.deepEqual(result.frames.map(frame=>frame.line),[1,2,3,4,5,3,4,3,4,5,3,6]);
 assert.deepEqual(result.frames[0].variables,{values:[-4,-7,-2]});
 assert.deepEqual(result.frames[1].variables,{values:[-4,-7,-2],best:null});
 assert.deepEqual(result.frames[2].variables,{values:[-4,-7,-2],best:null,value:-4});
 assert.equal(result.frames[3].variables.best,null,'if frame precedes the assignment in its body');
 assert.equal(result.frames[4].variables.best,-4);
 assert.deepEqual(result.frames.filter(frame=>frame.line===3).map(frame=>frame.occurrence),[1,2,3,4]);
 assert.match(result.frames[2].explanation,/индексом 0.*value = -4/);
 assert.match(result.frames[6].explanation,/False/);
 assert.match(result.frames.at(-2).explanation,/Элементы закончились/);
 assert.ok(result.frames.slice(0,-1).every(frame=>frame.output===''));
 assert.equal(result.frames.at(-1).output,'-2\n');
 assert.ok(result.frames.every(frame=>frame.event==='after'&&frame.label&&frame.explanation));
});

test('frames copy mutable state and retain actual cumulative stdout after each print',async()=>{
 const result=await execute({trace:true,code:'items = []\nitems.append(2)\nprint(items)\nitems.append(3)\nprint(items)'});
 assert.equal(result.executionTrace.complete,true);
 assert.deepEqual(result.frames.map(frame=>frame.variables.items),[[],[2],[2],[2,3],[2,3]]);
 assert.deepEqual(result.frames.map(frame=>frame.output),['','','[2]\n','[2]\n','[2]\n[2, 3]\n']);
});

test('an empty loop records its check and no invented loop variable or body frame',async()=>{
 const result=await execute({trace:true,code:'values = []\nfor value in values:\n    print(value)\nprint("done")'});
 assert.equal(result.executionTrace.complete,true);
 assert.deepEqual(result.frames.map(frame=>frame.line),[1,2,4]);
 assert.equal(Object.hasOwn(result.frames[1].variables,'value'),false);
 assert.match(result.frames[1].explanation,/Элементы закончились/);
});

test('control-flow explanations never evaluate a condition or iterable a second time',async()=>{
 const result=await execute({trace:true,code:'items = [1, 2]\nif items.pop() == 2:\n    print(items)\nfor value in items.copy():\n    items.pop()\nprint(items)'});
 assert.equal(result.executionTrace.complete,true);
 assert.equal(result.output,'[1]\n[]\n');
 assert.deepEqual(result.frames[1].variables.items,[1]);
 assert.deepEqual(result.frames[3].variables,{items:[1],value:1});
});

test('an inner loop restarted after break starts its observed element index at zero',async()=>{
 const result=await execute({trace:true,code:'rows = [[2, 3], [4, 5]]\nfor row in rows:\n    for value in row:\n        print(value)\n        break\nprint("done")'});
 assert.equal(result.executionTrace.complete,true);
 const inner=result.frames.filter(frame=>frame.line===3);
 assert.equal(inner.length,2);
 assert.ok(inner.every(frame=>/индексом 0/.test(frame.explanation)));
 assert.deepEqual(inner.map(frame=>frame.variables.value),[2,4]);
});

test('failed and overlong executions cannot be advertised as complete traces',async()=>{
 const failed=await execute({trace:true,code:'value = 2\nanswer = value / 0\nprint(answer)'});
 assert.equal(failed.ok,false);
 assert.equal(failed.executionTrace.complete,false);
 assert.deepEqual(failed.frames.map(frame=>frame.line),[1]);
 const bounded=await execute({trace:true,code:'for value in range(3000):\n    result = value'});
 assert.equal(bounded.ok,false);
 assert.equal(bounded.executionTrace.complete,false);
 assert.ok(bounded.executionTrace.frames.length<=2000);
});

test('trusted verification hydrates complete lesson examples while keeping author steps and stable task IDs',async()=>{
 const course=sourceCourse(),source=material('next');
 const artifacts=compileMaterials({materials:[source]},{course,job:{id:'trace-check',lessonId:'source-lesson'},decision:{},nextTopic:course.adaptation.roadmap[1]});
 const before=structuredClone(artifacts[0].lesson.sections[0].example.steps),ids=artifacts[0].tasks.map(task=>task.id);
 assert.equal(artifacts[0].lesson.sections[0].example.executionTrace,undefined,'compilation alone cannot certify authored states');
 const audits=await verifyAuthoredMaterials(artifacts,execute);
 const example=artifacts[0].lesson.sections[0].example;
 assert.equal(example.executionTrace.complete,true);
 assert.ok(example.executionTrace.frames.length>example.steps.length);
 assert.equal(example.executionTrace.frames[0].line,1);
 assert.equal(example.executionTrace.frames.at(-1).output,source.sections[0].example.output);
 assert.deepEqual(example.steps,before);
 assert.deepEqual(artifacts[0].tasks.map(task=>task.id),ids);
 assert.equal(audits.length,1);
 assert.equal(source.sections[0].example.executionTrace,undefined,'strict generated source is not mutated');
});

test('trace hydration validates legacy author frames and rejects missing complete runtime evidence',async()=>{
 const section={title:'Maximum',example:{code:maximum,output:'-2\n',steps:[{line:3,occurrence:1,variablesJson:'{"best":null,"value":-4}'}]}};
 const artifact=()=>({source:{sections:[structuredClone(section)]},lesson:{sections:[{example:{code:maximum,steps:[{line:3,variables:{best:null,value:-4}}]}}]}});
 const good=artifact();await hydrateExecutionTraces([good],execute);
 assert.equal(good.lesson.sections[0].example.executionTrace.complete,true);
 const wrong=artifact();wrong.source.sections[0].example.steps[0].variablesJson='{"best":-4}';
 await assert.rejects(hydrateExecutionTraces([wrong],execute),/состояние ручного шага/);
 const actual=await execute({trace:true,code:maximum});
 await assert.rejects(hydrateExecutionTraces([artifact()],async()=>({...actual,executionTrace:{frames:actual.frames,complete:false}})),/полной проверенной трассировки/);
 await assert.rejects(hydrateExecutionTraces([artifact()],async()=>({...actual,executionTrace:undefined})),/полной проверенной трассировки/);
});

test('published overlay persists actual complete frames and never changes existing learner progress',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-full-trace-'));
 const course=sourceCourse(),state={testProofs:Object.fromEntries(course.tasks.map(task=>[task.id,{codeHash:hash,allPassed:true}]))};
 const original=structuredClone(state);
 const options={directory,course,python,readState:()=>state,readChecked:()=>({code,codeHash:hash,result:{ok:true,tests:[{label:'QA',ok:true}]}}),provider:'file',fixtureProvider:adaptationFixtureProvider};
 const service=createLearningService(options);
 try{
  const job=await service.submit({lessonId:'source-lesson'});await service.whenIdle();
  assert.equal(service.getStatus(job.id).status,'ready',service.getStatus(job.id).error);
  const example=service.loadOverlay().lessons[0].sections[0].example;
  assert.equal(example.executionTrace.complete,true);
  assert.equal(example.executionTrace.frames[0].line,1);
  assert.equal(example.executionTrace.frames.at(-1).output,'4\n5\n');
  assert.ok(example.executionTrace.frames.length>example.steps.length);
  assert.deepEqual(state,original);
 }finally{service.close();await service.whenIdle();fs.rmSync(directory,{recursive:true,force:true});}
});

test('resuming after a review transport failure restores full traces from cached author audits',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-trace-resume-')),course=sourceCourse(),state={testProofs:Object.fromEntries(course.tasks.map(task=>[task.id,{codeHash:hash,allPassed:true}]))};
 let reviewCount=0,generationCount=0;
 const service=createLearningService({directory,course,python,readState:()=>state,readChecked:()=>({code,codeHash:hash,result:{ok:true,tests:[{label:'QA',ok:true}]}}),provider:'file',fixtureProvider:request=>{if(request.stage==='generate')generationCount++;if(request.stage==='review'&&++reviewCount===1)throw Error('Temporary review transport failure');return adaptationFixtureProvider(request);}});
 try{
  const job=await service.submit({lessonId:'source-lesson'});await service.whenIdle();assert.equal(service.getStatus(job.id).status,'failed');
  await service.manage({action:'resume-job',jobId:job.id});await service.whenIdle();assert.equal(service.getStatus(job.id).status,'ready',service.getStatus(job.id).error);
  assert.equal(generationCount,1,'cached generation is reused');
  const example=service.loadOverlay().lessons[0].sections[0].example;assert.equal(example.executionTrace.complete,true);assert.equal(example.executionTrace.frames[0].line,1);assert.equal(example.executionTrace.frames.at(-1).output,'4\n5\n');
 }finally{service.close();await service.whenIdle();fs.rmSync(directory,{recursive:true,force:true});}
});
