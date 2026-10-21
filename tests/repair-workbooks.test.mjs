import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticCourse} from './course-profile-fixture.mjs';
import {withLearningOverlay} from '../learning-course.mjs';
import {withRepairWorkbooks} from '../shared/repair-workbooks.mjs';
import {createEngine} from '../shared/engine-core.mjs';
import {programView} from '../program-service.mjs';
import {journeyPoints,describePoint,lessonProgress} from '../public/journey.js';
import {taskContentVersion,lessonContentVersion} from '../content-versions.mjs';

test('One repair per source lesson, containing every unchanged task and section',()=>{
 const base=syntheticCourse(),course=withLearningOverlay(base),engine=createEngine(course),state=engine.initialState();engine.importCourseHistory(state,{awardRewards:false});
 const before=structuredClone(state),view=programView(course,state),repairs=view.nodes.filter(n=>n.kind==='repair');
 assert.equal(new Set(repairs.map(n=>n.parentId)).size,repairs.length);
 assert.equal(repairs.length,4);
 for(const original of base.lessons){
  const stored=course.lessons.find(l=>l.id===original.id);
  assert.equal(lessonContentVersion(stored,course.tasks),lessonContentVersion(original,base.tasks));
 }
 for(const task of base.tasks)assert.equal(taskContentVersion(course.tasks.find(t=>t.id===task.id)),taskContentVersion(task));
 for(const workbook of course.lessons.filter(l=>l.repairParts)){
  const parts=base.lessons.filter(l=>workbook.repairParts.includes(l.id));
  assert.deepEqual(new Set(workbook.taskIds),new Set(parts.flatMap(l=>l.taskIds)));
  assert.deepEqual(workbook.sections,parts.flatMap(l=>l.sections));
 }
 assert.deepEqual(state,before);
 assert.deepEqual(withRepairWorkbooks(course),course,'Rebuilding the view does not duplicate workbooks');
});

test('Partial completion and original rewards survive grouping, without new payouts',()=>{
 const course=withLearningOverlay(syntheticCourse()),engine=createEngine(course),state=engine.initialState();engine.importCourseHistory(state,{awardRewards:false});
 const ctx={data:{course:{recurringTasks:course.engineConfig.recurringTasks},presentation:course.presentation,lessons:course.lessons,repairPoints:course.repairPoints,courseMap:course.engineConfig.courseMap,tasks:course.tasks,state},rules:course.engineConfig};
 const workbook=course.lessons.find(l=>l.repairParts?.length===4),point=journeyPoints(ctx).find(p=>p.lessonId===workbook.id),currency=state.currency;
 engine.claim(state,workbook.taskIds[0],'2026-01-01');
 assert.equal(lessonProgress(ctx,workbook.id).completedTasks,1);
 assert.equal(lessonProgress(ctx,workbook.id).baseRemaining,workbook.reward-40);
 assert.equal(describePoint(ctx,point).completed,false);
 for(const id of workbook.taskIds)engine.claim(state,id,'2026-01-01');
 assert.equal(state.currency,currency+workbook.reward);
 assert.equal(lessonProgress(ctx,workbook.id).baseRemaining,0);
 assert.equal(describePoint(ctx,point).completed,true);
 assert.equal(programView(course,state).nodes.find(n=>n.lessonId===workbook.id).completed,true);
 for(const id of workbook.taskIds)assert.equal(engine.claim(state,id,'2026-01-01').already,true);
 assert.equal(state.currency,currency+workbook.reward);
});

test('New repair material joins its source workbook; duplicate section names keep distinct origins',()=>{
 const base=syntheticCourse(),first=base.lessons.find(l=>l.type==='repair');
 const extra={...structuredClone(first),id:'new-source-repair',sourceLessonId:'lesson-01-04'};
 const result=withRepairWorkbooks({...base,lessons:[...base.lessons,extra]});
 const workbook=result.lessons.find(l=>l.repairParts?.includes(extra.id));
 assert.equal(workbook.repairParts.length,3);
 assert.equal(new Set(workbook.sections.map(s=>s.id)).size,workbook.sections.length);
 assert.ok(Object.values(workbook.repairSectionOrigins).some(s=>s.lessonId===extra.id));
});
