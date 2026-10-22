import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {cinemaMarkup,WISH_CINEMA_MEDIA} from '../public/pages/wish-cinema.js';
import {createGuildServer} from '../server.mjs';
import {initialState} from '../engine.mjs';

test('All equipment kinds share one painted movie per rarity and retain separate artwork',()=>{
 for(const rarity of [3,4,5])for(const kind of ['artifact','weapon','outfit','accessory']){
  const html=cinemaMarkup({rarity,itemHtml:`<img src="/assets/${kind}-example.png">`,label:'Example',kind});
  assert.ok(html.includes(WISH_CINEMA_MEDIA[rarity].video));
  assert.ok(html.includes(`/assets/${kind}-example.png`));
  assert.doesNotMatch(html,/wish-item-silhouette|wish-flight|<canvas/);
 }
 const single=cinemaMarkup({rarity:4,itemHtml:'',label:'One',kind:'artifact'}),ten=cinemaMarkup({rarity:4,itemHtml:'',label:'One',kind:'artifact',count:10,preview:true});
 assert.ok(single.includes(WISH_CINEMA_MEDIA[4].video));assert.ok(ten.includes(WISH_CINEMA_MEDIA[4].video));assert.match(ten,/И ещё 9 находок/);assert.match(ten,/без списания и награды/);
});

test('Public cinema streams support seeking and reject invalid ranges without profile mutation',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-cinema-media-')),stateFile=path.join(dir,'state.json');fs.writeFileSync(stateFile,JSON.stringify(initialState()));
 const server=createGuildServer({stateFile,importHistory:false,reviewProvider:'off'});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{const before=fs.readFileSync(stateFile,'utf8');for(const rarity of [3,4,5]){const url=origin+WISH_CINEMA_MEDIA[rarity].video;const range=await fetch(url,{headers:{Range:'bytes=0-31'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-type'),'video/mp4');assert.equal((await range.arrayBuffer()).byteLength,32);assert.match(range.headers.get('content-range'),/^bytes 0-31\//);const invalid=await fetch(url,{headers:{Range:'bytes=999999999999-'}});assert.equal(invalid.status,416);await invalid.arrayBuffer();}const module=await fetch(origin+'/pages/wish-cinema.js');assert.equal(module.status,200);await module.text();assert.equal(fs.readFileSync(stateFile,'utf8'),before);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
