import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {applyCourseProfile,loadCourseProfile} from '../shared/course-profile.mjs';
import {createEngine} from '../shared/engine-core.mjs';
import {validateCourse} from '../course-loader.mjs';
import {createGuildServer} from '../server.mjs';
import alice from '../courses/alice-python/index.mjs';
import {syntheticCourseProfile,writeSyntheticCourseProfile} from './course-profile-fixture.mjs';

const clone=()=>structuredClone(alice);
const seed=()=>syntheticCourseProfile(alice);
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'guild-course-profile-'));
async function readServer(options){const server=createGuildServer({...options,reviewProvider:'off',learningProvider:'off'});try{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return await(await fetch('http://127.0.0.1:'+server.address().port+'/api/state')).json();}finally{await new Promise(resolve=>server.close(resolve));}}

test('A course catalog without personal evidence never imports credits, closed topics or rewards',()=>{
 const source=clone(),before=JSON.stringify(source),course=applyCourseProfile(source,undefined);
 validateCourse(course);assert.equal(JSON.stringify(source),before);
 assert.deepEqual(course.engineConfig.courseHistory,[]);assert.ok(course.engineConfig.historyCatalog.length>0);
 const engine=createEngine(course),state=engine.initialState();engine.importCourseHistory(state,{awardRewards:false});
 assert.deepEqual(state.completedTopics,[]);assert.deepEqual(state.courseCredits,{});assert.deepEqual(engine.learnedPoints(state),[]);
 for(const key of ['currency','gold','books','petals','crystals'])assert.equal(state[key],0,key);
});

test('Private evidence and display overrides are profile scoped and leave tasks and rewards unchanged',()=>{
 const source=clone(),before=JSON.stringify(source),profile=seed(),course=applyCourseProfile(source,profile);
 validateCourse(course);assert.equal(JSON.stringify(source),before);
 assert.strictEqual(course.tasks,source.tasks);assert.strictEqual(course.lessons,source.lessons);
 assert.deepEqual(course.engineConfig.taskRewards,source.engineConfig.taskRewards);assert.deepEqual(course.engineConfig.rewardGroups,source.engineConfig.rewardGroups);
 assert.equal(course.presentation.roadmap.variables.phase,'mastered');
 const engine=createEngine(course),state=engine.initialState();engine.importCourseHistory(state,{awardRewards:false});
 assert.ok(state.courseCredits['lesson-02-03']);assert.ok(engine.learnedPoints(state).includes('while'));assert.deepEqual(state.completedTopics,['variables','math','conditions']);assert.equal(state.currency,0);
 const other=applyCourseProfile(source,undefined,{profileId:'another'});assert.deepEqual(other.engineConfig.courseHistory,[]);assert.deepEqual(other.engineConfig.normalization.completedTopics,[]);
});

test('Existing credits map through the catalog without importing unearned entries or erasing state',()=>{
 const course=applyCourseProfile(clone(),undefined),engine=createEngine(course),state=engine.initialState();
 state.courseCredits={'lesson-02-03':{reward:160,name:'Saved completed study'}};state.currency=73;state.gold=91;state.completedTopics=['variables'];state.claims={'repair-clean-1':true};state.savedExtension={preserve:true};
 const historyEntry=course.engineConfig.historyCatalog.find(entry=>entry.id==='lesson-02-03');
 // Use a catalog entry with map points, since the dictionary record itself may be study-only.
 const mapped=course.engineConfig.historyCatalog.find(entry=>entry.points?.length);state.courseCredits[mapped.id]={reward:0};
 const before=JSON.stringify(state);engine.normalizeState(state);engine.importCourseHistory(state,{awardRewards:false});assert.equal(JSON.stringify(state),before);
 for(const id of mapped.points)assert.ok(engine.learnedPoints(state).includes(id));assert.ok(historyEntry);
 assert.equal(state.courseCredits['lesson-01-04'],undefined);assert.equal(state.currency,73);assert.equal(state.savedExtension.preserve,true);
});

test('Profile data rejects unknown keys, executable shapes, mismatched identities and reward changes',()=>{
 const changes=[
  [p=>p.courseId='another',/courseId\/profileId/], [p=>p.profileId='another',/courseId\/profileId/],
  [p=>p.schemaVersion=2,/schemaVersion/], [p=>p.tasks=[],/запрещённое поле tasks/],
  [p=>p.history[0].reward=999999,/нельзя менять награду/], [p=>p.history[0].id='missing',/неизвестный/],
  [p=>p.history[0].points=['missing'],/неизвестный/], [p=>p.history.push(p.history[0]),/повторный/],
  [p=>p.normalization.inventory={},/запрещённое поле inventory/],
  [p=>p.presentation.roadmap.variables.phase='all-accepted',/неизвестная фаза/],
  [p=>p.presentation.roadmap.variables.reward=10,/запрещённое поле reward/],
  [p=>p.presentation.currentLessonId='missing',/неизвестный ID/],
  [p=>p.presentation.points={algorithms:{legacyRewardField:'currency'}},/расчёт наград/],
  [p=>p.presentation.previous={variables:'algorithms'},/зависимости/],
  [p=>p.callback=()=>0,/JSON/],
  [p=>p.history[0].source=Infinity,/JSON/],
  [p=>Object.defineProperty(p,'__proto__',{value:{polluted:true},enumerable:true}),/небезопасный ключ/]
 ];
 for(const [change,pattern] of changes){const profile=seed();change(profile);assert.throws(()=>applyCourseProfile(clone(),profile),pattern);}
 assert.equal({}.polluted,undefined);
});

test('Read-only local loading uses exactly the neighboring JSON and fails closed before creating saves',()=>{
 const directory=temp(),stateFile=path.join(directory,'progress.json');
 try{
  assert.deepEqual(loadCourseProfile(alice,{stateFile}).engineConfig.courseHistory,[]);assert.deepEqual(fs.readdirSync(directory),[]);
  writeSyntheticCourseProfile(stateFile);const filename=path.join(directory,'course-state.json'),bytes=fs.readFileSync(filename);assert.ok(loadCourseProfile(alice,{stateFile}).engineConfig.courseHistory.length>0);assert.deepEqual(fs.readFileSync(filename),bytes);
  fs.writeFileSync(filename,'{"schemaVersion":1,"courseId":"wrong","profileId":"default"}');assert.throws(()=>createGuildServer({stateFile,reviewProvider:'off'}),/courseId\/profileId/);assert.equal(fs.existsSync(stateFile),false);assert.deepEqual(fs.readdirSync(directory),['course-state.json']);
  fs.writeFileSync(filename,'not JavaScript or JSON');assert.throws(()=>loadCourseProfile(alice,{stateFile}),SyntaxError);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('Fresh servers have no foreign progress; a private checkpoint imports once with zero retroactive payout',async()=>{
 const directory=temp(),stateFile=path.join(directory,'progress.json');
 try{
  const fresh=await readServer({stateFile});assert.deepEqual(fresh.state.completedTopics,[]);assert.deepEqual(fresh.state.courseCredits,{});assert.equal(fresh.state.currency,0);assert.deepEqual(fresh.gameRules.courseHistory,[]);
  const saved=JSON.parse(fs.readFileSync(stateFile));saved.currency=77;saved.gold=23;saved.claims['repair-clean-1']=true;saved.arbitrarySavedData={keep:true};fs.writeFileSync(stateFile,JSON.stringify(saved));
  writeSyntheticCourseProfile(stateFile);const imported=await readServer({stateFile});assert.ok(imported.state.courseCredits['lesson-02-03']);assert.equal(imported.state.currency,77);assert.equal(imported.state.gold,23);assert.equal(imported.state.claims['repair-clean-1'],true);assert.equal(imported.state.arbitrarySavedData.keep,true);
  // A profile's saved completedTopics is evidence too: a new seed never overwrites it.
  assert.deepEqual(imported.state.completedTopics,['variables','math','conditions']);
  assert.deepEqual((await readServer({stateFile})).state,imported.state);
  fs.rmSync(path.join(directory,'course-state.json'));const restored=await readServer({stateFile});assert.deepEqual(restored.state,imported.state);assert.deepEqual(restored.gameRules.courseHistory,[]);assert.ok(restored.gameRules.historyCatalog.length>0);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
