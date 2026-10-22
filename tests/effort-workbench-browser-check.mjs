import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';
import {loadCourse} from '../course-loader.mjs';
import {browserOptions} from './browser-runtime.mjs';

// Independent integration check: the actual workbench must not override the
// profile's separate hint/review choices. No provider or real profile is used.
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-effort-workbench-'));
const course=await loadCourse({courseId:'starter-python',coursesRoot:fileURLToPath(new URL('../templates/',import.meta.url))});
const server=createGuildServer({course,stateFile:path.join(directory,'progress.json'),reviewProvider:'file',learningProvider:'off'});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch(browserOptions());
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/#settings');
 await page.locator('[data-settings-tab="generation"]').click();
 await page.locator('[data-ai-policy] select[name="tutorHint"]').selectOption('low');
 await page.locator('[data-ai-policy] select[name="tutorReview"]').selectOption('xhigh');
 await page.locator('[data-settings-form="ai-efforts"] [type="submit"]').click();
 await page.locator('.settings-pending').waitFor({state:'detached'});
 await page.goto(origin+'/#lesson');
 const frame=page.frameLocator('iframe');
 await frame.locator('.wb-outline-practice').first().click();
 const code=frame.locator('[data-cell-code]');
 for(const scenario of [
  {code:'values = [2, 3]\ntotal = 0\nprint(total)',passed:false,mode:'help',effort:'low'},
  {code:'values = [2, 3]\ntotal = sum(values)\nprint(total)',passed:true,mode:'review',effort:'xhigh'}
 ]){
  await code.fill(scenario.code);
  const check=page.waitForResponse(response=>response.url().endsWith('/api/check'));
  await frame.locator('[data-action="cell-check"]').click();
  assert.equal((await(await check).json()).result.ok,scenario.passed);
  const ask=frame.locator('[data-action="cell-ai"]').first();await ask.waitFor();
  await ask.click();await frame.locator('[data-ai-answer]').fill('Объясни следующий шаг.');
  const response=page.waitForResponse(result=>result.url().endsWith('/api/ai-review'));
  await frame.locator('[data-ai-answer]').press('Enter');
  const received=await response,payload=received.request().postDataJSON();
  assert.equal(Object.hasOwn(payload,'effort'),false,'browser leaves per-role choice to server');
  const review=(await received.json()).result.review;
  assert.equal(review.mode,scenario.mode);assert.equal(review.effort,scenario.effort);
  const request=review.request,metric={score:8,comment:'Понятный учебный код.'};
  const answer={schemaVersion:2,taskId:request.taskId,codeHash:request.codeHash,rubricVersion:request.rubricVersion,mode:request.mode,summary:'Синтетическая проверка интерфейса.',criteria:scenario.passed?{correctness:metric,readability:metric,efficiency:metric}:null,strengths:[],improvements:[],nextStep:'Проследи изменение итогового значения.',question:null,...(request.contentVersion?{contentVersion:request.contentVersion}:{})};
  fs.writeFileSync(path.join(directory,'reviews',review.id+'.result.json'),JSON.stringify(answer));
  await frame.locator('[data-ai-state="complete"]').waitFor({timeout:15000});
 }
 assert.deepEqual(errors,[]);
 console.log('Workbench UI → real settings/API: hint Low, review Extra high, Enter submission, no browser effort override, temporary file-provider responses — PASS');
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});
}
