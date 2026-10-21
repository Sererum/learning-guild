import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';import {writeSyntheticCourseProfile} from './course-profile-fixture.mjs';import {browserOptions} from './browser-runtime.mjs';
const {chromium}=createRequire(import.meta.url)('playwright'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-panel-ui-')),stateFile=path.join(directory,'progress.json');writeSyntheticCourseProfile(stateFile);
const server=createGuildServer({stateFile,reviewProvider:'off',learningProvider:'off',sharedReviewProvider:'off'});let browser;
try{await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch(browserOptions());const page=await browser.newPage({viewport:{width:1440,height:800}});await page.goto('http://127.0.0.1:'+server.address().port+'/#program');await page.locator('.route-tree [data-route-node="lesson-02-04"]').click();await page.locator('[data-route-topic="oop"]').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));

const visible=async()=>page.locator('.route-detail h2').evaluate(el=>{const r=el.getBoundingClientRect(),top=document.querySelector('.topbar').getBoundingClientRect().bottom;return r.top>=top&&r.bottom<innerHeight;});assert.ok(await visible(),'Title stays visible while roadmap scrolls');
for(const size of [{width:1440,height:800},{width:1180,height:640}]){
 await page.setViewportSize(size);await page.locator('main').evaluate(el=>el.scrollTop=el.scrollHeight);
 assert.ok(await visible(),'Title stays visible at the bottom of the roadmap');
 const before=await page.locator('main').evaluate(el=>el.scrollTop);
 await page.locator('.route-detail').evaluate(el=>el.scrollTop=el.scrollHeight);assert.ok(await visible(),'Title stays visible while panel scrolls');
 assert.equal(await page.locator('main').evaluate(el=>el.scrollTop),before,'Panel scroll does not move the roadmap');
 const bounds=await page.locator('.route-detail').boundingBox();assert.ok(bounds.y>=42&&bounds.y+bounds.height<=size.height+1,'Entire panel fits below the resource bar');
}
await page.locator('.route-detail').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'/private/tmp/guild-program-pinned-panel.png'});
console.log('Fixed detail panel and title: OK');
}finally{await browser?.close();await new Promise(r=>{server.close(r);server.closeIdleConnections?.();});fs.rmSync(directory,{recursive:true,force:true});}
