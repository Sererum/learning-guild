import test from 'node:test';import assert from 'node:assert/strict';
import {requiredBlockStages,finalBlockExam,blockAccessRequirements} from '../public/block-progress.js';
import {buildTeyvatRoute} from '../public/teyvat-route.js';import {ATLAS_REGIONS} from '../public/teyvat-atlas.js';
import {worldItinerary,blockStatues,detailCard} from '../public/pages/world.js';
const fixture=()=>({blocks:[{id:'one'},{id:'empty'},{id:'two'}],nodes:[{id:'a',blockId:'one',title:'First',main:true,completed:false,available:true},{id:'b',blockId:'one',title:'Second',main:true,completed:false,available:true},{id:'final',kind:'exam',blockId:'one',title:'Final',main:true,completed:false,available:true,lessonId:'exam-material',pointId:'exam-point',materials:[{lessonId:'exam-material',pointId:'exam-point',available:true}]},{id:'review',blockId:'one',parentId:'a',main:false,kind:'repair',completed:false,available:true},{id:'next',blockId:'two',main:true,completed:false,available:true}]});
test('final exam requires every ordinary mandatory stage, optional reviews are excluded',()=>{const f=fixture();assert.deepEqual(requiredBlockStages(f.nodes,'one').map(n=>n.id),['a','b','final']);assert.equal(finalBlockExam(f.nodes,'one').id,'final');assert.deepEqual(blockAccessRequirements(f.nodes,f.blocks,f.nodes[2]),['a','b']);assert.deepEqual(blockAccessRequirements(f.nodes,f.blocks,f.nodes[4]),['final']);});
test('diagnostic is an explicit optional assessment and does not bypass final exam',()=>{const f=fixture(),d={id:'diagnostic',blockId:'one',parentId:'a',main:false,kind:'diagnostic'};assert.deepEqual(blockAccessRequirements(f.nodes,f.blocks,d),[]);assert.deepEqual(blockAccessRequirements(f.nodes,f.blocks,f.nodes[4]),['final']);});
test('statue replaces final portal, closes the route, and cannot offer an exam before lessons',()=>{
 const f=fixture(),atlas=buildTeyvatRoute({program:f},ATLAS_REGIONS),itinerary=worldItinerary(atlas),statue=blockStatues(atlas)[0];
 assert.equal(statue.examNodeId,'final');assert.equal(statue.available,false);assert.equal(statue.completed,false);
 assert.ok(!itinerary.points.some(p=>p.id==='final'));assert.ok(itinerary.routes.some(r=>r.from==='b'&&r.to===statue.id));assert.ok(itinerary.routes.some(r=>r.from===statue.id&&r.to==='next'));
 const html=detailCard({esc:String},statue,atlas);assert.doesNotMatch(html,/data-world-open=/);assert.match(html,/Сначала пройди/);
 f.nodes[0].completed=f.nodes[1].completed=true;
 const ready=blockStatues(buildTeyvatRoute({program:f},ATLAS_REGIONS))[0];assert.equal(ready.available,true);assert.match(detailCard({esc:String},ready,atlas),/data-world-open="exam-material"/);
 f.nodes[2].completed=true;assert.equal(blockStatues(buildTeyvatRoute({program:f},ATLAS_REGIONS))[0].completed,true);
});
