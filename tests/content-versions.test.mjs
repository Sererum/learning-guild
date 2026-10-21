import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createContentVersions, taskContentVersion, lessonContentVersion} from '../content-versions.mjs';

const task = id => ({id, name: 'Проверка', description: 'Сохрани value в answer.', starter: 'value = 2', tests: [{label: 'Пример', inputs: {value: 2}, expected: {answer: 2}}], constraints: {}});
function harness(t) {
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'guild-content-versions-')); t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
 let course = {tasks: [task('one'), task('two')], lessons: [{id: 'lesson-one', taskIds: ['one'], sections: [{id: 'intro', title: 'Теория', paragraphs: ['Число сохраняется в переменной.']}]}], engineConfig: {taskTopics: {one: ['topic-one'], two: ['topic-two']}, rewardGroups: [{id: 'lesson-one', taskIds: ['one'], completedTopics: ['topic-one'], visitedPoints: ['topic-one']}], courseMap: {points: [{id: 'topic-one', task: 'one'}]}}};
 const state = {currency: 160, claims: {one: true, two: true}, lessonClaims: {'lesson-one': {gems: 160}}, qualityClaims: {one: {gems: 10}}, testProofs: {one: {codeHash: 'accepted', allPassed: true}, two: {codeHash: 'other', allPassed: true}}, completedTopics: ['topic-one', 'topic-two'], visited: ['topic-one', 'topic-two'], statues: [], taskFeedback: {one: [{hardDetails: 'Мне нужны примеры', skipped: false}]}};
 const options = {directory, readCourse: () => course, readState: () => state, readChecked: id => ({code: 'answer = value', codeHash: state.testProofs[id]?.codeHash, result: {ok: true}})};
 let versions = createContentVersions(options);
 return {directory, state, get course() {return course;}, get versions() {return versions;}, restart() {versions = createContentVersions(options);}, change() {course.tasks[0].description = 'Сохрани удвоенный value в answer.'; course.tasks[0].tests[0].expected.answer = 4;}};
}

test('baseline binds legacy proofs without changing existing saves or awards', t => {
 const h = harness(t), before = structuredClone(h.state); h.versions.reconcile();
 assert.deepEqual(h.state, before); assert.deepEqual(h.versions.effectiveState().claims, before.claims);
 assert.equal(h.versions.isCurrentProof('one', h.state.testProofs.one), true);
 assert.equal(h.versions.snapshot().changed.length, 0);
});
test('changed task masks completion and archives code/feedback; currency and payment ledgers survive', t => {
 const h = harness(t); h.versions.reconcile(); const old = h.versions.versionForTask('one'); h.change(); h.versions.reconcile();
 const effective = h.versions.effectiveState();
 assert.equal(effective.claims.one, undefined); assert.equal(effective.claims.two, true); assert.equal(effective.testProofs.one, undefined);
 assert.deepEqual(effective.completedTopics, ['topic-two']); assert.equal(effective.currency, 160);
 assert.deepEqual(effective.lessonClaims, h.state.lessonClaims); assert.deepEqual(effective.qualityClaims, h.state.qualityClaims);
 assert.equal(h.state.claims.one, true); assert.equal(h.state.taskFeedback.one[0].skipped, false);
 const archive = h.versions.archive('one'); assert.equal(archive.length, 1); assert.equal(archive[0].code, 'answer = value'); assert.equal(archive[0].version, old);
 assert.equal(h.versions.isCurrentProof('one', h.state.testProofs.one), false);
 h.state.testProofs.one = h.versions.stampTask('one', {codeHash: 'new', allPassed: false});
 h.state.taskFeedback.one=[h.versions.stampTask('one',{hardDetails:'Не понимаю новый пример',skipped:false})];
 assert.equal(h.versions.effectiveState().testProofs.one.allPassed,false,'a current failed attempt stays visible as yellow');
 assert.equal(h.versions.effectiveState().taskFeedback.one[0].hardDetails,'Не понимаю новый пример','current failed-attempt feedback remains available to adaptation');
 assert.deepEqual(h.versions.effectiveState().contentNeedsRecheckPoints,['topic-one']);
 assert.equal(h.versions.effectiveState().claims.one, undefined, 'failed new tests cannot restore old green completion');
 h.state.testProofs.one = h.versions.stampTask('one', {codeHash: 'new', allPassed: true});
 assert.equal(h.versions.effectiveState().claims.one, true); assert.equal(h.versions.snapshot().changed[0].needsRecheck, false);
 assert.equal(h.state.currency, 160, 'version migration never pays awards');
});
test('restart and repeated reconciliation are idempotent; unrelated lesson remains stable', t => {
 const h = harness(t); h.versions.reconcile(); const original = h.versions.snapshot(); h.change(); h.versions.reconcile(); const changed = h.versions.snapshot();
 assert.equal(changed.taskVersions.two, original.taskVersions.two); assert.notEqual(changed.lessonVersions['lesson-one'], original.lessonVersions['lesson-one']);
 const saved = fs.readFileSync(path.join(h.directory, 'content-versions.json'), 'utf8'); h.restart(); h.versions.reconcile(); h.versions.reconcile();
 assert.equal(fs.readFileSync(path.join(h.directory, 'content-versions.json'), 'utf8'), saved); assert.equal(h.versions.archive('one').length, 1);
});
test('an unattempted changed exam preserves independently confirmed historical topics', t => {
 const h = harness(t);
 h.state.claims = {}; h.state.testProofs = {}; h.state.lessonClaims = {}; h.state.qualityClaims = {}; h.state.taskFeedback = {}; h.state.currency = 0;
 // This learner studied the topic before installing the app, without sitting
 // the optional in-app exam. No checked solution exists for that exam.
 const versions = createContentVersions({directory:h.directory,readCourse:()=>h.course,readState:()=>h.state});
 versions.reconcile(); const before = structuredClone(h.state);
 h.change(); versions.reconcile();
 assert.deepEqual(versions.effectiveState(), before);
 assert.equal(versions.snapshot().changed[0].needsRecheck, false);
});
test('semantic versions ignore reward and duration but track conditions, inputs, starter and examples', () => {
 const source = task('one'), original = taskContentVersion(source);
 assert.equal(taskContentVersion({...source, reward: 999, minutes: 90, qualityCap: 100, name: 'Новое название'}), original);
 assert.notEqual(taskContentVersion({...source, tests: [{inputs: {x: 1}, expected: {y: 2}}]}), taskContentVersion({...source, tests: [{inputs: {x: 2}, expected: {y: 2}}]}));
 for (const field of ['description', 'starter', 'constraints', 'answerExamples']) assert.notEqual(taskContentVersion({...source, [field]: field === 'constraints' ? {forbidden: ['max']} : field === 'answerExamples' ? [{input: 1, output: 2}] : 'changed'}), original);
 const lesson = {id: 'lesson', taskIds: ['one'], sections: []}; assert.equal(lessonContentVersion({...lesson, reward: 123, minutes: 55}, [source]), lessonContentVersion(lesson, [source]));
});

test('browser archives changed drafts and clears stale results without erasing the editable code', async () => {
 const vm = await import('node:vm');
 const values = new Map(), localStorage = {get length() {return values.size;}, key: index => [...values.keys()][index], getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key)};
 const context = {window: {localStorage}, Date, encodeURIComponent, Set, JSON};
 vm.runInNewContext(fs.readFileSync(new URL('../public/storage.js', import.meta.url), 'utf8'), context);
 const storage = context.window.guildStorage, initial = {course: {id: 'course'}, profile: {id: 'alice'}, contentVersions: {taskVersions: {one: 'v1', two: 'v1'}, lessonVersions: {lesson: 'l1'}, changed: []}};
 storage.configure(initial); storage.setItem('drafts-v1', JSON.stringify({one: 'old answer', two: 'other answer'}));
 storage.setItem('notebook-v1', JSON.stringify({checks: {one: {result: {ok: true}}, two: {result: {ok: true}}}, executions: {one: {stdout: 'old'}}}));
 storage.setItem('workspace-v1', JSON.stringify({lesson: 'lesson', viewedTheory: {intro: true}, lessons: {lesson: {viewedTheory: {intro: true}}}}));
 const updated = {...initial, contentVersions: {taskVersions: {one: 'v2', two: 'v1'}, lessonVersions: {lesson: 'l2'}, changed: [{taskId: 'one'}], lessonsChanged: [{lessonId: 'lesson'}]}};
 storage.configure(updated);
 assert.equal(JSON.parse(storage.getItem('drafts-v1')).one, 'old answer'); assert.equal(storage.archivedDrafts('one')[0].version, 'v1');
 assert.equal(JSON.parse(storage.getItem('notebook-v1')).checks.one, undefined); assert.equal(JSON.parse(storage.getItem('notebook-v1')).checks.two.result.ok, true);
 assert.equal(Object.keys(JSON.parse(storage.getItem('workspace-v1')).lessons.lesson.viewedTheory).length, 0);
 storage.configure(updated); assert.equal(storage.archivedDrafts('one').length, 1);
 storage.setItem('drafts-v1', JSON.stringify({one: 'new answer'})); assert.equal(storage.restoreArchivedDraft('one', 'v1'), 'old answer');
 storage.configure({course: {id: 'course'}, profile: {id: 'other'}, contentVersions: initial.contentVersions}); assert.equal(storage.archivedDrafts('one').length, 0);
});

test('verified execution frames enrich examples without invalidating theory or task progress', t => {
 const h=harness(t),lesson=h.course.lessons[0];
 lesson.sections[0].example={code:'value = 2\nprint(value)',steps:[]};
 lesson.sections[0].teachingBlocks=[{id:'nested',example:{code:'other = 3',steps:[]}}];
 h.versions.reconcile();const before=structuredClone(h.state),version=lessonContentVersion(lesson,h.course.tasks),taskVersion=taskContentVersion(h.course.tasks[0]);
 const trace={complete:true,frames:[{line:1,occurrence:1,event:'after',variables:{value:2},output:''}]};
 lesson.sections[0].example.executionTrace=trace;
 lesson.sections[0].teachingBlocks[0].example.executionTrace=trace;
 assert.equal(lessonContentVersion(lesson,h.course.tasks),version);
 assert.equal(taskContentVersion(h.course.tasks[0]),taskVersion);
 h.versions.reconcile();assert.deepEqual(h.versions.snapshot().lessonsChanged,[]);assert.deepEqual(h.state,before);
 lesson.sections[0].example.code='value = 9\nprint(value)';
 assert.notEqual(lessonContentVersion(lesson,h.course.tasks),version,'actual example edits remain meaningful');
});
