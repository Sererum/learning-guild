import {lessons as courseLessons} from '../lessons.mjs';
import {syntheticCourse,syntheticEngine} from './course-profile-fixture.mjs';
const coursePresentation=syntheticCourse().presentation;
import test from 'node:test';
import assert from 'node:assert/strict';
const rules=syntheticEngine();
import {publicTasks} from '../tasks.mjs';
import {notebookLesson} from '../notebook.mjs';
import {describePoint,visibleRegions,journeyRoutes,discoveredJourneyZones} from '../public/journey.js';
const context=()=>({data:{course:{recurringTasks:['daily']},presentation:coursePresentation,lessons:courseLessons,state:rules.initialState(),courseMap:rules.courseMap,tasks:publicTasks(),lesson:notebookLesson,day:'2026-10-16'},rules});
const point=id=>rules.courseMap.points.find(p=>p.id===id);

test('the current roadmap block offers whole lessons and daily repetition',()=>{
 const ctx=context();
 assert.deepEqual(visibleRegions(ctx).map(r=>r.id),['foundation','structures']);
 assert.deepEqual(visibleRegions(ctx).map(r=>r.name),['1. Базовый синтаксис и строки','2. Структуры данных и алгоритмы']);
 assert.deepEqual(rules.courseMap.points.filter(p=>describePoint(ctx,p).available).map(p=>p.id),['algorithms','daily-point','foundation-archon']);
 assert.deepEqual(describePoint(ctx,point('algorithms')).requirements,[],'requested full lesson needs no prototype exam gate');
 rules.importCourseHistory(ctx.data.state);ctx.data.state.claims.lesson=true;ctx.data.state.claims.exam=true;
 assert.deepEqual(rules.courseMap.points.filter(p=>describePoint(ctx,p).available).map(p=>p.id),['algorithms','daily-point','foundation-archon'],'old demo flags cannot unlock the other lessons');
});

test('roadmap completion distinguishes confirmed basics, partial practice and analyzed dict work',()=>{
 const ctx=context();rules.importCourseHistory(ctx.data.state);ctx.data.state.claims.lesson=true;
 for(const id of ['variables','math','conditions']){const d=describePoint(ctx,point(id));assert.equal(d.completed,true);assert.equal(d.archived,true);assert.equal(d.available,false);}
 for(const id of ['clean','index','for','accumulator','while']){const d=describePoint(ctx,point(id));assert.equal(d.completed,false);assert.equal(d.phase,'partial');assert.match(d.status,/практика частично/);assert.equal(d.available,false);}
 for(const id of ['keys','safe-get']){const d=describePoint(ctx,point(id));assert.equal(d.completed,false);assert.equal(d.phase,'partial');assert.match(d.status,/практика частично/);}
});

test('current teleport needs all ten tasks; exam and prototype practice cannot activate it',()=>{
 const ctx=context();ctx.data.state.visited.push('algorithms');ctx.data.state.claims.exam=true;ctx.data.state.claims['frequency-practice']=true;
 assert.equal(describePoint(ctx,point('algorithms')).completed,false);
 const tasks=ctx.data.tasks.filter(t=>t.id.startsWith('algo-'));assert.equal(tasks.length,10);
 for(const t of tasks.slice(0,-1))ctx.data.state.claims[t.id]=true;
 assert.equal(describePoint(ctx,point('algorithms')).completed,false);
 ctx.data.state.claims[tasks.at(-1).id]=true;
 assert.equal(describePoint(ctx,point('algorithms')).completed,true);
 ctx.data.state.lessonClaims={algorithms:true};
 const d=describePoint(ctx,point('algorithms'));
 assert.equal(d.available,true);assert.equal(d.reward.earned,true);assert.match(d.actionLabel,/Вернуться/);
 assert.equal(describePoint(ctx,point('frequency')).completed,false);
 assert.equal(describePoint(ctx,point('unique')).completed,false);
});

test('foundation final is independently playable and requires its own accepted work',()=>{
 const ctx=context();ctx.data.state.claims.exam=true;
 const d=describePoint(ctx,point('foundation-archon'));
 assert.equal(d.available,true);assert.equal(d.current,false);assert.equal(d.completed,false);assert.equal(d.reward.amount,640);
 assert.deepEqual(d.requirements,[]);
 ctx.data.state.claims['foundations-exam']=true;
 assert.equal(describePoint(ctx,point('foundation-archon')).completed,true);
 assert.equal(describePoint(ctx,point('foundation-archon')).reward.earned,true);
});

test('map and book preserve reward history and never mutate saved progress',()=>{
 const ctx=context();rules.importCourseHistory(ctx.data.state);const snapshot=JSON.stringify(ctx.data.state);
 const d=describePoint(ctx,point('while')),history=rules.courseHistory.filter(e=>e.points.includes('while'));
 assert.equal(d.reward.earned,true);assert.equal(d.reward.label,'Уже начислено за прошлые работы');assert.equal(d.reward.amount,history.reduce((sum,e)=>sum+e.reward,0));
 assert.equal(describePoint(ctx,point('repair-point')).reward.amount,40);assert.equal(describePoint(ctx,point('daily-point')).reward.amount,60);assert.equal(describePoint(ctx,point('frequency')).reward.amount,160);
 assert.equal(describePoint(ctx,point('algorithms')).reward.amount,480);
 for(const p of rules.courseMap.points)describePoint(ctx,p);visibleRegions(ctx);journeyRoutes(ctx);
 assert.equal(JSON.stringify(ctx.data.state),snapshot);
});

test('the main trail follows dictionary lookup, frequency, unique values and the exam',()=>{
 const ctx=context(),routes=journeyRoutes(ctx);let id='safe-get';const chain=[];
 while(id&&!chain.includes(id)){chain.push(id);id=routes.find(r=>r.from===id&&!r.side)?.to;}
 assert.deepEqual(chain,['safe-get','frequency','unique','algorithms','archon']);
 assert.ok(routes.find(r=>r.to==='daily-point')?.side,'optional repeated practice remains a side trail');
});

test('fog follows studied roadmap topics; prototype claims cannot reveal new theory',()=>{
 const ctx=context(),before=discoveredJourneyZones(ctx).map(z=>z.id);
 assert.deepEqual(before,['variables','math','conditions','clean','index','for','accumulator','while','keys','safe-get','frequency','unique']);
 ctx.data.state.claims.lesson=true;ctx.data.state.claims.exam=true;ctx.data.state.claims.repair=true;ctx.data.state.claims['daily:2026-10-16']=true;
 assert.deepEqual(discoveredJourneyZones(ctx).map(z=>z.id),before);
 ctx.data.state.claims['frequency-practice']=true;
 assert.deepEqual(discoveredJourneyZones(ctx).map(z=>z.id),before);
 ctx.data.state.lessonClaims={algorithms:true};
 assert.deepEqual(discoveredJourneyZones(ctx).map(z=>z.id),[...before,'algorithms']);
 ctx.data.state.claims['foundations-exam']=true;
 assert.ok(discoveredJourneyZones(ctx).some(zone=>zone.id==='foundation-archon'&&zone.radius===225));
});
