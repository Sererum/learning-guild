import {browserOptions} from './browser-runtime.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';
import {initialState,catalog} from '../engine.mjs';

const require=createRequire(import.meta.url),{chromium}=require('playwright');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-worn-equipment-'));
let browser;
const servers=[];
try {
 browser=await chromium.launch(browserOptions());
 for (const painted of [false,true]) {
  const assetSource=process.env.GUILD_QA_PORTRAIT_DIR;
  if(painted&&!assetSource)continue;
  const profile=path.join(directory,painted?'painted':'neutral');fs.mkdirSync(profile);
  if(painted){fs.mkdirSync(path.join(profile,'assets'));for(const name of ['alice-scholar-v1.png','alice-wardrobe-v2.png','alice-appearance-v1.png',...['novice','tea','sea','violet','cloud','moon','aurora','ember','peony'].map(id=>'hero-outfit-'+id+'-v4.png')].filter(name=>fs.existsSync(path.join(assetSource,name))))fs.copyFileSync(path.join(assetSource,name),path.join(profile,'assets',name));}
  const state=initialState();for(const item of catalog)state.inventory[item.id]={count:1,level:0};state.equipped.feather='feather';state.equipped.clock='clock';state.hair='silver';state.skin='deep';state.portraitAsset='/assets/legacy.png';
  const stateFile=path.join(profile,'progress.json');fs.writeFileSync(stateFile,JSON.stringify(state));
  const server=createGuildServer({stateFile,profileId:painted?'painted':'neutral',importHistory:false,reviewProvider:'off',learningProvider:'off'});servers.push(server);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const page=await browser.newPage({viewport:{width:1470,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin+'/#hero');await page.locator('.hero-stage .hero-avatar').waitFor();
  assert.equal(await page.locator('.hero-avatar [data-equipped-item="quill"]').count(),1);
  assert.equal(await page.locator('.hero-art-badges,.hero-worn-equipment,[data-hero-section="appearance"],[name="hair"],[name="skin"]').count(),0);
  assert.equal(await page.locator('.hero-weapon-display,.hero-relic-shelf').count(),0,'No floating exhibition remains');assert.ok(await page.locator('.hero-avatar [data-equipped-slot="weapon"]').count());
  const before=(await(await fetch(origin+'/api/state')).json()).state;
  await page.locator('[data-hero-section="weapon"]').click();
  await page.locator('[data-item="moon-quill"]').click();
  assert.equal(await page.locator('.hero-avatar [data-equipped-item="moon-quill"]').count(),1);
  assert.equal((await(await fetch(origin+'/api/state')).json()).state.equipped.weapon,before.equipped.weapon,'preview does not equip');
  await page.locator('[data-equip="moon-quill"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-equip="moon-quill"]')?.disabled);
  assert.equal((await(await fetch(origin+'/api/state')).json()).state.equipped.weapon,'moon-quill');
  await page.locator('[data-hero-section="wardrobe"]').click();await page.locator('[data-item="peony"]').click();await page.locator('[data-equip="peony"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-equip="peony"]')?.disabled);
  await page.locator('[data-wardrobe="accessory"]').click();await page.locator('[data-item="star"]').click();await page.locator('[data-equip="star"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-equip="star"]')?.disabled);
  for(const width of [1470,390]){
   await page.setViewportSize({width,height:900});
   await page.locator('[data-item="ribbon"]').scrollIntoViewIfNeeded();
   await page.evaluate(()=>{window.compareStable={game:document.querySelector('.hero-game'),grid:document.querySelector('.hero-inventory'),cards:[...document.querySelectorAll('[data-item]')],main:document.getElementById('page').scrollTop,y:scrollY};});
   for(const id of ['ribbon','pin','wreath','ribbon','pin','wreath']){
    await page.locator('[data-item="'+id+'"]').click();
    const snapshot=await page.evaluate(()=>({stable:compareStable.game.isConnected&&compareStable.grid.isConnected&&compareStable.cards.every(el=>el.isConnected),main:document.getElementById('page').scrollTop,y:scrollY,before:{main:compareStable.main,y:compareStable.y},head:document.querySelector('.hero-avatar').getBoundingClientRect().top,left:document.querySelector('.hero-avatar').getBoundingClientRect().left,right:document.querySelector('.hero-avatar').getBoundingClientRect().right,selected:document.querySelector('[data-item].is-selected')?.dataset.item}));
    assert.equal(snapshot.stable,true,'Preview keeps collection DOM');assert.equal(snapshot.selected,id);
    assert.equal(await page.locator('.hero-avatar [data-equipped-item="'+id+'"]').count(),1,'Character shows the selected accessory');
    assert.equal(await page.locator('.hero-avatar [data-equipped-slot="accessory"]').count(),1,'Previous accessory is replaced');
    const fits=await page.locator('.hero-featured-item .hero-item-icon').evaluate(el=>{const frame=el.getBoundingClientRect(),art=el.querySelector('.hero-item-art').getBoundingClientRect();return {fits:art.left>=frame.left-1&&art.top>=frame.top-1&&art.right<=frame.right+1&&art.bottom<=frame.bottom+1,frame:[frame.width,frame.height],art:[art.width,art.height]};});
    assert.ok(fits.fits,'Full item preview must fit its frame: '+JSON.stringify(fits));

    assert.ok(Math.abs(snapshot.main-snapshot.before.main)<2,width+'px comparison retains page scroll');assert.ok(Math.abs(snapshot.y-snapshot.before.y)<2);
    assert.ok(snapshot.head>=40&&snapshot.head<500,width+'px character stays visible while selecting');assert.ok(snapshot.left>=0&&snapshot.right<=width,width+'px full character fits horizontally');
   }
   await page.screenshot({path:'/private/tmp/guild-compare-'+(painted?'painted':'neutral')+'-'+width+'.png'});
  }
  await page.setViewportSize({width:1470,height:900});
  await page.locator('[data-hero-section="attributes"]').click();
  await page.waitForLoadState('networkidle');
  const mounted=await page.locator('.hero-stage [data-equipped-item]').evaluateAll(elements=>elements.map(element=>({id:element.dataset.equippedItem,slot:element.dataset.equippedSlot})));
  for(const slot of ['weapon','accessory','flower','feather','clock'])assert.ok(mounted.some(item=>item.slot===slot),slot);
  assert.equal(await page.locator('.hero-neutral-portrait').count(),painted?0:1);
  if(painted)assert.ok(await page.locator('.hero-wardrobe-crop,.hero-painted-outfit').count());
  if(painted&&fs.existsSync(path.join(assetSource,'hero-outfit-moon-v4.png'))){
   for(const outfit of ['novice','tea','sea','violet','cloud','moon','aurora','ember','peony'].filter(id=>fs.existsSync(path.join(assetSource,'hero-outfit-'+id+'-v4.png')))){
    await page.locator('[data-hero-section="wardrobe"]').click();
    await page.locator('[data-wardrobe="outfit"]').click();
    await page.locator('[data-item="'+outfit+'"]').click();
    assert.equal(await page.locator('.hero-painted-outfit[data-outfit="'+outfit+'"]').count(),1);
    const response=await page.request.get(origin+'/assets/hero-outfit-'+outfit+'-v4.png');assert.equal(response.status(),200);assert.match(response.headers()['content-type'],/image\/png/);
    const preview=(await(await fetch(origin+'/api/state')).json()).state;assert.equal(preview.equipped.outfit,'peony','new portraits preview without equipping');
   }
   await page.locator('[data-hero-section="attributes"]').click();
  }
  await page.screenshot({path:'/private/tmp/guild-worn-'+(painted?'painted':'neutral')+'.png'});
  for(const width of [390,736,1470]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(width===390)await page.screenshot({path:'/private/tmp/guild-showroom-'+(painted?'painted':'neutral')+'-mobile.png',fullPage:true});}
  await page.setViewportSize({width:1470,height:900});await page.locator('.hero-detail-panel [data-resource-guide]').click();await page.locator('.resource-guide-dialog[open]').waitFor();await page.keyboard.press('Escape');
  await page.reload();await page.locator('.hero-stage .hero-avatar').waitFor();
  assert.equal(await page.locator('.hero-avatar [data-equipped-item="moon-quill"]').count(),1);
  const after=(await(await fetch(origin+'/api/state')).json()).state;
  for(const key of ['currency','gold','books','materials','claims','courseCredits','hair','skin','portraitAsset'])assert.deepEqual(after[key],before[key],key);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Worn equipment: real preview/equip/reload, fixed-pose outfits, attached weapons and relics, fixed appearance, neutral/private portraits, resource guide, mobile overflow and unchanged resources: OK');
} finally {await browser?.close();for(const server of servers)await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections?.();});fs.rmSync(directory,{recursive:true,force:true});}
