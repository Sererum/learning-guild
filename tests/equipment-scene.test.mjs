import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveEquipmentLayers,renderEquipmentLayers} from '../public/equipment-scene.js';

const catalog=[{id:'test-sword',kind:'weapon'},{id:'test-flower',kind:'artifact',slot:'flower'}];
const state={equipped:{outfit:'test-coat',weapon:'test-sword',flower:'test-flower'}};
const manifest={anchors:{weapon:{x:340,y:350,angle:5},flower:{x:210,y:170}},outfits:{'test-coat':{anchors:{weapon:{x:350,y:360,angle:10}}}},
 items:{'test-sword':{asset:'/assets/test-sword.png',anchor:'weapon',width:100,height:300,pivot:[50,260],rotation:-5,grip:'sword'},'test-flower':{asset:'/assets/test-flower.webp',width:40,height:40,layer:30}},
 grips:{sword:{asset:'/assets/test-hand.png',width:40,height:50,pivot:[20,25],anchor:'weapon'}}};

test('An outfit aligns the same worn sprite by its grip pivot; fingers cover the weapon',()=>{
 const before=structuredClone(state),result=resolveEquipmentLayers(state,catalog,manifest);
 assert.deepEqual(result.issues,[]);assert.deepEqual(state,before);
 const sword=result.layers.find(l=>l.id==='test-sword'&&l.kind==='item');
 assert.equal(sword.x,350);assert.equal(sword.y,360);assert.equal(sword.angle,5);assert.deepEqual(sword.pivot,[50,260]);
 assert.equal(result.layers.at(-1).kind,'grip');
 assert.match(renderEquipmentLayers(state,catalog,manifest),/translate\(350 360\) rotate\(5\) scale\(1\) translate\(-50 -260\)/);
});

test('Missing worn sprites never fall back to floating inventory icons',()=>{
 const result=resolveEquipmentLayers(state,catalog,{...manifest,items:{}});
 assert.equal(result.layers.length,0);assert.equal(result.issues.length,2);
 assert.equal(renderEquipmentLayers(state,catalog,{items:{}}),'');
});

test('Only known equipped slots and safe local raster/vector URLs can render',()=>{
 const bad={...manifest,items:{...manifest.items,'test-sword':{...manifest.items['test-sword'],asset:'javascript:alert(1)'}}};
 assert.equal(resolveEquipmentLayers(state,catalog,bad).layers.some(l=>l.slot==='weapon'),false);
 assert.equal(resolveEquipmentLayers({equipped:{flower:'test-sword'}},catalog,manifest).layers.length,0);
 const privatePath=resolveEquipmentLayers(state,catalog,manifest,{resolveAsset:asset=>asset.replace('/assets/','/assets/private/').replace('test-sword','../outside')});
 assert.equal(privatePath.layers.some(l=>l.slot==='weapon'),false);
});

test('Shared/back layers surround trusted portrait markup and private grips need an explicit asset mapping',()=>{
 const privateManifest={...manifest,items:{...manifest.items,'test-flower':{...manifest.items['test-flower'],layer:'behind'}},grips:{sword:{...manifest.grips.sword,asset:'grip-v1.png',private:true,layer:'hand'}}};
 const absent=resolveEquipmentLayers(state,catalog,privateManifest);
 assert.equal(absent.layers.some(l=>l.slot==='weapon'),false,'An unsupported grip cannot leave a floating weapon');
 const supported={...state,profileAssets:{'grip-v1.png':'/assets/grip-v1.png'}},output=renderEquipmentLayers(supported,catalog,privateManifest,{portrait:'<g id="portrait"/>'});
 assert.ok(output.indexOf('test-flower.webp')<output.indexOf('id="portrait"'));
 assert.ok(output.indexOf('id="portrait"')<output.indexOf('test-sword.png'));
 assert.ok(output.indexOf('test-sword.png')<output.indexOf('grip-v1.png'));
});
