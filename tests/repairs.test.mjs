import {lessons as courseLessons} from '../lessons.mjs';
import {syntheticCourse,syntheticEngine} from './course-profile-fixture.mjs';
const coursePresentation=syntheticCourse().presentation;
import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import os from 'node:os';
const rules=syntheticEngine();import {algorithmWorkbook} from '../algorithm-workbook.mjs';
import {repairPoints,repairTasks,repairLessons} from '../repair-lessons.mjs';import {publicTasks} from '../tasks.mjs';import {runPython} from '../server.mjs';
import {journeyPoints,describePoint,journeyRoutes,discoveredJourneyZones,lessonProgress} from '../public/journey.js';import {repairSolutions} from './repair-solutions.mjs';
import {historicalRepairSpecs} from '../historical-repairs.mjs';
const context=()=>{const state=rules.initialState();rules.importCourseHistory(state);return{data:{course:{recurringTasks:['daily']},presentation:coursePresentation,lessons:courseLessons,state,lessons:[algorithmWorkbook,...repairLessons],repairPoints,courseMap:rules.courseMap,tasks:publicTasks()},rules};};
test('Every yellow topic has one nearby current repair, even after earlier partial corrections',()=>{
 const ctx=context(),list=journeyPoints(ctx),repairs=list.filter(p=>p.evidenceId);
 assert.deepEqual(repairs.map(p=>p.topic),['clean','index','for','accumulator','while','keys','safe-get','frequency','unique']);
 for(const p of repairs){const parent=list.find(t=>t.id===p.topic);assert.equal(describePoint(ctx,parent).phase,'partial');assert.ok(Math.hypot(p.x-parent.x,p.y-parent.y)<9);assert.equal(describePoint(ctx,p).available,true);assert.equal(describePoint(ctx,p).reward.amount,40);assert.ok(journeyRoutes(ctx).some(r=>r.from===parent.id&&r.to===p.id&&r.side));}
 assert.equal(repairs.length,9);assert.equal(new Set(repairs.map(p=>p.topic)).size,9);
 assert.deepEqual(journeyPoints(ctx),list);
});
test('Repair completion closes only its topic and pays once, while views do not change fog',()=>{
 const ctx=context(),before=structuredClone(ctx.data.state),zones=discoveredJourneyZones(ctx);journeyPoints(ctx).forEach(p=>describePoint(ctx,p));assert.deepEqual(ctx.data.state,before);
 const gems=ctx.data.state.currency;assert.equal(rules.claim(ctx.data.state,'repair-safe-get','2026-10-16').gems,40);assert.equal(ctx.data.state.currency,gems+40);assert.equal(rules.claim(ctx.data.state,'repair-safe-get','2026-10-16').already,true);assert.equal(ctx.data.state.currency,gems+40);
 assert.equal(describePoint(ctx,ctx.data.courseMap.points.find(p=>p.id==='safe-get')).completed,true);
 for(const id of ['keys','frequency','unique'])assert.equal(describePoint(ctx,ctx.data.courseMap.points.find(p=>p.id===id)).completed,false);
 assert.deepEqual(discoveredJourneyZones(ctx),zones);assert.equal(ctx.data.state.lessonClaims.algorithms,undefined);
});
test('2.4 teaches only its new topics; corrections have separate independent lessons',()=>{
 assert.deepEqual(algorithmWorkbook.sections.map(s=>s.id),['max','substring','pointers']);assert.equal(algorithmWorkbook.taskIds.length,10);assert.equal(algorithmWorkbook.reward,480);
 for(const lesson of repairLessons){assert.equal(lesson.type,'repair');assert.equal(lesson.reward,40);assert.ok([1,3].includes(lesson.taskIds.length));assert.ok(lesson.sections[0].example.steps.length>=3);}
});
test('Corrected solutions pass independent Python cases; old mistakes and missing reports fail',async()=>{
 const python=(process.env.GUILD_PYTHON||path.join(os.homedir(),'.local/bin/python3.12'));
 for(const task of repairTasks){assert.equal((await runPython(task,repairSolutions[task.id],python)).ok,true,task.id);assert.equal((await runPython(task,task.starter,python)).ok,false,task.id+' blank');}
 const task=id=>repairTasks.find(t=>t.id===id);
 assert.equal((await runPython(task('repair-safe-get'),'found_price = prices.get(product) or "нет в каталоге"\nsize_after_read = len(prices)\nprint(found_price, size_after_read)',python)).ok,false);
 assert.equal((await runPython(task('repair-unique'),'unique_customers = set(customers)\nunique_customer_count = len(unique_customers)\nrequest_count = len(customers)\nprint(unique_visitors)',python)).ok,false);
 const hardcoded=repairSolutions['repair-frequency'].replace('print(source_counts, lead_count)','print("3 заявки, telegram: 2, search: 1")');assert.equal((await runPython(task('repair-frequency'),hardcoded,python)).ok,false);
 const inside=repairSolutions['repair-frequency'].replace('lead_count = len(lead_sources)\nprint(source_counts, lead_count)','    lead_count = len(lead_sources)\n    print(source_counts, lead_count)');assert.equal((await runPython(task('repair-frequency'),inside,python)).ok,false);
 for(const [id,wrong] of [
  ['repair-clean-3',repairSolutions['repair-clean-3'].replace('"доставка" in clean_text or "доставку" in clean_text','("доставка" or "доставку") in clean_text')],
  ['repair-clean-3',repairSolutions['repair-clean-3'].replace('"доставка" in clean_text or "доставку" in clean_text','"достав" in clean_text')],
  ['repair-index-2',repairSolutions['repair-index-2'].replace('.find(marker)', '.rfind(marker)')],
  ['repair-index-3',repairSolutions['repair-index-3'].replace('.find("@")', '.rfind("@")')],
  ['repair-index-2','marker_index = message.find(marker)\nsuffix = message[marker_index + len(marker):]\nprint(marker_index, suffix)'],
  ['repair-accumulator-1',repairSolutions['repair-accumulator-1'].replace('total_tips += tip','total_tips += 1')],
  ['repair-while-1',repairSolutions['repair-while-1'].replace('progress < goal','progress <= goal')],
  ['repair-while-3',repairSolutions['repair-while-3'].replace('bought < goal','bought <= goal')],
  ['repair-while-3',repairSolutions['repair-while-3'].replace('if bought >= goal:', 'if balance - price < reserve:')]
 ])assert.equal((await runPython(task(id),wrong,python)).ok,false,id+' catches the diagnosed misconception');
});
test('String expression snapshots match actual Python and preserve the input and internal spaces',async()=>{
 const spec=historicalRepairSpecs.find(s=>s.topic==='clean'),expressions=spec.steps.at(-1).expressions;
 const observed=expressions.map(row=>row.expression).join(', ');
 const task={tests:[
  {label:'Prepared final snapshot',inputs:{raw_drink:'  ЛАТТЕ  '},expected:{observed:expressions.map(row=>row.result),raw_drink:'  ЛАТТЕ  '}},
  {label:'Internal spaces',inputs:{raw_drink:'  ЧАЙ  С МЯТОЙ  '},expected:{observed:['  ЧАЙ  С МЯТОЙ  ','ЧАЙ  С МЯТОЙ','чай  с мятой'],raw_drink:'  ЧАЙ  С МЯТОЙ  '}},
  {label:'Only spaces',inputs:{raw_drink:'   '},expected:{observed:['   ','',''],raw_drink:'   '}}
 ]};
 const result=await runPython(task,'observed = ['+observed+']\nprint(observed)',(process.env.GUILD_PYTHON||path.join(os.homedir(),'.local/bin/python3.12')));assert.equal(result.ok,true,JSON.stringify(result));
});
test('A three-task correction pays 40 only after all tasks, independent of completion order',()=>{
 for(const lesson of repairLessons.filter(l=>l.taskIds.length===3)){
  const ctx=context(),s=ctx.data.state,before=s.currency,parent=ctx.data.courseMap.points.find(p=>p.id===lesson.topic),point=journeyPoints(ctx).find(p=>p.id===lesson.id);
  const ids=[...lesson.taskIds].reverse();
  for(const [i,id] of ids.entries()){
   assert.equal(rules.claim(s,id,'2026-10-17').gems,i===2?40:0);
   assert.equal(describePoint(ctx,parent).completed,i===2);
   assert.equal(describePoint(ctx,point).completed,i===2);
   assert.equal(rules.claim(s,id,'2026-10-17').already,true);
  }
  assert.equal(s.currency,before+40);assert.equal(s.lessonClaims[lesson.id].gems,40);
 }
});
test('Lesson reward tracks task progress and only unpaid base and quality, including legacy credits',()=>{
 const ctx=context(),s=ctx.data.state;
 assert.equal(lessonProgress(ctx,'algorithms').remaining,590);
 rules.claim(s,'algo-max-1','2026-10-17');s.qualityClaims={'algo-max-1':{gems:9}};
 const partial=lessonProgress(ctx,'algorithms');assert.equal(partial.completedTasks,1);assert.equal(partial.totalTasks,10);assert.equal(partial.baseRemaining,480);assert.equal(partial.qualityRemaining,101);assert.equal(partial.remaining,581);
 const point=ctx.data.courseMap.points.find(p=>p.id==='algorithms'),info=describePoint(ctx,point);assert.equal(info.actionLabel,'Продолжить урок 2.4');assert.match(info.status,/1 \/ 10/);assert.equal(info.reward.remaining,581);
 s.legacyAlgorithmCredit=160;assert.equal(lessonProgress(ctx,'algorithms').baseRemaining,320);
 for(const id of algorithmWorkbook.taskIds)rules.claim(s,id,'2026-10-17');assert.equal(lessonProgress(ctx,'algorithms').baseRemaining,0);assert.equal(lessonProgress(ctx,'algorithms').remaining,101);
 for(const id of algorithmWorkbook.taskIds)s.qualityClaims[id]={gems:id===algorithmWorkbook.finalTaskId?20:10};assert.equal(lessonProgress(ctx,'algorithms').remaining,0);
});
