import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';
import {writeSyntheticCourseProfile} from './course-profile-fixture.mjs';
import {learningCourseFixture} from './learning-course-fixture.mjs';
import {browserOptions} from './browser-runtime.mjs';

const require=createRequire(import.meta.url),{chromium}=require('playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-map-novice-')),servers=[];
let browser;
async function serve(options){const server=createGuildServer({reviewProvider:'off',learningProvider:'off',sharedReviewProvider:'off',...options});servers.push(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+server.address().port;}
try{
 const stateFile=path.join(dir,'roadmap','progress.json');writeSyntheticCourseProfile(stateFile);
 const origin=await serve({stateFile});browser=await chromium.launch(browserOptions());
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 await page.goto(origin+'/#world');await page.locator('[data-world-start-current]').waitFor();
 const state=async()=>(await(await fetch(origin+'/api/state')).json()).state,before=await state();
 assert.equal(await page.locator('[data-world-point]').count(),26);
 assert.match(await page.locator('[data-world-point="algorithms"] .world-point-label').innerText(),/Базовые алгоритмы/);
 assert.equal(await page.locator('[data-world-point="variables"] .world-status-complete').innerText(),'✓');
 assert.equal(await page.locator('.world-point-label small').count(),0,'no status text clutter on the map');
 assert.equal(await page.locator('.world-point-repair .world-point-label,.world-point-daily .world-point-label').count(),0,'optional practice uses its icon, not an extra text tag');
 assert.match(await page.locator('[data-world-point="variables"]').getAttribute('aria-label'),/Пройдено/);
 assert.doesNotMatch(await page.locator('.world-legend').innerText(),/Тема закрыта/);
 const zones=await page.locator('.world-fog circle').count();
 await page.locator('[data-world-point="repair-clean"]').click();assert.equal(await page.locator('[data-world-open]').isDisabled(),false);assert.match(await page.locator('[data-topic-card]').innerText(),/Работа над ошибками/);
 await page.locator('.world-drawer-close').press('Escape');assert.equal(await page.locator('[data-world-drawer]').isVisible(),false);assert.equal(await page.locator('[data-world-point="repair-clean"]').evaluate(el=>el===document.activeElement),true);
 await page.locator('[data-world-point="archon"]').click();assert.equal(await page.locator('[data-world-open]').isDisabled(),true);assert.match(await page.locator('.topic-connections').innerText(),/Сначала пройди|временно|недоступ/);await page.locator('.world-drawer-close').click();
 await page.locator('[data-world-mode="order"]').click();assert.equal(await page.locator('.world-viewport').isVisible(),false);assert.equal(await page.locator('#world-order').isVisible(),true);
 const order=await page.locator('#world-order [data-world-select]').evaluateAll(nodes=>nodes.map(n=>n.dataset.worldSelect));
 assert.equal(new Set(order).size,26);assert.ok(order.indexOf('frequency')<order.indexOf('unique'));assert.ok(order.indexOf('unique')<order.indexOf('algorithms'));
 const repair=page.locator('#world-order [data-world-select="repair-clean"]');assert.match(await repair.innerText(),/К теме «Методы строк»/);assert.ok(order.indexOf('repair-clean')<order.indexOf('index'));
 await page.locator('#world-order [data-world-select="archon"]').click();await page.locator('.world-drawer-close').press('Escape');assert.equal(await page.locator('#world-order [data-world-select="archon"]').evaluate(el=>el===document.activeElement),true);
 await page.locator('[data-world-mode="map"]').click();await page.screenshot({path:'/private/tmp/guild-map-novice-desktop.png',fullPage:true});
 for(const width of [1440,768,375,320]){
  await page.setViewportSize({width,height:1000});
  for(const mode of ['map','order']){await page.locator(`[data-world-mode="${mode}"]`).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${mode} overflow at ${width}`);}
  if(width===375){await page.screenshot({path:'/private/tmp/guild-map-novice-mobile-order.png',fullPage:true});await page.locator('[data-world-mode="map"]').click();await page.screenshot({path:'/private/tmp/guild-map-novice-mobile.png',fullPage:true});}
 }
 await page.setViewportSize({width:1440,height:1000});await page.locator('[data-world-mode="map"]').click();await page.screenshot({path:'/private/tmp/guild-map-novice-desktop.png',fullPage:true});await page.locator('.world-atlas').screenshot({path:'/private/tmp/guild-map-novice-atlas.png'});
 assert.equal(await page.locator('.world-fog circle').count(),zones);
 assert.deepEqual(await state(),before,'map and list navigation never change progress or rewards');
 await page.locator('[data-world-start-current]').click();await page.locator('iframe').waitFor();assert.match(await page.locator('iframe').getAttribute('src'),/lesson=algorithms/);
 // A second, unrelated course checks the actual locked prerequisite explanation.
 const other=await serve({course:learningCourseFixture(),stateFile:path.join(dir,'other','progress.json'),importHistory:false});await page.goto(other+'/#world');await page.locator('[data-world-mode="order"]').click();
 assert.match(await page.locator('#world-order [data-world-select="future-point"]').innerText(),/Сначала пройди: Проверка исходного урока/);
 await page.locator('#world-order [data-world-select="future-point"]').click();assert.equal(await page.locator('[data-world-open]').isDisabled(),true);assert.match(await page.locator('.topic-connections').innerText(),/Сначала пройди: Проверка исходного урока/);
 assert.deepEqual(errors,[]);console.log('Map novice walkthrough: labels, route order, optional practice, locking reasons, keyboard focus, widths 320–1440, course neutrality and unchanged progress: OK');
}finally{await browser?.close();for(const server of servers)await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
