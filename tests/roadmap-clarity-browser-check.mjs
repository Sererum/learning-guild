import {browserOptions} from './browser-runtime.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-roadmap-clarity-'));
const server=createGuildServer({stateFile:path.join(directory,'state.json'),reviewProvider:'file'});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch(browserOptions());
try {
 const page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
 await page.goto(origin+'/#world');await page.locator('[data-world-start-current]').waitFor();
 const savedBefore=JSON.stringify((await(await fetch(origin+'/api/state')).json()).state);
 assert.match(await page.locator('.world-region-guide').textContent(),/1\. Базовый синтаксис и строки/);
 assert.match(await page.locator('.world-region-guide').textContent(),/2\. Структуры данных и алгоритмы/);
 assert.equal(await page.locator('[data-topic-card="algorithms"]').count(),1);
 assert.equal(await page.locator('.world-current-label').textContent(),'Далее · Урок 2.4');
 for(const id of ['variables','while','keys','frequency','unique']){
  await page.locator(`[data-world-point="${id}"]`).click();
  assert.equal(await page.locator('[data-world-open]').isDisabled(),true,`${id} cannot open`);
 }
 await page.locator('[data-world-point="algorithms"]').hover();
 assert.match(await page.locator('[data-world-point="algorithms"] .world-tooltip').textContent(),/Базовые алгоритмы/);
 assert.ok((await page.locator('[data-world-point="algorithms"] .world-tooltip>span').textContent()).length>60);
 await page.locator('[data-world-point="algorithms"]').click();
 assert.equal(await page.locator('[data-world-open]').isDisabled(),false);
 assert.match(await page.locator('.topic-card').textContent(),/480/);
 assert.match(await page.locator('.topic-card').textContent(),/до 110/i);assert.match(await page.locator('[data-lesson-progress]').textContent(),/0 \/ 10/);
 await page.locator('[data-world-point="foundation-archon"]').click();
 assert.equal(await page.locator('[data-world-open]').isDisabled(),false);
 assert.match(await page.locator('.topic-card').textContent(),/640/);
 await page.locator('[data-world-open]').click();await page.locator('iframe').waitFor();
 assert.match(await page.locator('iframe').getAttribute('src'),/(?:task=foundations-exam|lesson=foundations-final)/);
 await page.locator('[data-page="world"]').click();
 await page.locator('[data-world-start-current]').click();await page.locator('iframe').waitFor();
 assert.match(await page.locator('iframe').getAttribute('src'),/(?:task=algo-max-1|lesson=algorithms)/);
 await page.locator('[data-page="book"]').click();await page.locator('.book-spread').waitFor();
 assert.equal(await page.locator('[data-book-open-point]:not([disabled])').count(),2);
 assert.equal(await page.locator('[data-book-open-point="algorithms"]').isDisabled(),false);
 assert.match(await page.locator('.book-selected-detail').textContent(),/Базовые алгоритмы/);
 assert.equal(await page.locator('[data-book-detail-open="algorithms"]').isDisabled(),false);
 await page.locator('[data-book-select="while"]').click();
 assert.match(await page.locator('.book-selected-detail').textContent(),/Изучали · практика частично/);
 assert.equal(await page.locator('[data-book-detail-open="while"]').isDisabled(),true);
 await page.locator('[data-book-section="history"]').click();
 assert.ok(await page.locator('[data-book-history]').count()>0);
 assert.equal(await page.locator('[data-book-history]:not([disabled])').count(),0);
 assert.equal(await page.locator('[data-book-detail-open]:not([disabled])').count(),0);
 for(const width of [1500,1024,736,375,320]){
  await page.setViewportSize({width,height:1000});
  await page.locator('[data-page="world"]').click();await page.locator('.world-current').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`map has no horizontal overflow at ${width}`);
  await page.locator('[data-world-point="algorithms"]').click();
  assert.equal(await page.locator('[data-world-open]').isDisabled(),false);
  await page.locator('[data-page="book"]').click();await page.locator('.book-spread').waitFor();
  await page.locator('[data-book-section="lessons"]').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`book has no horizontal overflow at ${width}`);
 }
 await page.setViewportSize({width:1500,height:1050});await page.locator('[data-page="world"]').click();
 await page.screenshot({path:'/private/tmp/guild-roadmap-clarity-map.png',fullPage:true});
 await page.locator('[data-page="book"]').click();
 await page.screenshot({path:'/private/tmp/guild-roadmap-clarity-book.png',fullPage:true});
 assert.equal(JSON.stringify((await(await fetch(origin+'/api/state')).json()).state),savedBefore,'navigation must not change saved progress');
 assert.deepEqual(errors,[]);
 console.log('Roadmap clarity: current lesson visible, two whole lessons playable, archive disabled, shared map/book status, tooltip description, no progress from navigation, widths320–1500: OK');
} finally {
 await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});
}
