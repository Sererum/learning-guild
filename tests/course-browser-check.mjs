import {browserOptions} from './browser-runtime.mjs';
// Real-browser integration proof. Every server uses a temporary profile and OS-assigned port.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';
import {loadCourse} from '../course-loader.mjs';
import {algorithmSolutions} from './algorithm-solutions.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'guild-course-browser-'));
const alice=await loadCourse({courseId:'alice-python'}),starter=await loadCourse({courseId:'starter-python'});
let server,port,origin;
const start=async(course,profileId='default')=>{
 if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 server=createGuildServer({course,profileId,stateFile:path.join(temp,course.id,profileId,'progress.json'),reviewEnabled:false});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port||0,'127.0.0.1',resolve);});
 port=server.address().port;origin='http://127.0.0.1:'+port;
};
const browser=await chromium.launch(browserOptions());
const context=await browser.newContext({viewport:{width:1500,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const frame=()=>page.frameLocator('iframe');
const openMapLesson=async point=>{
 await page.locator('[data-page="world"]').click();await page.locator(`[data-world-point="${point}"]`).click();await page.locator('[data-world-open]').click();await frame().locator('.wb-brand h1').waitFor();
};
const check=async()=>{
 const pending=page.waitForResponse(response=>response.url().endsWith('/api/check'));
 await frame().locator('[data-action="cell-check"]').click();const response=await pending,data=await response.json();assert.equal(response.status(),200,JSON.stringify(data));return data;
};
const state=async()=>await(await fetch(origin+'/api/state')).json();
try{
 await start(alice);
 await page.addInitScript(()=>{if(location.origin.startsWith('http://127.0.0.1:')&&!localStorage.getItem('course-qa-seeded')){localStorage.setItem('alice-guild-drafts-v1',JSON.stringify({'algo-max-1':'# Старый черновик Алисы\n'}));localStorage.setItem('course-qa-seeded','1');}});
 await page.goto(origin+'/#world');await page.locator('[data-world-point="algorithms"]').waitFor();
 assert.match(await page.locator('.brand strong').textContent(),/Python/);
 await page.locator('[data-page="book"]').click();await page.locator('[data-book-open-point="algorithms"]').waitFor();
 assert.equal(await page.locator('[data-book-open-point="algorithms"]').isEnabled(),true);
 await openMapLesson('algorithms');
 assert.equal(await frame().locator('.wb-outline-practice').count(),10);assert.equal(await frame().locator('[data-cell-code]').count(),0);
 await frame().locator('[data-workspace-node="algo-max-1"]').click();const aliceField=frame().locator('[data-cell-code="algo-max-1"]');
 assert.equal(await aliceField.inputValue(),'# Старый черновик Алисы\n');
 await aliceField.fill(algorithmSolutions['algo-max-1']);const aliceResult=await check();assert.equal(aliceResult.result.ok,true,JSON.stringify(aliceResult.result));
 await frame().locator('.nb-test-tab.passed').first().waitFor();assert.equal(await frame().locator('.nb-test-tab.failed').count(),0);
 await page.reload();await frame().locator('[data-cell-code="algo-max-1"]').waitFor();assert.equal(await frame().locator('[data-cell-code="algo-max-1"]').inputValue(),algorithmSolutions['algo-max-1']);assert.equal((await state()).state.currency,0,'one task does not award a whole Alice lesson');
 const aliceDraftKey=await page.evaluate(()=>window.guildStorage.key('alice-guild-drafts-v1'));
 console.log('Alice: map, book, whole lesson, theory, direct tests and migrated/reloaded drafts OK.');

 await page.goto('about:blank');await start(starter);await page.goto(origin+'/#world');await page.locator('[data-world-point="starter-point"]').waitFor();
 assert.match(await page.locator('.brand strong').textContent(),/Технический пример курса/);
 assert.equal(await page.locator('[data-world-point="algorithms"]').count(),0);
 await page.locator('[data-page="book"]').click();await page.locator('[data-book-open-point="starter-point"]').waitFor();
 assert.match(await page.locator('.book-quality-note').textContent(),/до 10 за решение/);assert.doesNotMatch(await page.locator('.book-quality-note').textContent(),/20|финальн/);
 await openMapLesson('starter-point');assert.match(await frame().locator('.wb-brand h1').textContent(),/Технический пример/);
 assert.equal(await frame().locator('.wb-outline-practice').count(),1);assert.equal(await frame().locator('[data-cell-code]').count(),0);
 assert.equal(await frame().locator('[data-action="wb-example-run"]').count(),0,'a section without example cannot show an empty run button');
 const isolatedFrame=page.frames().find(f=>f.url().includes('/lesson-workbench/index.html'));await isolatedFrame.evaluate(()=>{location.hash='tree';});await isolatedFrame.waitForFunction(()=>location.hash==='#practice');assert.equal(await frame().locator('.quest-tree-screen, .atlas-map, .notebook-page').count(),0,'legacy iframe routes cannot revive old course UI');
 await frame().locator('[data-workspace-node="starter-total"]').click();const starterField=frame().locator('[data-cell-code="starter-total"]');
 assert.match(await starterField.inputValue(),/values = \[2, 3\]/);assert.doesNotMatch(await starterField.inputValue(),/sales|Старый черновик Алисы/);
 const starterCode='values = [2, 3]\ntotal = sum(values)\nprint(total)\n';await starterField.fill(starterCode);
 const runResponse=page.waitForResponse(response=>response.url().endsWith('/api/execute'));await frame().locator('[data-action="cell-execute"]').click();assert.equal((await(await runResponse).json()).result.ok,true);
 const starterResult=await check();assert.equal(starterResult.result.ok,true,JSON.stringify(starterResult.result));assert.equal(starterResult.state.currency,160);
 await page.reload();await frame().locator('[data-cell-code="starter-total"]').waitFor();assert.equal(await frame().locator('[data-cell-code="starter-total"]').inputValue(),starterCode);
 assert.equal(await page.evaluate(()=>JSON.parse(window.guildStorage.getItem('alice-guild-drafts-v1'))['algo-max-1']),undefined);
 assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key))['algo-max-1'],aliceDraftKey),algorithmSolutions['algo-max-1']);
 console.log('Starter: same interface loads arbitrary content, runs/tests Python, earns 160 once and keeps separate drafts.');

 await page.goto('about:blank');await start(starter,'second');await page.goto(origin+'/#world');await openMapLesson('starter-point');await frame().locator('[data-workspace-node="starter-total"]').click();
 assert.notEqual(await frame().locator('[data-cell-code="starter-total"]').inputValue(),starterCode);assert.equal((await state()).state.currency,0);
 assert.equal(await page.evaluate(()=>window.guildStorage.key('alice-guild-drafts-v1')),`learning-guild:${encodeURIComponent('starter-python:second')}:drafts-v1`);
 await page.goto('about:blank');await start(starter);await page.goto(origin+'/#lesson');await frame().locator('[data-cell-code="starter-total"]').waitFor();assert.equal(await frame().locator('[data-cell-code="starter-total"]').inputValue(),starterCode);assert.equal((await state()).state.currency,160);
 const again=await check();assert.equal(again.state.currency,160,'checking accepted work cannot duplicate rewards');
 assert.deepEqual(errors,[],'no page or iframe JavaScript errors');console.log('Profile isolation, restarts, reward idempotency and browser errors OK.');
}finally{
 await browser.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});
}
