import {browserOptions} from './browser-runtime.mjs';
import {completeTaskFeedback} from './feedback-browser-helper.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';import {repairLessons} from '../repair-lessons.mjs';import {initialState,importCourseHistory} from '../engine.mjs';import {repairSolutions} from './repair-solutions.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-repairs-browser-'));
const fixture=initialState();importCourseHistory(fixture,{awardRewards:false});fixture.claims['algo-max-1']=true;fixture.qualityClaims={'algo-max-1':{gems:9}};fixture.currency=9;fs.writeFileSync(path.join(dir,'state.json'),JSON.stringify(fixture));
const server=createGuildServer({stateFile:path.join(dir,'state.json'),reviewProvider:'file'});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(browserOptions());
const state=async()=>(await(await fetch(origin+'/api/state')).json()).state;
try{
 const page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/#world');await page.locator('[data-world-point="repair-keys"]').waitFor();const before=await state();assert.match(await page.locator('[data-topic-card="algorithms"] [data-lesson-progress]').textContent(),/1 \/ 10/);assert.match(await page.locator('.topic-reward strong').textContent(),/581/);assert.match(await page.locator('[data-world-open]').textContent(),/Продолжить/);assert.equal(await page.locator('.world-point-repair[data-world-point^="repair-"]:not([data-world-point="repair-point"])').count(),9);
 await page.screenshot({path:'/private/tmp/guild-partial-lesson-reward.png',fullPage:true});
 await page.locator('[data-page="book"]').click();await page.locator('[data-book-select="algorithms"]').click();assert.match(await page.locator('.book-selected-detail').textContent(),/581/);assert.match(await page.locator('.book-selected-detail').textContent(),/1 \/ 10/);await page.locator('[data-page="world"]').click();
 for(const lesson of repairLessons){
  const topic=lesson.topic,id=lesson.id;await page.locator(`[data-world-point="${topic}"]`).click();
  await page.locator('.topic-repairs [data-world-select]').click();assert.equal(await page.locator('[data-topic-card="'+id+'"] [data-world-open]').isDisabled(),false);
  await page.locator('[data-world-open]').click();const frame=page.frameLocator('iframe');await frame.locator('.wb-brand h1').waitFor();assert.match(await frame.locator('.wb-brand h1').textContent(),/Работа над ошибками/);
  assert.equal(await frame.locator('[data-cell-code]').count(),0);assert.equal(await frame.locator('.wb-outline-practice').count(),lesson.taskIds.length);
  const traceBefore=await frame.locator('.wb-trace').textContent();await frame.locator('[data-action="wb-step"][data-delta="1"]').click();assert.notEqual(await frame.locator('.wb-trace').textContent(),traceBefore);
  if(topic==='clean'){
   const rows=frame.locator('.wb-expression-table tbody tr');assert.equal(await rows.count(),2);assert.match(await rows.nth(1).textContent(),/raw_drink\.strip\(\)/);assert.equal(await rows.first().locator('td').nth(1).textContent(),'"  ЛАТТЕ  "');assert.equal(await rows.first().locator('td code').last().evaluate(el=>getComputedStyle(el).whiteSpace),'pre-wrap');
   await frame.locator('[data-action="wb-step"][data-delta="1"]').click();assert.equal(await rows.count(),3);assert.equal(await rows.last().locator('td').first().textContent(),'raw_drink.strip().lower()');assert.equal(await rows.last().locator('td').nth(1).textContent(),'"латте"');
   await frame.locator('.wb-trace').screenshot({path:'/private/tmp/guild-explicit-string-methods.png'});
   await frame.locator('.wb-theory-example summary').click();const executed=page.waitForResponse(r=>r.url().endsWith('/api/execute'));await frame.locator('[data-action="wb-example-run"]').click();const output=(await(await executed).json()).result;assert.equal(output.ok,true);assert.match(output.output,/raw_drink\.strip\(\): 'ЛАТТЕ'/);assert.match(output.output,/Исходная строка после вызовов: '  ЛАТТЕ  '/);
  }
  for(const [index,taskId] of lesson.taskIds.entries()){
   await frame.locator(`[data-workspace-node="${taskId}"]`).click();await completeTaskFeedback(page);const field=frame.locator('[data-cell-code]');
   await field.fill(repairSolutions[taskId]);const response=page.waitForResponse(r=>r.url().endsWith('/api/check'));await frame.locator('[data-action="cell-check"]').click();const result=await(await response).json();assert.equal(result.result.ok,true,JSON.stringify(result.result));assert.equal(result.result.reward.gems,index===lesson.taskIds.length-1?40:0);
   const after=await state();const repeat=page.waitForResponse(r=>r.url().endsWith('/api/check'));await frame.locator('[data-action="cell-check"]').click();await repeat;assert.equal((await state()).currency,after.currency);
  }
  await page.locator('[data-page="world"]').click();await completeTaskFeedback(page);await page.locator(`[data-world-point="${topic}"].world-done`).waitFor();
 }
 assert.equal((await state()).currency,before.currency+360);
 await page.locator('[data-page="book"]').click();await page.locator('[data-book-section="repair"]').click();
 for(const topic of repairLessons.map(l=>l.topic))assert.equal(await page.locator(`[data-book-open-point="repair-${topic}"]`).isDisabled(),false);
 await page.locator('[data-book-detail-open]').first().waitFor();await page.screenshot({path:'/private/tmp/guild-repairs-book.png',fullPage:true});
 await page.goto(origin+'/?lesson=algorithms#lesson');const frame=page.frameLocator('iframe');await frame.locator('.wb-brand h1').waitFor();assert.equal(await frame.locator('[data-workspace-node="bridge"]').count(),0);assert.equal(await frame.locator('.wb-outline-practice').count(),10);assert.equal(await frame.locator('.wb-outline-theory').count(),6);
 assert.match(await frame.locator('.wb-block-title').textContent(),/Действующий лидер/);
 await page.locator('[data-page="world"]').click();await completeTaskFeedback(page);for(const width of [1500,736,375,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);console.log('9 repairs (19 independent tasks): parent→blue marker→interactive theory→independent tests→40 once→only parent complete; book consistent;2.4 starts with new topic; no errors at320–1500.');
}finally{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
