import {browserOptions} from './browser-runtime.mjs';
import {completeTaskFeedback} from './feedback-browser-helper.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';import {algorithmSolutions} from './algorithm-solutions.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-outline-progress-'));
const server=createGuildServer({stateFile:path.join(directory,'state.json'),reviewProvider:'file'});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(browserOptions());
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/?lesson=algorithms#lesson');const frame=page.frameLocator('iframe');
 const node=id=>frame.locator(`[data-workspace-node="${id}"]`);
 const status=async(id,value)=>assert.equal(await node(id).getAttribute('data-progress'),value,id);
 await node('max').waitFor();await status('max','reading');await status('substring','new');await status('algo-max-1','new');
 await node('prep-algo-max-2').click();await status('prep-algo-max-2','reading');await node('algo-max-2').click();await status('prep-algo-max-2','complete');await completeTaskFeedback(page);await node('algo-max-1').click();await completeTaskFeedback(page);await status('max','complete');await status('prep-algo-max-2','complete');
 const field=frame.locator('[data-cell-code]');
 const check=async()=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/check'));await frame.locator('[data-action="cell-check"]').click();return(await(await response).json()).result;};
 await field.fill('sales = [740, 510, 980, 630]\nbest_sale = max(sales)\nprint(best_sale)');assert.equal((await check()).ok,false);await status('algo-max-1','retry');
 await page.reload();await node('algo-max-1').waitFor();await status('algo-max-1','retry');await status('max','complete');await status('prep-algo-max-2','complete');await status('substring','new');
 const data=await(await fetch(origin+'/api/state')).json(),task=data.tasks.find(t=>t.id==='algo-max-1');
 const correct=task.starter+'\n'+algorithmSolutions[task.id];await field.fill(correct);assert.equal((await check()).ok,true);await status('algo-max-1','complete');
 // A failed new attempt should be yellow even after a previously accepted solution.
 await field.fill(task.starter+'\nbest_sale = 0\nfor sale in sales:\n    if sale > best_sale:\n        best_sale = sale\nprint(best_sale)');assert.equal((await check()).ok,false);await status('algo-max-1','retry');
 await field.fill(correct);assert.equal((await check()).ok,true);await status('algo-max-1','complete');
 await node('algo-max-2').click();await completeTaskFeedback(page);await frame.locator('[data-action="cell-execute"]').click();await frame.locator('[data-action="cell-execute"]').filter({hasText:'Запустить код'}).waitFor();await status('algo-max-2','new');
 await field.fill('best_index = 0\nprint(best_index)');assert.equal((await check()).ok,false);await status('algo-max-2','retry');
 const colors=async()=>Promise.all(['max','algo-max-2','substring'].map(id=>node(id).evaluate(el=>getComputedStyle(el).backgroundColor)));
 let palette=await colors();assert.equal(new Set(palette).size,3);await node("max").hover();assert.equal((await colors())[0],palette[0]);
 await frame.locator('[data-action="wb-theme"]').click();palette=await colors();assert.equal(new Set(palette).size,3);
 await frame.locator('[data-action="wb-theme"]').click();
 await page.screenshot({path:'/private/tmp/guild-outline-progress.png',fullPage:true});
 await page.goto(origin+'/?lesson=repair-keys#lesson');await node('repair-theory-keys').waitFor();await status('repair-theory-keys','reading');
 await page.goto(origin+'/?lesson=algorithms#lesson');await node('max').waitFor();await status('max','complete');await status('prep-algo-max-2','complete');await status('algo-max-1','complete');await status('algo-max-2','retry');await status('substring','new');
 for(const width of [375,320]){await page.setViewportSize({width,height:1000});assert.equal(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.deepEqual(errors,[]);console.log('Outline progress: theory completed by moving forward and accepted tasks green, failed tests yellow, untouched neutral; reload, lesson switches, repeat attempts, Run-only, light/dark and mobile OK.');
}finally{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(directory,{recursive:true,force:true});}
