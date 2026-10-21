import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {attachExampleTraces,collectExamples,exampleCodeHash} from '../shared/example-traces.mjs';
import course from '../courses/alice-python/index.mjs';
import {findPython312} from '../local-config.mjs';
import {executeGeneratedPython} from '../adaptation/runtime.mjs';

const cache=JSON.parse(fs.readFileSync(new URL('../courses/alice-python/example-traces.json',import.meta.url),'utf8'));
const trace={complete:true,frames:[{line:1,occurrence:1,event:'after',variables:{value:1},output:''}]};
const fixtureCache=code=>({schemaVersion:1,traces:{[exampleCodeHash(code)]:structuredClone(trace)}});

test('cache attaches only exact-code example metadata and preserves task definitions and author steps',()=>{
 const code='value = 1',steps=[{line:1,label:'Author annotation'}];
 const task={id:'task-one',starter:code,reward:20,example:{code}};
 const source={tasks:[task],lessons:[{id:'one',taskIds:['task-one'],reward:40,sections:[{example:{code,steps},teachingBlocks:[{example:{code}}],preTaskExamples:[{teachingBlocks:[{example:{code}}]}]}]}]};
 const before=structuredClone(source),stored=fixtureCache(code);
 assert.deepEqual(attachExampleTraces(source,stored),{attached:3,missing:0});
 assert.deepEqual(source.tasks,before.tasks);
 assert.equal(source.lessons[0].sections[0].example.steps,steps);
 assert.deepEqual(source.lessons[0].taskIds,before.lessons[0].taskIds);
 assert.equal(source.lessons[0].reward,40);
 const examples=collectExamples(source);examples[0].executionTrace.frames[0].variables.value=99;
 assert.equal(examples[1].executionTrace.frames[0].variables.value,1);
 assert.equal(stored.traces[exampleCodeHash(code)].frames[0].variables.value,1);
});

test('changed code, partial evidence and invalid frames never retain a complete cached trace',()=>{
 const code='value = 1',source={sections:[{example:{code}}]},stored=fixtureCache(code),example=source.sections[0].example;
 attachExampleTraces(source,stored);assert.equal(example.executionTrace.complete,true);
 example.code+='\nprint(value)';assert.deepEqual(attachExampleTraces(source,stored),{attached:0,missing:1});assert.equal(example.executionTrace,undefined);
 example.code=code;stored.traces[exampleCodeHash(code)].complete=false;
 attachExampleTraces(source,stored);assert.equal(example.executionTrace,undefined);
 stored.traces[exampleCodeHash(code)]=structuredClone(trace);stored.traces[exampleCodeHash(code)].frames[0].line=9;
 attachExampleTraces(source,stored);assert.equal(example.executionTrace,undefined);
 assert.throws(()=>attachExampleTraces(source,{schemaVersion:2,traces:{}}),/формат/);
});

test('bundled course has full cached traces for every nested demonstrated example',()=>{
 const examples=collectExamples(course),codes=new Set(examples.map(example=>exampleCodeHash(example.code)));
 assert.equal(examples.length,33);
 assert.equal(codes.size,29);
 assert.deepEqual(new Set(Object.keys(cache.traces)),codes);
 for(const example of examples){assert.equal(example.executionTrace.complete,true);assert.deepEqual(example.executionTrace,cache.traces[exampleCodeHash(example.code)]);}
 for(const root of [course.activeLesson,course.notebookLesson,course.algorithmLesson])assert.ok(collectExamples(root).every(example=>example.executionTrace.complete));
 const algorithms=course.lessons.find(lesson=>lesson.id==='algorithms');
 assert.equal(algorithms.taskIds.length,10);
 assert.ok(algorithms.sections.flatMap(section=>section.teachingBlocks||[]).some(block=>block.example?.executionTrace?.complete));
 assert.ok(algorithms.sections.flatMap(section=>section.preTaskExamples||[]).flatMap(block=>block.teachingBlocks||[]).some(block=>block.example?.executionTrace?.complete));
});

test('every bundled cache entry exactly matches a fresh run in the protected Python 3.12 executor',async()=>{
 const python=findPython312(process.env.GUILD_PYTHON),codes=new Map(collectExamples(course).map(example=>[exampleCodeHash(example.code),example.code]));
 for(const [hash,code]of codes){
  const result=await executeGeneratedPython({python,code,trace:true});
  assert.equal(result.ok,true,`${hash}: ${result.error}`);
  assert.deepEqual(cache.traces[hash],result.executionTrace,hash);
 }
});
