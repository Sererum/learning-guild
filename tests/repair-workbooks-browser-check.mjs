import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';import {writeSyntheticCourseProfile} from './course-profile-fixture.mjs';import {browserOptions} from './browser-runtime.mjs';
const {chromium}=createRequire(import.meta.url)('playwright'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-repair-workbooks-')),stateFile=path.join(directory,'progress.json');writeSyntheticCourseProfile(stateFile);
const server=createGuildServer({stateFile,reviewProvider:'off',learningProvider:'off',sharedReviewProvider:'off'});let browser;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch(browserOptions());const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/#program');await page.locator('.route-tree').waitFor();
 const snapshot=await (await page.request.get(origin+'/api/state')).json(),workbook=snapshot.lessons.find(l=>l.repairParts?.length===4),node=snapshot.program.nodes.find(n=>n.lessonId===workbook.id);
 assert.equal(snapshot.program.nodes.filter(n=>n.parentId===node.parentId&&n.kind==='repair').length,1);
 const originals=snapshot.lessons.filter(l=>workbook.repairParts.includes(l.id));
 await page.evaluate(async originals=>{window.guildStorage.setItem('workspace-v1',JSON.stringify({lessons:Object.fromEntries(originals.map(l=>[l.id,{viewedTheory:{[l.sections[0].id]:true}}]))}));await window.guildStorage.flush();},originals);
 await page.locator('.route-tree [data-route-node="'+node.id+'"]').click();
 assert.equal(await page.locator('[data-route-open]').count(),1);
 await page.locator('[data-route-open]').click();const frame=page.frameLocator('iframe');await frame.locator('.workbench').waitFor();
 assert.equal(await frame.locator('[data-workspace-task]').count(),4);
 assert.equal(await frame.locator('.wb-outline-theory[data-progress="complete"]').count(),4,'Old viewed theory survives merging');
 for(const id of workbook.taskIds)assert.equal(await frame.locator('[data-workspace-task="'+id+'"]').count(),1);
 // Old lesson links still open the whole workbook, not a disconnected fragment.
 await page.goto(origin+'/?lesson='+encodeURIComponent(originals.at(-1).id)+'#lesson');await frame.locator('.workbench').waitFor();
 assert.equal(await frame.locator('[data-workspace-task]').count(),4);
 assert.deepEqual((await (await page.request.get(origin+'/api/state')).json()).state,snapshot.state);
 assert.deepEqual(errors,[]);console.log('One roadmap card, one workbook with all tasks, old links and viewed theory preserved; no awards: OK');
}finally{await browser?.close();await new Promise(r=>{server.close(r);server.closeIdleConnections?.();});fs.rmSync(directory,{recursive:true,force:true});}
