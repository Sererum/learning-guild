import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,claim,act,importCourseHistory,normalizeState} from '../engine.mjs';
import {createEngine} from '../shared/engine-core.mjs';

const day='2026-10-18';
function zeroResources(){
  const state=initialState();
  for(const key of ['currency','gold','books','crystals','petals','characterXp'])state[key]=0;
  for(const key of Object.keys(state.materials))state.materials[key]=0;
  return state;
}
function resources(state){return {currency:state.currency,gold:state.gold,books:state.books,crystals:state.crystals,petals:state.petals,materials:structuredClone(state.materials)};}

test('A fresh Alice profile has zero consumable resources, and updates preserve an existing balance',()=>{
  const fresh=initialState();
  for(const key of ['currency','gold','books','crystals','petals','characterXp'])assert.equal(fresh[key],0,key);
  assert.ok(Object.keys(fresh.materials).length>0);for(const [key,count] of Object.entries(fresh.materials))assert.equal(count,0,key);
  for(const id of ['novice','quill','flower'])assert.equal(fresh.inventory[id].count,1,id);
  assert.equal(fresh.level,19);
  const saved=structuredClone(fresh);Object.assign(saved,{currency:167,gold:456,books:3,crystals:2,petals:4});saved.materials.dust=7;saved.characterXp=200;
  const before=JSON.stringify(saved);normalizeState(saved);assert.equal(JSON.stringify(saved),before);
});

test('From zero a single daily pays every first enhancement without wishes or spending gems',()=>{
  const s=zeroResources(),paid=claim(s,'daily',day);
  assert.equal(paid.gems,60);
  assert.deepEqual(paid.resources,{gold:400,books:1,crystals:0,petals:2,materials:{notes:2,ore:2,cloth:2,dust:1}});
  assert.match(paid.message,/пыли реликвий/);
  act(s,{type:'enhance',target:'character',materials:{books:1}},day);
  act(s,{type:'enhance',target:'quill',materials:{ore:1}},day);
  act(s,{type:'enhance',target:'novice',materials:{cloth:1}},day);
  act(s,{type:'enhance',target:'flower',materials:{dust:1}},day);
  assert.equal(s.level,20);assert.equal(s.inventory.quill.level,1);assert.equal(s.inventory.novice.level,1);assert.equal(s.inventory.flower.level,1);
  assert.equal(s.gold,60);assert.equal(s.currency,60);assert.equal(s.history.length,0);
  for(const id of ['flower','quill','novice'])assert.equal(s.inventory[id].count,1);
});

test('Level 1 can grow with recurring study, and first ascension has no gacha dependency',()=>{
  const s=zeroResources();s.level=1;
  claim(s,'lesson',day);
  for(let i=0;i<14;i++){
    claim(s,'daily','2026-10-'+String(18+i).padStart(2,'0'));
    // The daily supplies one book plus two notes: 700 XP, enough to reach 20.
    const needed=(20-s.level)*500-s.characterXp;
    if(needed>=500)act(s,{type:'enhance',target:'character',materials:{books:1}},day);
    const notes=Math.min(s.materials.notes,Math.floor(((20-s.level)*500-s.characterXp)/100));
    if(notes)act(s,{type:'enhance',target:'character',materials:{notes}},day);
  }
  assert.equal(s.level,20);assert.ok(s.crystals>=1);assert.ok(s.petals>=2);assert.ok(s.gold>=300);
  const gems=s.currency;act(s,{type:'ascend'},day);
  assert.equal(s.stage,1);assert.equal(s.currency,gems);assert.equal(s.history.length,0);
});

test('Repeated checks, imported course history and normalization never grant supplies again',()=>{
  const s=zeroResources();claim(s,'daily',day);const first=resources(s);
  const repeated=claim(s,'daily',day);assert.equal(repeated.already,true);assert.deepEqual(resources(s),first);
  importCourseHistory(s,{awardRewards:false});normalizeState(s);assert.deepEqual(resources(s),first);
  claim(s,'daily','2026-10-19');assert.equal(s.gold,first.gold+400);assert.equal(s.materials.dust,first.materials.dust+1);
});

test('Repair supplies follow first accepted tasks; the 40-gem group payment is unchanged',()=>{
  const s=zeroResources();
  assert.equal(claim(s,'repair-clean-1',day).gems,0);assert.equal(s.gold,400);assert.equal(s.materials.dust,1);
  assert.equal(claim(s,'repair-clean-2',day).gems,0);
  assert.equal(claim(s,'repair-clean-3',day).gems,40);assert.equal(s.gold,1200);assert.equal(s.petals,1);
  const before=resources(s);for(const id of ['repair-clean-1','repair-clean-2','repair-clean-3'])claim(s,id,day);
  assert.deepEqual(resources(s),before);
});

test('A completed exam pays its configured supplies once; existing exam credit pays nothing',()=>{
  const s=zeroResources(),paid=claim(s,'foundations-exam',day);
  assert.equal(paid.gems,640);assert.equal(s.gold,1200);assert.equal(s.books,4);assert.equal(s.materials.dust,3);assert.equal(s.crystals,2);
  const before=resources(s);claim(s,'foundations-exam',day);assert.deepEqual(resources(s),before);
  s.claims.exam=true;const covered=claim(s,'frequency-practice',day);
  assert.equal(covered.already,true);assert.deepEqual(resources(s),before);
});

test('A different course defines supplies as data; the platform keeps legacy courses compatible',()=>{
  const config={initialState:{materials:{},gold:0,books:0,crystals:0,petals:0},taskRewards:{test:7},resourceRewards:{task:{gold:31,materials:{dust:2}}}};
  const engine=createEngine(config),s=engine.initialState();engine.claim(s,'test',day);
  assert.equal(s.gold,31);assert.equal(s.books,0);assert.equal(s.currency,7);assert.equal(s.materials.dust,2);
  const legacy=createEngine({...config,resourceRewards:undefined}),old=legacy.initialState();legacy.claim(old,'test',day);
  assert.equal(old.gold,100);assert.equal(old.books,1);assert.equal(old.materials.ore,2);
});
