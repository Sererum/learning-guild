import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {loadCourse,validateCourse} from '../course-loader.mjs';
import alice from '../courses/alice-python/index.mjs';
import starter from '../courses/starter-python/index.mjs';
import {tasks as legacyTasks} from '../tasks.mjs';
import {lessons as legacyLessons} from '../lessons.mjs';

const clone=()=>structuredClone(starter);
test('Alice package preserves existing material object identities and IDs',async()=>{
 const course=await loadCourse({courseId:'alice-python'});
 assert.equal(course.tasks,legacyTasks);assert.equal(course.lessons,legacyLessons);
 assert.equal(course.tasks.filter(t=>t.id.startsWith('algo-')).length,10);
 assert.equal(course.lessons.find(l=>l.id==='algorithms').taskIds.length,10);
 assert.equal(course.manifest.legacyStorageMigration,false);assert.equal(alice.id,'alice-python');
});
test('One loader accepts a different task/map course without Alice topic identifiers',async()=>{
 const course=await loadCourse({courseId:'starter-python'});
 assert.equal(course.id,'starter-python');assert.equal(course.tasks[0].id,'starter-total');
 assert.equal(course.engineConfig.courseMap.points[0].task,'starter-total');
 assert.equal(course.manifest.fixture,true);assert.equal(course.manifest.legacyStorageMigration,false);
 assert.ok(!JSON.stringify(course).includes('algo-max-1'));
});
test('Displayed course lesson rewards agree with the actual engine reward rules',async()=>{
 for(const courseId of ['alice-python','starter-python']){
  const course=await loadCourse({courseId});
  for(const lesson of course.lessons){
   const group=course.engineConfig.rewardGroups?.find(item=>item.id===lesson.id);
   const actual=group?.reward??(lesson.taskIds.length===1?course.engineConfig.taskRewards?.[lesson.taskIds[0]]:undefined);
   assert.notEqual(actual,undefined,`Missing engine reward for ${courseId}/${lesson.id}`);
   assert.equal(lesson.reward,actual,`${courseId}/${lesson.id} displays a different reward`);
  }
 }
});
test('Rejects duplicate tasks and dangling lesson, map, route and reward references',()=>{
 const changes=[
  [c=>c.tasks.push(c.tasks[0]),/повтор id/],
  [c=>c.lessons[0].taskIds.push('missing'),/неизвестное задание missing/],
  [c=>c.engineConfig.courseMap.points[0].task='missing',/неизвестное задание missing/],
  [c=>c.engineConfig.courseMap.routes[0].to='missing',/неизвестная точка/],
  [c=>c.engineConfig.courseMap.points[0].region='missing',/неизвестный регион/],
  [c=>c.engineConfig.taskRewards.missing=10,/неизвестное задание missing/],
  [c=>c.engineConfig.taskTopics['starter-total']=['missing'],/неизвестная точка missing/],
  [c=>c.engineConfig.pointPrerequisites['starter-point']='missing',/неизвестное тема missing/],
  [c=>c.engineConfig.pointPrerequisites['starter-point']='starter-point',/цикл/],
  [c=>c.engineConfig.taskRules['starter-total'].gate='missing',/неизвестный gate/],
  [c=>c.engineConfig.taskRules['starter-total'].requiresClaims=['missing'],/неизвестное задание/],
  [c=>c.engineConfig.gates.gate={allClaims:['missing']},/неизвестное задание/],
  [c=>c.engineConfig.courseHistory=[{id:'history',closed:['missing']}],/неизвестное тема/],
  [c=>c.engineConfig.courseMap.points[0].topic='missing',/неизвестная тема/],
  [c=>c.engineConfig.catalog=c.engineConfig.catalog.filter(item=>item.kind!=='outfit'||item.rarity!==4),/нет предмета редкости 4/],
  [c=>c.engineConfig.catalog[0].rarity=6,/редкость/],
  [c=>c.engineConfig.catalog[0].power=-1,/неотрицательная сила/],
  [c=>c.engineConfig.initialState.equipped.outfit='missing',/неизвестное предмет/],
  [c=>c.engineConfig.initialState.pity.outfit='0',/целое число от 0 до 19/],
  [c=>c.engineConfig.initialState.pityFour.outfit=5,/целое число от 0 до 4/],
  [c=>c.engineConfig.rewardGroups=[{id:'group',taskIds:['starter-total']}],/требуется reward/],
  [c=>c.engineConfig.rewardGroups=[{id:'a',taskIds:['starter-total'],reward:10},{id:'b',taskIds:['starter-total'],reward:20}],/несколько групп/],
  [c=>c.tasks[0].reward=-1,/неотрицательным/],
  [c=>c.engineConfig.qualityCaps['starter-total']=-1,/неотрицательным/]
 ];for(const[change,error]of changes){const course=clone();change(course);assert.throws(()=>validateCourse(course),error);}
});
test('Unsafe record IDs and non-JSON engine values fail before engine lookups',()=>{
 for(const id of ['__proto__','constructor','toString','../outside','a/b','a\\b']){const course=clone();course.tasks[0].id=id;assert.throws(()=>validateCourse(course),/небезопасный id/);}
 for(const value of [()=>0,undefined,NaN,Infinity,new Date()]){const course=clone();course.engineConfig.extra=value;assert.throws(()=>validateCourse(course),/JSON/);}
 const cyclic=clone();cyclic.engineConfig.extra=cyclic.engineConfig;assert.throws(()=>validateCourse(cyclic),/циклическая/);
});
test('Runtime expansion requires a separate explicitly supported runner',()=>{
 const course=clone();course.manifest.runtime='unrestricted-python';assert.throws(()=>validateCourse(course),/неподдерживаемый runtime/);
});
test('Course names cannot escape bundled package directory',async()=>{
 await assert.rejects(loadCourse({courseId:'../../private'}),/ASCII slug/);
 await assert.rejects(loadCourse({courseId:'/tmp/other'}),/ASCII slug/);
});
test('Explicit local courseDir works; entry traversal is rejected before code executes',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'guild-course-contract-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const packageDir=path.join(directory,'course');await fs.mkdir(packageDir);
 const manifest={...starter.manifest,entry:'../outside.mjs'};
 await fs.writeFile(path.join(packageDir,'course.json'),JSON.stringify(manifest));
 await fs.writeFile(path.join(directory,'outside.mjs'),'throw new Error("must not execute")');
 await assert.rejects(loadCourse({courseDir:packageDir}),/entry выходит за директорию/);
 const loaded=await loadCourse({courseDir:fileURLToPath(new URL('../courses/starter-python/',import.meta.url))});assert.equal(loaded.id,'starter-python');
});
