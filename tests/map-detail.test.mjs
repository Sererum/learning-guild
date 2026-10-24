import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {visibleMapTiles,createMapDetailLayer} from '../public/pages/world.js';
import {TEYVAT_ATLAS} from '../public/teyvat-atlas.js';

test('overview stays lightweight; retina and zoom load only the visible geographic rectangle',()=>{
 const camera={zoom:1,x:-1900,y:-900},viewport={width:900,height:650};
 assert.deepEqual(visibleMapTiles(camera,viewport,1),[]);
 const tiles=visibleMapTiles(camera,viewport,2);
 assert(tiles.length>0&&tiles.length<25);
 for(const tile of tiles){assert(tile.x>=0&&tile.y>=0);assert(tile.x+tile.width<=TEYVAT_ATLAS.width);assert(tile.y+tile.height<=TEYVAT_ATLAS.height);}
 const corner=visibleMapTiles({zoom:2.8,x:-7400,y:-6200},{width:800,height:600},2);
 assert(corner.some(t=>t.width<256&&t.height<256));
 assert.deepEqual(visibleMapTiles({zoom:2,x:10000,y:10000},viewport,2),[]);
});
test('detailed tiles match native 4x pixels and every bundled file passes its integrity manifest',()=>{
 const root=new URL('../public/assets/teyvat/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('detail-4x/manifest.json',root)));
 assert.equal(manifest.width,TEYVAT_ATLAS.width*4);assert.equal(manifest.height,TEYVAT_ATLAS.height*4);
 assert.equal(manifest.files.length,manifest.columns*manifest.rows);
 for(const file of manifest.files){const bytes=fs.readFileSync(new URL(file.file,root));assert.equal(bytes.length,file.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256);}
});
test('panning reuses tiles, evicts offscreen artwork and keeps the overview under missing tiles',()=>{
 const children=new Set(),layer={ownerDocument:{createElement:()=>({style:{},dataset:{},remove(){children.delete(this);}})},append:image=>children.add(image)};
 const renderer=createMapDetailLayer(layer),viewport={width:700,height:600};
 renderer.update({zoom:2,x:-3900,y:-1900},viewport,2);const first=[...children];assert(first.length>0);
 renderer.update({zoom:2,x:-3900,y:-1900},viewport,2);assert.deepEqual([...children],first);
 renderer.update({zoom:2,x:-500,y:-200},viewport,2);assert([...children].every(image=>!first.includes(image)));
 renderer.update({zoom:.2,x:0,y:0},viewport,2);assert.equal(children.size,0);
 renderer.update({zoom:2,x:-3900,y:-1900},viewport,2);renderer.dispose();assert.equal(children.size,0);
});

test('detail artwork and renderer are served by both standalone and account installations',async()=>{
 const {createGuildServer}=await import('../server.mjs'),{createAccountServer}=await import('../account-server.mjs'),{default:course}=await import('../templates/starter-python/index.mjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-map-artwork-'));
 try{for(const mode of ['standalone','accounts']){
  const options={python:process.env.GUILD_PYTHON||'python3.12',reviewProvider:'off',learningProvider:'off',importHistory:false};
  const server=mode==='standalone'?createGuildServer({...options,course,stateFile:path.join(directory,'single','progress.json'),sharedDirectory:path.join(directory,'shared')}):createAccountServer({...options,root:path.join(directory,'accounts')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{const base='http://127.0.0.1:'+server.address().port;
   for(const url of ['/pages/world.js',...visibleMapTiles({zoom:2.8,x:-5700,y:-2800},{width:800,height:650},2).map(tile=>tile.src)]){
    const response=await fetch(base+url);assert.equal(response.status,200,mode+' '+url);assert((await response.arrayBuffer()).byteLength>0);
   }
  }finally{await new Promise(resolve=>server.close(resolve));}
 }}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
