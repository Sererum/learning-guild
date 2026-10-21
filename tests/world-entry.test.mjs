import {readFileSync as readCourseFixture} from 'node:fs';
import {lessons as courseLessons} from '../lessons.mjs';
const coursePresentation=JSON.parse(readCourseFixture(new URL('../courses/alice-python/presentation.json',import.meta.url)));
import assert from 'node:assert/strict';
import test from 'node:test';
import * as rules from '../engine.mjs';
import {tasks} from '../tasks.mjs';
import {render,bind} from '../public/pages/world.js';

const esc=value=>String(value??'').replaceAll('<','&lt;');
function fixture(){
  const state=rules.initialState();rules.importCourseHistory(state);
  const opened=[];
  return {opened,ctx:{data:{course:{recurringTasks:['daily']},presentation:coursePresentation,lessons:courseLessons,state,tasks,courseMap:rules.courseMap,day:'2026-10-16'},rules,esc,openLesson:(...args)=>opened.push(args)}};
}
function rootFor(ctx,id){
  const point={dataset:{worldPoint:id},addEventListener(event,fn){this[event]=fn;}};
  const open={addEventListener(event,fn){this[event]=fn;}};
  const root={innerHTML:'',querySelectorAll(selector){return selector==='[data-world-point]'?[point]:[];},querySelector(selector){if(selector==='[data-world-open]')return open;return null;}};
  render(ctx);bind(root,ctx);return {point,open};
}

test('the whole algorithms lesson opens from its uniform card without changing progression',()=>{
  const {ctx,opened}=fixture(),before=structuredClone(ctx.data.state);
  assert.ok(render(ctx).includes('Телепорт включится после тестов всех 10 задач урока'));
  const {point,open}=rootFor(ctx,'algorithms');point.click();open.click();
  assert.deepEqual(opened.at(-1),['algorithms','algorithms']);
  assert.deepEqual(ctx.data.state,before);
  assert.equal(rules.learnedPoints(ctx.data.state).includes('keys'),false);
});

test('visible archived topics and the future exam cannot open by point clicks',()=>{
  const {ctx,opened}=fixture();
  assert.equal(rules.visiblePoints(ctx.data.state).some(p=>p.id==='algorithms'),false);
  ctx.data.state.claims.lesson=true;
  const point=rules.courseMap.points.find(p=>p.task==='exam');assert.ok(rules.pointAvailable(ctx.data.state,point));
  const root=rootFor(ctx,point.id);root.point.click();root.point.click();root.open.click();assert.deepEqual(opened,[]);
});
