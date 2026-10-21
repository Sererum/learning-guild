import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {itemArt,paintedItemAssets} from '../public/pages/item-art.js';
import {avatar} from '../public/pages/hero.js';

const assetPaths={
  quill:'/assets/item-wanderer-sword-v1.png',
  'archive-quill':'/assets/item-amethyst-wand-v1.png',
  'moon-quill':'/assets/item-moonblade-v1.png',
  'dawn-quill':'/assets/item-dawn-staff-v1.png',
  moon:'/assets/outfit-moon-v3.png',
  aurora:'/assets/outfit-aurora-v3.png',
  ember:'/assets/outfit-ember-v3.png',
  peony:'/assets/outfit-peony-v3.png'
};
const catalog=Object.keys(assetPaths).map(id=>({id,kind:id.includes('quill')?'weapon':'outfit',name:'Synthetic '+id,color:'#829b87',rarity:5}));
const privateOutfit='hero-outfit-moon-v4.png';
const privateUrl='/assets/'+privateOutfit;
const allowedOutfit={[privateOutfit]:privateUrl};
function state(overrides={}) {
  return {name:'Test character',hair:'chestnut',skin:'warm',stage:0,
    equipped:{outfit:'moon',weapon:'quill'},
    inventory:{moon:{count:1,level:0},quill:{count:1,level:0}},
    currency:320,gold:500,characterXp:12,
    rewards:{lessonTokens:['synthetic-completed']},
    progress:{'synthetic-task':{passed:true,rewarded:true}},...overrides};
}
function freeze(value) {
  if(value&&typeof value==='object') {for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  return value;
}
function renderUnchanged(input,mini=false) {
  const before=structuredClone(input);
  const html=avatar(freeze(input),freeze(catalog),mini);
  assert.deepEqual(input,before,'drawing must preserve appearance, equipment, progress and rewards');
  return html;
}

test('eight painted item PNGs are distinct bounded square images with an alpha channel',()=>{
  const hashes=new Set();
  for(const [id,asset] of Object.entries(assetPaths)) {
    const bytes=readFileSync(new URL('../public'+asset,import.meta.url));
    assert.ok(bytes.length>33&&bytes.length<=8*1024*1024,id+' stays within the 8 MB asset bound');
    assert.deepEqual(bytes.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]),id+' PNG signature');
    assert.equal(bytes.readUInt32BE(8),13,id+' IHDR length');
    assert.equal(bytes.toString('ascii',12,16),'IHDR',id+' starts with image header');
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    assert.ok(width>=512&&width<=4096,id+' has useful bounded resolution');
    assert.equal(height,width,id+' is square for both inventory and held rendering');
    assert.equal(bytes[24],8,id+' uses 8-bit channels');
    assert.ok([4,6].includes(bytes[25]),id+' PNG colour type includes alpha');
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  assert.equal(hashes.size,8,'every requested object has its own image bytes');
});

test('itemArt selects a standalone raster for each requested weapon and outfit',()=>{
  const selected=new Set();
  for(const item of catalog) {
    assert.equal(paintedItemAssets[item.id],assetPaths[item.id]);
    const html=itemArt(item);
    const images=[...html.matchAll(/<image\b[^>]*href="([^"]+)"/g)];
    assert.equal(images.length,1,item.id+' draws one standalone raster');
    assert.equal(images[0][1],assetPaths[item.id]);
    assert.match(html,/preserveAspectRatio="xMidYMid meet"/);
    assert.doesNotMatch(html,/outfit-collection|outfit-crop|clipPath|<path\b|<rect\b|\.svg(?:"|\?)/,item.id+' avoids sheet crops and vector placeholders');
    selected.add(images[0][1]);
    assert.match(itemArt(item,{decorative:true}),/aria-hidden="true"/);
  }
  assert.equal(selected.size,8);
});

test('private complete outfit requires the exact profile allow-map',()=>{
  for(const mini of [false,true]) {
    const html=renderUnchanged(state({profileAssets:allowedOutfit}),mini);
    assert.match(html,/class="hero-painted-outfit" data-outfit="moon"/);
    assert.ok(html.includes('href="'+privateUrl+'"'));
    assert.doesNotMatch(html,/hero-neutral-portrait|hero-wardrobe-crop|hero-costume-tint/);
  }
  const implicitDefaults=state({profileAssets:allowedOutfit});
  delete implicitDefaults.hair;delete implicitDefaults.skin;
  assert.match(renderUnchanged(implicitDefaults),/hero-painted-outfit/);
  for(const profileAssets of [undefined,{}, {[privateOutfit]:'/assets/other.png'},
    {[privateOutfit]:'https://example.invalid/outfit.png'},
    {[privateOutfit]:'/assets/../outside.png'}]) {
    const html=renderUnchanged(state({profileAssets}));
    assert.doesNotMatch(html,/hero-painted-outfit|hero-outfit-moon-v4\.png/);
    assert.match(html,/hero-neutral-portrait/);
  }
  const another=renderUnchanged(state({equipped:{outfit:'aurora',weapon:'quill'},profileAssets:allowedOutfit}));
  assert.doesNotMatch(another,/hero-painted-outfit|hero-outfit-moon-v4\.png/,'another equipped outfit cannot borrow the moon portrait');
});

test('fixed appearance ignores saved custom portraits and colours without erasing them',()=>{
 for(const appearance of [{hair:'dark'},{hair:'silver'},{skin:'light'},{skin:'deep'},{portraitAsset:'/assets/test-portrait.png'}]) {
  const input=state({...appearance,profileAssets:{...allowedOutfit,'test-portrait.png':'/assets/test-portrait.png','alice-appearance-v1.png':'/assets/alice-appearance-v1.png'}});
  const html=renderUnchanged(input);
  assert.match(html,/hero-painted-outfit/);
  assert.doesNotMatch(html,/hero-appearance-crop|href="\/assets\/test-portrait|hero-worn-equipment|hero-held-weapon/);
 }
});
