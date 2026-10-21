import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createGuildServer} from '../server.mjs';
import {syntheticEngine} from './course-profile-fixture.mjs';
const {initialState,importCourseHistory,claim,wish,courseHistory}=syntheticEngine();

test('Zero start imports course evidence without awarding retroactive currency; new learning pays once',()=>{
 const state=initialState();assert.equal(state.currency,0);assert.equal(importCourseHistory(state,{awardRewards:false}),0);
 assert.equal(Object.keys(state.courseCredits).length,courseHistory.length);assert.equal(state.currency,0);assert.ok(state.courseCredits['lesson-02-03']);
 const unchanged=structuredClone(state);assert.throws(()=>wish(state,'outfit'),/160/);assert.deepEqual(state,unchanged);
 assert.equal(claim(state,'repair-keys','2026-10-16').gems,40);assert.equal(state.currency,40);claim(state,'repair-keys','2026-10-16');assert.equal(state.currency,40);
 assert.equal(importCourseHistory(state),0);assert.equal(state.currency,40);
});

test('A fresh server starts at zero and restarting preserves newly earned gems and equipment',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-zero-start-')),file=path.join(dir,'progress.json');
 const snapshot=async server=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));return(await(await fetch('http://127.0.0.1:'+server.address().port+'/api/state')).json()).state;};
 try{
  const first=createGuildServer({stateFile:file,reviewProvider:'off'});let state;
  try{state=await snapshot(first);assert.equal(state.currency,0);assert.equal(Object.keys(state.courseCredits).length,0);assert.deepEqual(state.completedTopics,[]);}finally{await new Promise(r=>first.close(r));}
  const second=createGuildServer({stateFile:file,reviewProvider:'off'});
  try{assert.deepEqual(await snapshot(second),state);}finally{await new Promise(r=>second.close(r));}
  claim(state,'repair-safe-get','2026-10-16');state.inventory.flower.level=2;fs.writeFileSync(file,JSON.stringify(state));
  const third=createGuildServer({stateFile:file,reviewProvider:'off'});
  try{const restored=await snapshot(third);assert.deepEqual(restored,state);assert.equal(restored.currency,40);assert.equal(restored.inventory.flower.level,2);}finally{await new Promise(r=>third.close(r));}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
