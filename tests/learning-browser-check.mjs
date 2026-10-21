import {browserOptions} from './browser-runtime.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';
import {learningCourseFixture,adaptationFixtureProvider} from './learning-course-fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),browser=await chromium.launch(browserOptions());
async function decideProfile(frame,accept){const form=frame.locator('[data-personalization-consent]');await form.waitFor({timeout:60000});assert.equal(await form.locator('input:checked').count(),0,'consent starts with no preselected changes');if(accept){for(const checkbox of await form.locator('input[name="acceptedIds"]').all())await checkbox.check();await form.locator('[type="submit"]').click();}else await form.locator('[data-action="decline-personalization"]').click();await form.waitFor({state:'detached'});}

async function scenario(weak){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-learning-browser-')),stateFile=path.join(directory,'progress.json'),course=learningCourseFixture(),base=JSON.stringify(course),stages=[];
 const server=createGuildServer({course,stateFile,importHistory:false,reviewProvider:'off',learningProvider:'file',learningFixtureProvider:request=>{stages.push(request.stage);return adaptationFixtureProvider(request);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,context=await browser.newContext({viewport:{width:1500,height:950}}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
 const state=async()=>await(await fetch(origin+'/api/state')).json(),frame=page.frameLocator('iframe'),dialog=page.locator('.guild-task-feedback[open]');
 const node=async(id,reflect=false)=>{await frame.locator(`[data-workspace-node="${id}"]`).click();if(reflect){await dialog.waitFor();await dialog.locator('[data-feedback-skip]').click();await dialog.waitFor({state:'detached'});}await frame.locator(`.workbench[data-node="${id}"]`).waitFor();};
 const check=async(code)=>{await frame.locator('[data-cell-code]').fill(code);const response=page.waitForResponse(response=>response.url().endsWith('/api/check'));await frame.locator('[data-action="cell-check"]').click();return(await(await response).json()).result;};
 try{
  await page.goto(origin+'/?lesson=source-lesson#lesson');await node('source-1');
  assert.equal((await check(weak?'answer = 0\nprint(answer)':'answer = value\nprint(answer)')).ok,!weak);
  if(!weak){await node('source-2',true);assert.equal((await check('answer = value\nprint(answer)')).ok,true);await node('source-3',true);assert.equal((await check('answer = value\nprint(answer)')).ok,true);}
  assert.equal((await state()).learning.jobs.length,0,'checking never starts automatic adaptation without explicit submission');
  await node('reference',true);await frame.locator('[data-action="lesson-submit-open"]').click();const form=frame.locator('[data-lesson-submit-form]');
  await form.locator('[name="clarity"]').selectOption(weak?'unclear':'clear');await form.locator('[name="difficulty"]').selectOption(weak?'4':'2');await form.locator('[name="comment"]').fill('Хочу сначала конкретный пример с входом и результатом.');
  assert.equal(await form.locator('[name="authorId"]').count(),0,'only the learner leaves feedback');
  await form.locator('[type="submit"]').click();await decideProfile(frame,!weak);await frame.locator('[data-learning-state="ready"]').waitFor({timeout:60000});
  const ready=await state(),job=ready.learning.jobs[0];assert.equal(job.status,'ready',JSON.stringify(job));assert.deepEqual(stages,['personalize','generate','review']);
  assert.equal(fs.existsSync(path.join(directory,'personalization.json')),true);
  const proposedPreference=ready.settings.profile.personalization.preferences.find(rule=>rule.text.includes('выражение'));
  if(weak)assert.equal(proposedPreference,undefined,'declined wishes do not become active');else{assert.equal(proposedPreference.status,'active');assert.ok(proposedPreference.sources.every(source=>source.author?.role==='learner'));assert.ok(ready.learning.personalization.preferences.some(rule=>rule.id===proposedPreference.id));}
  assert.equal(ready.settings.profile.pendingChanges.length,0);
  const next=job.branches.find(branch=>branch.kind==='next');assert.equal(next.pointId,'future-point');assert.equal(ready.courseMap.points.filter(point=>point.id==='future-point').length,1);
  const branchLink=frame.locator(`a[href="/?lesson=${next.lessonId}#lesson"]`);await branchLink.waitFor();
  if(weak){
   assert.deepEqual(job.branches.map(branch=>branch.kind).sort(),['next','repair']);assert.equal(ready.state.claims['source-1'],undefined);
   const repair=job.branches.find(branch=>branch.kind==='repair'),parent=ready.courseMap.points.find(point=>point.id==='source-point'),point=ready.courseMap.points.find(point=>point.id===repair.pointId);assert.equal(point.topic,parent.id);assert.ok(Math.abs(point.x-parent.x)<=12&&Math.abs(point.y-parent.y)<=15,'practice is close to the source point');
   for(const branch of job.branches)assert.equal(ready.presentation.points[branch.pointId].available,true);
   await page.locator('[data-page="world"]').click();for(const branch of job.branches)await page.locator(`[data-world-point="${branch.pointId}"][data-point-status="available"]`).waitFor();
   await page.locator('[data-page="book"]').click();await page.locator(`[data-book-open-point="${next.pointId}"]:not([disabled])`).waitFor();await page.locator('[data-book-section="repair"]').click();await page.locator(`[data-book-open-point="${repair.pointId}"]:not([disabled])`).waitFor();
   await page.locator(`[data-book-open-point="${repair.pointId}"]`).click();await frame.locator('.wb-brand h1').filter({hasText:repair.title}).waitFor();const repairLesson=ready.lessons.find(lesson=>lesson.id===repair.lessonId);await node(repairLesson.taskIds[0]);assert.equal((await check('total = sum(values)\nprint(total)')).ok,true);
   assert.equal((await state()).state.currency,40);assert.equal((await check('total = sum(values)\nprint(total)')).reward.already,true);
   assert.equal(await frame.locator('[data-lesson-submission] >p').first().textContent(),'Отправь работу и отзыв — предложим, что учесть в следующих материалах.');await frame.locator('[data-action="lesson-submit-open"]').click();assert.match(await frame.locator('[data-lesson-submit-form]').textContent(),/учтём трудности в личных рекомендациях/);await frame.locator('[data-action="lesson-submit-cancel"]').click();
  }else{
   assert.equal(job.branches.length,1);await branchLink.click();const exam=ready.lessons.find(lesson=>lesson.id===next.lessonId);await frame.locator('.wb-brand h1').filter({hasText:next.title}).waitFor();await node(exam.taskIds[0]);
   assert.equal((await check('total = sum(values)\nprint(total)')).reward.gems,640);assert.equal((await check('total = sum(values)\nprint(total)')).reward.already,true);assert.equal((await state()).state.currency,640);
   // Poll snapshots updated both iframe and parent rules: newly generated points
   // are recognized immediately, before any page reload.
   await page.locator('[data-page="world"]').click();await dialog.waitFor();await dialog.locator('[data-feedback-skip]').click();await page.locator(`[data-world-point="${next.pointId}"][data-point-status="complete"]`).waitFor();
   await page.locator('[data-page="book"]').click();await page.locator(`[data-book-open-point="${next.pointId}"]:not([disabled])`).waitFor();await page.locator(`[data-book-open-point="${next.pointId}"]`).click();await frame.locator('.wb-brand h1').filter({hasText:next.title}).waitFor();await node(exam.taskIds[0]);assert.equal(await frame.locator('[data-cell-code]').inputValue(),'total = sum(values)\nprint(total)');
   await page.reload();await frame.locator('[data-cell-code]').waitFor();assert.equal(await frame.locator('[data-cell-code]').inputValue(),'total = sum(values)\nprint(total)','generated lesson draft survives refresh');assert.equal((await state()).state.currency,640);
   await page.goto(origin+'/?lesson=source-lesson#lesson');await node('reference');await frame.locator('[data-action="lesson-submit-open"]').click();assert.equal(await frame.locator('[data-lesson-submit-form] [name="authorId"]').count(),0);await frame.locator('[data-action="lesson-submit-cancel"]').click();
  }
  assert.equal(JSON.stringify(course),base,'shared course source remains unchanged');assert.deepEqual(errors,[]);
  console.log(weak?'Learning browser: failed solution → local personalization → separate next+repair branches, nearby map point, book availability, repair works and pays40 once.':'Learning browser: successful lesson → explicit submission → local personalization → generated exam reusedmap point, working branch link, Python640 once, map/book refresh and saved draft.');
 }finally{await context.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
}
async function failedRetryScenario(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-learning-retry-browser-')),server=createGuildServer({course:learningCourseFixture(),stateFile:path.join(directory,'progress.json'),importHistory:false,reviewProvider:'off',learningProvider:'file',learningFixtureProvider:request=>{if(request.stage==='generate')throw Error('Техническая ошибка генератора');return adaptationFixtureProvider(request);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,context=await browser.newContext({viewport:{width:1400,height:900}}),page=await context.newPage(),sent=[];page.setDefaultTimeout(15000);
 page.on('request',request=>{if(request.url().endsWith('/api/lesson-submit'))sent.push(request.postDataJSON());});
 const frame=page.frameLocator('iframe'),state=async()=>await(await fetch(origin+'/api/state')).json();
 try{
  await page.goto(origin+'/?lesson=source-lesson#lesson');await frame.locator('[data-workspace-node="source-1"]').click();await frame.locator('[data-cell-code]').fill('answer = value\nprint(answer)');await frame.locator('[data-action="cell-check"]').click();await frame.locator('[data-action="cell-feedback"]').waitFor();
  await frame.locator('[data-workspace-node="reference"]').click();const reflection=page.locator('.guild-task-feedback[open]');await reflection.waitFor();await reflection.locator('[data-feedback-skip]').click();await reflection.waitFor({state:'detached'});
  await frame.locator('[data-action="lesson-submit-open"]').click();let form=frame.locator('[data-lesson-submit-form]');await form.locator('[name="clarity"]').selectOption('mixed');await form.locator('[name="difficulty"]').selectOption('3');await form.locator('[name="comment"]').fill('Нужен маленький пример перед новым правилом.');await form.locator('[type="submit"]').click();await frame.locator('[data-lesson-submit-form]').waitFor({state:'detached'});await decideProfile(frame,true);await frame.locator('[data-learning-state="failed"]').waitFor();
  let snapshot=await state(),job=snapshot.learning.jobs[0];assert.equal(job.attempt,1);assert.equal(job.canRetry,true);
  await page.reload();await frame.locator('[data-action="lesson-submit-open"]').waitFor();assert.equal(await frame.locator('[data-action="lesson-submit-open"]').textContent(),'Повторить подготовку');await frame.locator('[data-action="lesson-submit-open"]').click();
  form=frame.locator('[data-lesson-submit-form]');assert.equal(await form.locator('[name="clarity"]').inputValue(),'mixed');assert.equal(await form.locator('[name="difficulty"]').inputValue(),'3');assert.equal(await form.locator('[name="comment"]').inputValue(),'Нужен маленький пример перед новым правилом.');
  await form.locator('[type="submit"]').click();await frame.locator('[data-lesson-submit-form]').waitFor({state:'detached'});await frame.locator('[data-learning-state="failed"]').waitFor();snapshot=await state();assert.equal(snapshot.learning.jobs.length,1,'retry retains the evidence fingerprint and the original job');assert.equal(snapshot.learning.jobs[0].id,job.id);assert.equal(snapshot.learning.jobs[0].attempt,2);assert.equal(snapshot.learning.jobs[0].canRetry,false);assert.deepEqual(sent[1].feedback,sent[0].feedback,'retry preserves the submitted feedback rather than sending an empty form');
  assert.equal(await frame.locator('[data-action="lesson-submit-open"]').textContent(),'Изменить отзыв и отправить заново');await frame.locator('[data-action="lesson-submit-open"]').click();await frame.locator('[data-lesson-submit-form] [type="submit"]').click();await frame.locator('[role="alert"]').filter({hasText:'Повторная подготовка этой версии уже исчерпана'}).waitFor();assert.equal(sent.length,2,'exhausted unchanged submission is not retried');
  await frame.locator('[data-lesson-submit-form] [name="comment"]').fill('Нужен маленький пример и пошаговое изменение переменных до правила.');await frame.locator('[data-lesson-submit-form] [type="submit"]').click();await frame.locator('[data-lesson-submit-form]').waitFor({state:'detached'});await frame.locator('[data-learning-state="failed"]').waitFor();snapshot=await state();assert.equal(snapshot.learning.jobs.length,2,'changed feedback explicitly starts a new analysis');assert.equal(sent.length,3);
  console.log('Learning retry: submitted feedback survives refresh, retry keeps job/evidence and attempt budget, exhausted unchanged request is blocked, deliberate revised feedback starts a new analysis.');
 }finally{await context.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
}
try{await scenario(false);await scenario(true);await failedRetryScenario();}finally{await browser.close();}
