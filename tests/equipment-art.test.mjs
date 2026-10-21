import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {checkEquipmentArt,inspectRaster} from '../tools/check-equipment-art.mjs';
import {equipmentManifest} from '../public/equipment-manifest.js';

const root=fileURLToPath(new URL('../',import.meta.url));
test('All current items and all 6,804 complete loadouts have prepared art and finite aligned layers',()=>{
 const files=[...new Set(Object.values(equipmentManifest.items).map(e=>path.join(root,'public',e.asset.slice(1))))],hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before=files.map(hash);
 const result=checkEquipmentArt();assert.equal(result.catalogItems,29);assert.equal(result.outfits,9);assert.equal(result.wornItems,20);assert.equal(result.combinations,6804);assert.ok(result.solidChecks>0);assert.equal(result.profilePortraits,0);assert.deepEqual(files.map(hash),before,'Checker never edits source assets');
});
test('Missing art, mismatched dimensions, broken pivots and absent pose entries fail closed',()=>{
 for(const [name,change,match] of [
  ['missing item',m=>delete m.items.quill,/отсутствует надетый слой/],
  ['dimensions',m=>m.items.quill.width=10,/pivot вне изображения|размеры изображения/],
  ['invalid pivot',m=>m.items.quill.pivot=[NaN,1],/неверная геометрия/],
  ['missing pose',m=>delete m.outfits.novice,/не привязан к общей позе/],
  ['unsafe asset',m=>m.items.quill.asset='/assets/../outside.png',/небезопасный путь/],
  ['off-scene',m=>m.anchors.weapon.x=999,/за границами сцены/],
 ]){const manifest=structuredClone(equipmentManifest);change(manifest);assert.throws(()=>checkEquipmentArt({manifest}),match,name);}
});
test('Raster header inspection rejects non-images and reads actual PNG alpha geometry',()=>{
 assert.throws(()=>inspectRaster(Buffer.from('not an image')),/PNG/);
 const image=inspectRaster(fs.readFileSync(path.join(root,'public/assets/equipment/worn-quill-v1.png')));
 assert.equal(image.format,'png');assert.equal(image.alpha,true);assert.equal(image.width,1024);assert.equal(image.height,1536);assert.ok(image.solidBounds.x>0&&image.solidBounds.right<1024);
 const webp=inspectRaster(fs.readFileSync(path.join(root,'public/assets/item-flower-v1.webp')));assert.equal(webp.width,512);assert.equal(webp.height,512);assert.equal(webp.alpha,true);assert.equal(webp.solidBounds,null);
});
