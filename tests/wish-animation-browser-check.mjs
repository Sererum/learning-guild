import {browserOptions} from './browser-runtime.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';import {initialState} from '../engine.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-wish-animation-')),stateFile=path.join(dir,'state.json'),seed=initialState();seed.currency=5000;seed.pity.outfit=19;fs.writeFileSync(stateFile,JSON.stringify(seed));
const server=createGuildServer({stateFile,importHistory:false,reviewProvider:'off'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch(browserOptions());
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];let purchases=0;page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/api/action')&&r.postDataJSON()?.type==='wish')purchases++;});
 await page.goto(origin+'/#wishes');await page.locator('[data-stellar-preview]').click();await page.locator('.wish-preview-notice').waitFor();await page.locator('[data-wish-skip]').click();await page.locator('[data-wish-cinema]').waitFor({state:'detached'});assert.equal(purchases,0);assert.equal(JSON.parse(fs.readFileSync(stateFile)).currency,5000);await page.locator('[data-stellar-wish="1"]').click();await page.locator('.wish-cinema.rarity-5').waitFor();
 await page.locator('.wish-cinema.is-playing').waitFor();
 const atPhase=async ms=>{await page.waitForFunction(ms=>performance.now()-Number(document.querySelector('[data-wish-cinema]').dataset.startedAt)>=ms,ms);};
 await atPhase(2150);await page.screenshot({path:'/private/tmp/guild-wish-flight.png'});
 await atPhase(3350);await page.screenshot({path:'/private/tmp/guild-wish-impact.png'});
 await atPhase(5900);await page.screenshot({path:'/private/tmp/guild-wish-reveal.png'});
 await page.locator('.stellar-result-modal').waitFor();assert.equal(await page.locator('.stellar-result-card').count(),1);assert.equal(purchases,1);assert.equal(JSON.parse(fs.readFileSync(stateFile)).currency,4840);
 await page.locator('.stellar-result-modal [data-stellar-close]').last().click();await page.locator('[data-stellar-wish="10"]').click();await page.locator('[data-wish-skip]').waitFor();await page.locator('[data-wish-skip]').click();await page.locator('.stellar-result-modal').waitFor();assert.equal(await page.locator('.stellar-result-card').count(),10);assert.equal(purchases,2);assert.equal(JSON.parse(fs.readFileSync(stateFile)).currency,3240);
 await page.locator('.stellar-result-modal [data-stellar-close]').last().click();await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-stellar-wish="1"]').click();await page.locator('.stellar-result-modal').waitFor();assert.equal(await page.locator('[data-wish-cinema]').count(),0);assert.equal(purchases,3);
 await page.locator('.stellar-result-modal [data-stellar-close]').last().click();await page.emulateMedia({reducedMotion:'no-preference'});
 // Exercise every item kind and rarity without buying or touching saved state.
 for(const [kind,rarity] of [['artifact',3],['outfit',4],['weapon',5]]){
  await page.evaluate(async ({kind,rarity})=>{const {playWishAnimation}=await import('/pages/wishes.js');const {catalog}=await(await fetch('/api/state')).json();const item=catalog.find(x=>x.kind===kind);const dialog=document.createElement('dialog');document.body.append(dialog);dialog.showModal();window.animationFinished=false;playWishAnimation(dialog,[{...item,rarity}],{data:{catalog},esc:s=>String(s)}).then(()=>{window.animationFinished=true;dialog.close();dialog.remove();});},{kind,rarity});
  await page.locator('.wish-cinema.rarity-'+rarity).waitFor();if(kind==='outfit'){await page.setViewportSize({width:390,height:844});await page.locator('.wish-cinema.is-playing').waitFor();await page.waitForFunction(()=>performance.now()-Number(document.querySelector('[data-wish-cinema]').dataset.startedAt)>=5900);await page.screenshot({path:'/private/tmp/guild-wish-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  await page.keyboard.press('Escape');await page.waitForFunction(()=>window.animationFinished);assert.equal(await page.locator('[data-wish-cinema]').count(),0);
 }
 assert.deepEqual(errors,[]);console.log('Wish cinematic: real temporary purchases once, full sequence, skip ×10, reduced motion, Escape, all item kinds/rarities, mobile layout; no browser errors.');
}finally{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
