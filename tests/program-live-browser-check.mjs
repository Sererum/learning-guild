import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';import {writeSyntheticCourseProfile} from './course-profile-fixture.mjs';import {browserOptions} from './browser-runtime.mjs';
const {chromium}=createRequire(import.meta.url)('playwright'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-live-ui-')),stateFile=path.join(directory,'progress.json');writeSyntheticCourseProfile(stateFile);
const server=createGuildServer({stateFile,reviewProvider:'off',learningProvider:'off',sharedReviewProvider:'off'});let browser;
try{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch(browserOptions());const origin='http://127.0.0.1:'+server.address().port;
for(const mode of ['planner','lesson']){
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let polls=0;
 await page.route('**/api/state',async route=>{const response=await route.fetch(),data=await response.json();polls++;const done=polls>=4;
 if(mode==='planner'){data.program.busy=!done;data.program.proposals=[{id:'live-proposal',scope:{kind:'program',id:'program'},status:done?'advice':'pending',message:'Проверка запроса',summary:done?'Ответ подготовлен.':'',operations:[]}];}
 else {data.learning.jobs=[{id:'live-lesson',programRequest:{message:'Новый урок',lessonTitle:'Новая тема'},status:done?'ready':'running',stage:done?'ready':polls<3?'generating':'validating',branches:[],summary:done?'Материал готов.':''}];}
 await route.fulfill({response,json:data});});
 await page.goto(origin+'/#program');await page.locator('[data-route-form]').waitFor();
 await page.locator('.route-log summary').click();await page.locator('#program-request-message').fill('Черновик во время ожидания');
 await page.locator('#program-request-message').evaluate(el=>el.setSelectionRange(3,8));
 await page.locator('[data-route-topic="pandas"]').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
 await page.evaluate(()=>{window.stable={main:document.querySelector('main'),tree:document.querySelector('.route-tree'),panel:document.querySelector('.route-detail'),input:document.querySelector('#program-request-message'),job:document.querySelector('[data-program-job]'),proposal:document.querySelector('[data-proposal-id]')};window.savedScroll={main:stable.main.scrollTop,panel:stable.panel.scrollTop};});
 await page.waitForFunction(()=>document.querySelector('.route-proposal')?.textContent.includes('Ответ подготовлен.')||document.querySelector('.program-job')?.textContent.includes('Материал готов.'),{},{timeout:12000});
 assert.ok(polls>=4,'At least three background updates');
 const result=await page.evaluate(()=>({stable:Object.values(stable).filter(Boolean).every(el=>el.isConnected),main:stable.main.scrollTop,panel:stable.panel.scrollTop,before:savedScroll,text:stable.input.value,caret:[stable.input.selectionStart,stable.input.selectionEnd],focused:document.activeElement===stable.input,expanded:document.querySelector('.route-log').open}));
 assert.equal(result.stable,true,mode+': same DOM nodes survive polling');assert.equal(result.main,result.before.main);assert.equal(result.panel,result.before.panel);assert.equal(result.text,'Черновик во время ожидания');assert.deepEqual(result.caret,[3,8]);assert.equal(result.focused,true);assert.equal(result.expanded,true);assert.deepEqual(errors,[]);
 await page.close();console.log(mode+': live updates preserve DOM, scroll, expanded sections, draft, selection and focus');
}
}finally{await browser?.close();await new Promise(r=>{server.close(r);server.closeIdleConnections?.();});fs.rmSync(directory,{recursive:true,force:true});}
