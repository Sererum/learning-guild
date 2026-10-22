import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {blankCourse} from '../shared/blank-course.mjs';
import {createProgramService} from '../program-service.mjs';
import {createLearningService} from '../adaptation/service.mjs';
import {withLearningOverlay} from '../learning-course.mjs';
import {createEngine} from '../shared/engine-core.mjs';
import {findPython312} from '../local-config.mjs';
import {material,wrongVariants} from './adaptation-fixtures.mjs';

const detailedPlan=['Разберём входные данные. Выберем нужные значения.','Сравним два примера. Объясним разницу в результате.','Проверим собственное решение. Попробуем граничный случай.'];
const op=(type,extra={})=>({type,refId:'',targetId:'',title:'',blockId:'',main:false,prerequisites:[],learningGoals:[],lessonPlan:[],...extra});
const proposal={summary:'Согласованный план нового временного курса.',operations:[op('add_block',{blockId:'first-block',title:'Первый блок'}),op('add',{refId:'first',title:'Первый урок',blockId:'first-block',main:true,learningGoals:['Самостоятельно проверить вычисление'],lessonPlan:detailedPlan})]};

test('empty course can plan, confirm and generate its first lesson without invented previous work',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-first-lesson-'));
 const base=blankCourse({id:'synthetic-start',title:'Временный курс',goal:'Самостоятельное вычисление'}),state=createEngine(base).initialState(),before=JSON.stringify(state),seen=[];
 let current=base,program;
 const learning=createLearningService({directory,course:base,readCourse:()=>current,readCurriculum:options=>program.curriculum(options),readState:()=>state,python:findPython312(),provider:'file',validateOverlay:overlay=>withLearningOverlay(base,overlay),fixtureProvider:async input=>{
  seen.push(input);
  if(input.stage==='personalize')return {summary:'Отзывов ещё нет.',preferences:[],sharedProposals:[]};
  if(input.stage==='generate'){
   const first=material('next');
   first.sections=Array.from({length:3},(_,index)=>({...structuredClone(first.sections[0]),title:'Проверка '+(index+1)}));
   first.tasks=Array.from({length:10},(_,index)=>({...structuredClone(first.tasks[0]),name:'Техническая задача '+(index+1)}));
   return {materials:[first]};
  }
  return {approved:true,summary:'Независимая проверка временного материала.',issues:[],taskAudits:Array.from({length:10},(_,index)=>({taskId:`adaptive-${input.job.materialKey}-next-task-${index+1}`,clearForBeginner:true,meaningfulConditions:true,independentReferenceCode:'total = 0\nfor value in values:\n    total += value\nprint(total)',wrongVariants:wrongVariants(),conclusion:'Технический контракт проверен.'}))};
 }});
 program=createProgramService({directory,courseId:base.id,profileId:'test',readCourse:()=>current,readState:()=>state,learning,provider:'file',fixtureProvider:async()=>proposal});
 t.after(async()=>{learning.close();program.close();await learning.whenIdle();await program.whenIdle();fs.rmSync(directory,{recursive:true,force:true});});
 assert.equal(learning.snapshot().enabled,false);
 assert.equal(program.snapshot().nodes.length,0);
 await program.act({action:'ask',target:{kind:'program'},message:'Создай весь основной маршрут от начала до итоговой цели.'});
 await program.whenIdle();let s=program.snapshot();
 assert.equal(s.proposals[0].status,'proposed',s.proposals[0].error);
 assert.equal(s.nodes.length,0,'planning does not apply without consent');
 await program.act({action:'apply',proposalId:s.proposals[0].id,revision:s.revision});
 const node=program.snapshot().nodes[0];assert.equal(node.canPrepare,true);assert.equal(learning.snapshot().enabled,true);
 await program.act({action:'prepare',nodeId:node.id});await learning.whenIdle();
 const job=learning.snapshot().jobs[0];assert.equal(job.status,'ready',job.error);
 assert.equal(job.lessonId,null);assert.match(job.summary,/согласованной теме/);
 assert.deepEqual(seen.map(item=>item.stage),['personalize','generate','review']);
 for(const input of seen){assert.deepEqual(input.job.evidence.tasks,[]);assert.deepEqual(input.job.evidence.feedback,[]);assert.equal(input.job.evidence.lessonId,null);}
 const overlay=learning.loadOverlay();assert.equal(overlay.lessons.length,1);assert.equal(overlay.tasks.length,10);
 assert.equal(overlay.lessons[0].sourceLessonId,null);
 assert.equal(overlay.pointPrerequisites[overlay.points[0].id],null);
 assert.equal(overlay.routes[0].from,base.engineConfig.courseMap.start.id);
 current=withLearningOverlay(base,overlay,learning.snapshot().jobs,state);
 s=program.snapshot();assert.equal(s.nodes[0].lessonId,overlay.lessons[0].id);assert.equal(s.nodes[0].available,true);assert.equal(s.nodes[0].completed,false);assert.equal(s.nodes[0].canPrepare,false);
 assert.equal(JSON.stringify(state),before,'generation never grants completion or rewards');
});

test('first lesson rejects unapproved target, fake source and unavailable runtime before model work',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-first-guard-')),course=blankCourse({id:'synthetic-guard'});
 let calls=0;const approved={id:'approved',title:'Подтверждённая тема',kind:'lesson',runtime:'basic-python',learningGoals:['Проверка'],prerequisites:[]};
 const learning=createLearningService({directory,course,readCurriculum:()=>[approved],readState:()=>({}),provider:'file',fixtureProvider:async()=>{calls++;throw Error('Must not call');}});
 t.after(async()=>{learning.close();await learning.whenIdle();fs.rmSync(directory,{recursive:true,force:true});});
 await assert.rejects(learning.requestProgram({message:'Сделай урок',curriculumTarget:{...approved,id:'unapproved'}}),/подтверждённый/);
 await assert.rejects(learning.requestProgram({message:'Сделай урок',lessonId:'fake',curriculumTarget:approved}),/существующий/);
 await assert.rejects(learning.requestProgram({message:'Сделай практику'}),/существующий/);
 approved.requiresRuntime=true;
 await assert.rejects(learning.requestProgram({message:'Сделай урок',curriculumTarget:{...approved,requiresRuntime:false}}),/исполнитель/);
 assert.equal(calls,0);
});
