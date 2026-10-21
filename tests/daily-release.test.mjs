import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {syntheticCourse} from './course-profile-fixture.mjs';
const course=syntheticCourse();
import {createEngine} from '../shared/engine-core.mjs';
import {createGuildServer, runPython, moscowDay} from '../server.mjs';
import {findPython312} from '../local-config.mjs';
import {describePoint, discoveredJourneyZones, lessonProgress, lessonQualityText} from '../public/journey.js';
import {historicalRepairLessons} from '../courses/alice-python/historical-repairs.mjs';

const engine = createEngine(course);
const python = findPython312(process.env.GUILD_PYTHON);
const code = 'clean_name = raw_name.strip().lower()\nprint(clean_name)';
function baseline() {
  const state = engine.initialState();
  engine.importCourseHistory(state, {awardRewards: false});
  for (const key of ['currency', 'gold', 'books', 'petals', 'crystals']) state[key] = 0;
  for (const key of Object.keys(state.materials)) state.materials[key] = 0;
  return state;
}
const context = (state, day) => ({data: {state, day, course: {recurringTasks: course.engineConfig.recurringTasks}, presentation: course.presentation, lessons: course.lessons, tasks: course.tasks.map(task => ({...task, qualityCap: course.engineConfig.qualityCaps?.[task.id] || 0})), courseMap: course.engineConfig.courseMap, repairPoints: course.repairPoints}, rules: engine});
const dailyPoint = course.engineConfig.courseMap.points.find(point => point.id === 'daily-point');

test('daily opens a separate one-task lesson and reuses reviewed string theory unchanged', () => {
  const daily = course.lessons.find(lesson => lesson.id === 'daily');
  const original = historicalRepairLessons.find(lesson => lesson.id === 'repair-clean').sections[0];
  assert.equal(daily.type, 'daily');
  assert.deepEqual(daily.taskIds, ['daily']);
  assert.equal(daily.sections[0].example.code, original.example.code);
  assert.ok(daily.sections[0].example.executionTrace.complete);
  const ctx = context(baseline(), '2026-10-18');
  const description = describePoint(ctx, dailyPoint);
  assert.equal(description.available, true);
  assert.equal(description.lessonId, 'daily');
  assert.equal(description.actionLabel, 'Начать дэйлик');
  assert.equal(description.reward.amount, 60);
  assert.equal(description.progress.qualityTotal, 0);
  assert.match(lessonQualityText(ctx, 'daily'), /один|первое/);
  const parent = course.engineConfig.courseMap.points.find(point => point.id === dailyPoint.topic);
  assert.ok(discoveredJourneyZones(ctx).some(zone => Math.hypot(zone.x - dailyPoint.x * 10, zone.y - dailyPoint.y * 6.5) < zone.radius));
  assert.equal(parent.id, 'clean');
});

test('daily rewards repeat by date, never twice on the same date, and cannot change map fog', async () => {
  const state = baseline();
  const task = course.tasks.find(item => item.id === 'daily');
  const result = await runPython(task, code, python);
  assert.equal(result.ok, true);
  const ctx = context(state, '2026-10-18');
  const fog = discoveredJourneyZones(ctx);
  const first = engine.claim(state, 'daily', ctx.data.day);
  assert.equal(first.gems, 60);
  assert.equal(state.claims['daily:2026-10-18'], true);
  assert.equal(state.claims.daily, undefined);
  assert.ok(state.gold > 0 && state.books > 0 && state.petals > 0);
  for (const key of ['notes', 'ore', 'cloth', 'dust']) assert.ok(state.materials[key] > 0, key);
  assert.equal(describePoint(ctx, dailyPoint).reward.amount, 0);
  assert.equal(describePoint(ctx, dailyPoint).actionLabel, 'Повторить без награды');
  assert.equal(lessonProgress(ctx, 'daily').baseRemaining, 0);
  const after = structuredClone(state);
  const repeat = engine.claim(state, 'daily', ctx.data.day);
  assert.equal(repeat.already, true);
  assert.deepEqual(state, after);
  assert.deepEqual(discoveredJourneyZones(ctx), fog);
  ctx.data.day = '2026-10-19';
  // A stale permanent lesson claim must not hide tomorrow's recurring reward.
  state.lessonClaims.daily = {gems: 60};
  assert.equal(describePoint(ctx, dailyPoint).completed, false);
  assert.equal(describePoint(ctx, dailyPoint).reward.amount, 60);
  assert.equal(lessonProgress(ctx, 'daily').baseRemaining, 60);
  const next = engine.claim(state, 'daily', ctx.data.day);
  assert.equal(next.gems, 60);
  assert.equal(state.currency, 120);
  assert.equal(state.gold, after.gold * 2);
  assert.deepEqual(discoveredJourneyZones(ctx), fog);
});

test('real server checks daily from zero-resource baseline, persists dated reward, and rejects repeated payouts', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'guild-daily-release-'));
  const stateFile = path.join(directory, 'progress.json');
  fs.writeFileSync(stateFile, JSON.stringify(baseline()));
  const server = createGuildServer({course, stateFile, profileId: 'daily-qa', python, importHistory: false, reviewProvider: 'off', learningProvider: 'off', sharedReviewProvider: 'off'});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await (await fetch(origin)).text();
    const token = html.match(/name="guild-token" content="([^"]+)"/)[1];
    const headers = {'Content-Type': 'application/json', 'X-Guild-Token': token, Origin: origin};
    const initial = await (await fetch(origin + '/api/state')).json();
    const fog = discoveredJourneyZones({...context(initial.state, initial.day)});
    const check = async submitted => {
      const response = await fetch(origin + '/api/check', {method: 'POST', headers, body: JSON.stringify({task: 'daily', code: submitted})});
      assert.equal(response.status, 200);
      return response.json();
    };
    const failed = await check('clean_name = "hardcoded"\nprint(clean_name)');
    assert.equal(failed.result.ok, false);
    assert.equal(failed.state.currency, 0);
    const passed = await check(code);
    assert.equal(passed.result.ok, true);
    assert.equal(passed.state.currency, 60);
    assert.equal(passed.state.claims['daily:' + moscowDay()], true);
    assert.ok(passed.state.gold > 0 && passed.state.books > 0);
    const repeated = await check(code);
    assert.equal(repeated.result.reward.already, true);
    for (const key of ['currency', 'gold', 'books', 'crystals', 'petals', 'materials']) assert.deepEqual(repeated.state[key], passed.state[key], key);
    assert.deepEqual(discoveredJourneyZones(context(repeated.state, repeated.day)), fog);
    const persisted = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(persisted.currency, 60);
    assert.equal(persisted.claims['daily:' + moscowDay()], true);
  } finally {
    await new Promise(resolve => {server.close(resolve); server.closeIdleConnections?.();});
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
