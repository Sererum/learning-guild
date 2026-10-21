import {browserOptions} from './browser-runtime.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createGuildServer} from '../server.mjs';import {algorithmSolutions} from './algorithm-solutions.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-ai-feedback-'));
const server=createGuildServer({stateFile:path.join(directory,'state.json'),reviewProvider:'file'});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(browserOptions());
let release,page;
try{
 page=await browser.newPage({viewport:{width:1500,height:800}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.setDefaultTimeout(10000);const requests=[];page.on('request',r=>{if(r.url().endsWith('/api/ai-review'))requests.push(r.postDataJSON());});
 await page.addInitScript(()=>{if(!localStorage.getItem('alice-guild-workspace-v1'))localStorage.setItem('alice-guild-workspace-v1',JSON.stringify({lesson:'algorithms',effort:'low',lessons:{algorithms:{effort:'low'}}}));});
 await page.goto(origin+'/?lesson=algorithms#lesson');const frame=page.frameLocator('iframe');await frame.locator('[data-workspace-node="algo-max-1"]').click();
 await frame.locator('[data-cell-code]').fill('sales = [740, 510, 980, 630]\nbest_sale = 0\nfor sale in sales:\n    if sale > best_sale:\n        best_sale = sale\nprint(best_sale)');
 await frame.locator('[data-action="cell-check"]').click();await frame.locator('.nb-test-tab.failed').first().waitFor();
 const ai=()=>frame.locator('[data-action="cell-ai"]').first();
 const ask=async(question='',send='enter')=>{await ai().click();const field=frame.locator('[data-ai-answer]');await field.waitFor();await field.fill(question);if(send==='button')await frame.locator('[data-ai-question-form] button[type="submit"]').click();else await field.press('Enter');};
 assert.equal(await frame.locator('[data-ai-effort],.wb-codex-settings,[data-ai-answer]').count(),0,'settings and question are absent until requested');
 await ai().click();const question=frame.locator('[data-ai-answer]');await question.waitFor();assert.equal(await question.inputValue(),'','failed tests keep the help question empty');await question.fill('Почему этот случай');await question.press('Shift+Enter');assert.match(await question.inputValue(),/\n/);assert.equal(requests.length,0);
 await question.dispatchEvent('keydown',{key:'Enter',isComposing:true,bubbles:true});assert.equal(requests.length,0,'IME must not submit');
 await page.screenshot({path:'/private/tmp/guild-ai-question-form.png',fullPage:true});await question.press('Escape');assert.equal(await question.count(),0);assert.equal(requests.length,0);
 const snapshot=await(await fetch(origin+'/api/state')).json(),currency=snapshot.state.currency;
 // Error during initial request must be visible at the answer, with a usable retry.
 await page.route('**/api/ai-review',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Проверочный сбой соединения. Повтори запрос.'})}));
 await ask();await frame.locator('[data-ai-state="failed"]').waitFor();assert.match(await frame.locator('.nb-ai-control-status').textContent(),/Ошибка/);assert.equal(await ai().isDisabled(),false);
 assert.match(await frame.locator('.nb-ai-review').textContent(),/Проверочный сбой/);
 console.log('Initial request error visible.');await page.unroute('**/api/ai-review');
 const gate=new Promise(resolve=>{release=resolve;});
 await page.route('**/api/ai-review',async route=>{await gate;await route.continue();});
 await ask();await frame.locator('.nb-ai-progress[role="progressbar"]').waitFor();assert.equal(await ai().isDisabled(),true);assert.match(await ai().textContent(),/Генерируется/);
 // The request is still held: scrolling and the indicator must appear immediately.
 await page.waitForFunction(()=>{const f=document.querySelector('iframe'),target=f?.contentDocument.querySelector('[data-ai-review]');if(!target)return false;const y=f.getBoundingClientRect().top+target.getBoundingClientRect().top;return scrollY>100&&y>=-2&&y<innerHeight-80;});
 console.log('Immediate scroll and pending indicator OK.');release();await page.waitForResponse(r=>r.url().endsWith('/api/ai-review'));
 await frame.locator('[data-ai-state="pending"]').waitFor();assert.equal(await ai().isDisabled(),true);
 await page.reload();await frame.locator('[data-ai-state="pending"]').waitFor();await frame.locator('.nb-ai-progress').waitFor();assert.equal(await ai().isDisabled(),true);
 const files=fs.readdirSync(path.join(directory,'reviews')).filter(f=>f.endsWith('.request.json'));const job=JSON.parse(fs.readFileSync(path.join(directory,'reviews',files[0]),'utf8')),request=job.request;
 fs.writeFileSync(path.join(directory,'reviews',job.id+'.result.json'),JSON.stringify({schemaVersion:2,taskId:request.taskId,codeHash:request.codeHash,rubricVersion:request.rubricVersion,mode:'help',criteria:null,summary:'Ноль может оказаться больше всех отрицательных продаж, хотя в списке его нет.',strengths:['Сравнение внутри цикла уже есть.'],improvements:[],nextStep:'Проследи начало на двух отрицательных днях.',question:null}));
 console.log('Pending state restored after refresh.');await frame.locator('[data-ai-state="complete"]').waitFor({timeout:15000});assert.equal(await frame.locator('.nb-ai-progress').count(),0);assert.match(await frame.locator('.nb-ai-control-status').textContent(),/Ответ готов/);assert.equal(await ai().isDisabled(),false);
 await page.screenshot({path:'/private/tmp/guild-ai-answer-ready.png',fullPage:true});
 // Failure while polling also stops the animation and enables retry.
 await page.unroute('**/api/ai-review');
 await page.route('**/api/review-result',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Проверочный сбой получения ответа.'})}));
 await ask('Хочу другую подсказку: как проверить начального лидера?');await frame.locator('[data-ai-state="failed"]').waitFor({timeout:15000});assert.match(await frame.locator('.nb-ai-review').textContent(),/сбой получения/);assert.equal(await frame.locator('.nb-ai-progress').count(),0);assert.equal(await ai().isDisabled(),false);
 assert.equal((await(await fetch(origin+'/api/state')).json()).state.currency,currency);
 await page.unroute('**/api/review-result');
 // Scrolling works in the stacked layout too; mock a request failure to avoid model calls.
 await page.setViewportSize({width:375,height:800});await page.route('**/api/ai-review',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Повтори запрос.'})}));
 await ask('Почему ноль не подходит?','button');await frame.locator('[data-ai-state="failed"]').waitFor();
 await page.waitForFunction(()=>{const f=document.querySelector('iframe'),t=f?.contentDocument.querySelector('[data-ai-review]');if(!t)return false;const y=f.getBoundingClientRect().top+t.getBoundingClientRect().top;return y>=-2&&y<innerHeight-80;});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.ok(requests.length>=4);assert.ok(requests.every(r=>r.effort==='medium'),'all requests use Medium despite old Low setting');assert.ok(requests.some(r=>r.answer.includes('проверить начального лидера')));assert.ok(requests.some(r=>r.answer===''));
 await frame.locator('[data-cell-code]').fill(algorithmSolutions['algo-max-1']);await frame.locator('[data-action="cell-check"]').click();await frame.locator('.nb-test-tab.passed').first().waitFor();
 await ai().click();await question.waitFor();assert.equal(await question.inputValue(),'Почему ноль не подходит?','opening review preserves a custom question');await question.fill('');await frame.locator('[data-action="ai-question-cancel"]').click();
 await ai().click();await question.waitFor();assert.equal(await question.inputValue(),'Качество кода');await question.press('Enter');await frame.locator('[data-ai-state="failed"]').waitFor();assert.equal(requests.at(-1).answer,'Качество кода');assert.equal(requests.at(-1).effort,'medium');
 await ai().click();await question.fill('Можно ли упростить цикл?');await frame.locator('[data-ai-question-form] button[type="submit"]').click();await frame.locator('[data-ai-state="failed"]').waitFor();assert.equal(requests.at(-1).answer,'Можно ли упростить цикл?');assert.deepEqual(errors,[]);
 console.log('AI form: hidden by default, Enter/button submit, Shift+Enter/IME/Escape, enforced Medium; immediate scroll before request response; animated pending and duplicate prevention; persistence; ready/error/retry and polling errors; desktop/mobile; no reward for hints. Controlled file fixtures, no model calls.');
}catch(error){console.log(await page.evaluate(()=>{const f=document.querySelector('iframe'),t=f?.contentDocument.querySelector('[data-ai-review]');return{scroll:scrollY,height:innerHeight,body:document.documentElement.scrollHeight,frame:f?.getBoundingClientRect().toJSON(),target:t?.getBoundingClientRect().toJSON(),innerScroll:f?.contentWindow.scrollY};}));await page.screenshot({path:'/private/tmp/guild-ai-feedback-failure.png',fullPage:true});throw error;}finally{release?.();await browser.close();await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true});}
