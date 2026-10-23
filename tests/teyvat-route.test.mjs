import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTeyvatRoute} from '../public/teyvat-route.js';
import {ATLAS_REGIONS} from '../public/teyvat-atlas.js';

const atlas=Array.from({length:8},(_,i)=>({id:'region-'+i,name:'Регион '+i,portals:Array.from({length:12},(_,j)=>({x:5+i*11+j*.3,y:10+j*6}))}));
const node=(id,blockId,extra={})=>({id,title:id,blockId,main:true,status:'future',completed:false,available:false,prerequisites:[],...extra});
const fixture=()=>({program:{blocks:[{id:'start',title:'Первый блок'},{id:'next',title:'Следующий блок'}],nodes:[node('one','start'),node('two','start',{prerequisites:['one']}),node('three','next',{prerequisites:['two']})],nextId:'one'},state:{claims:{retained:true},currency:80}});

test('regional itinerary visits Liyue before Inazuma',()=>{
 assert.deepEqual(ATLAS_REGIONS.map(region=>region.id),['mondstadt','liyue','inazuma','sumeru','fontaine','natlan','nod-krai','snezhnaya']);
 assert.equal(ATLAS_REGIONS.flatMap(region=>region.portals).length,96);
 assert.equal(new Set(ATLAS_REGIONS.flatMap(region=>region.portals.map(portal=>portal.sourcePointId))).size,96);
});

test('fixed 96 slots, short blocks skip unused slots and proceed to the next geographic region',()=>{
 const result=buildTeyvatRoute(fixture(),atlas);
 assert.equal(result.slots.length,96);
 assert.equal(new Set(result.slots.map(s=>s.id)).size,96);
 assert.deepEqual(result.points.map(p=>[p.id,p.region,p.slotId]),[['one','region-0','region-0:portal:01'],['two','region-0','region-0:portal:02'],['three','region-1','region-1:portal:01']]);
 assert.deepEqual(result.routes.map(r=>[r.from,r.to]),[['one','two'],['two','three']]);
 assert.equal(result.slots.filter(s=>s.nodeId===null).length,93);
});

test('deterministic pure projection preserves full future roadmap, IDs, access and prerequisites',()=>{
 const data=fixture(),before=structuredClone(data),atlasBefore=structuredClone(atlas);
 const first=buildTeyvatRoute(data,atlas),second=buildTeyvatRoute(data,atlas);
 assert.deepEqual(first,second);assert.deepEqual(data,before);assert.deepEqual(atlas,atlasBefore);
 assert.equal(first.points.length,3);assert.equal(first.points[2].status,'future');assert.equal(first.points[2].available,false);
 assert.deepEqual(first.points[2].prerequisites,['two']);assert.equal(first.points[0].current,true);
 first.points[2].prerequisites.push('changed');first.regions[0].portals[0].x=99;
 assert.deepEqual(data,before);assert.deepEqual(atlas,atlasBefore);
 data.program.nodes[0].status='done';data.program.nodes[0].completed=true;data.program.nextId='two';
 const progressed=buildTeyvatRoute(data,atlas);
 assert.deepEqual(progressed.points.map(p=>[p.id,p.x,p.y]),second.points.map(p=>[p.id,p.x,p.y]));
});

test('excluded nodes never display and do not shift the remaining portals',()=>{
 const data=fixture(),before=buildTeyvatRoute(data,atlas);
 data.program.nodes[0].excluded=true;data.program.excluded=['three'];
 const result=buildTeyvatRoute(data,atlas);
 assert.deepEqual(result.points.map(p=>p.id),['two']);assert.deepEqual(result.overflow,[]);
 assert.equal(result.points[0].slotId,before.points[1].slotId);assert.equal(result.slots[0].nodeId,null);
});

test('ten blocks use two passes and preserve excess lessons in the current pass overflow',()=>{
 const blocks=Array.from({length:10},(_,i)=>({id:'block-'+i,title:'Block '+i}));
 const nodes=blocks.flatMap(b=>Array.from({length:14},(_,j)=>node(b.id+'-'+j,b.id)));
 const result=buildTeyvatRoute({program:{blocks,nodes}},atlas);
 const second=buildTeyvatRoute({program:{blocks,nodes}},atlas,{pass:1});
 assert.equal(result.passesCount,2);assert.equal(result.pass,0);assert.equal(second.pass,1);
 assert.deepEqual(second.passes[1].blockIds,['block-8','block-9']);
 assert.equal(result.points.length,96);assert.equal(result.overflow.length,16);
 assert.equal(second.points.length,24);assert.equal(second.overflow.length,4);
 assert.equal(result.overflow.filter(n=>n.overflowReason==='region-capacity').length,16);
 assert.equal(new Set([...result.points,...result.overflow,...second.points,...second.overflow].map(n=>n.nodeId)).size,nodes.length);
 assert.equal(new Set(result.passes.flatMap(pass=>pass.nodeIds)).size,nodes.length);
 assert.equal(second.points[0].region,'region-0');assert.equal(second.points[0].id,'block-8-0');
 assert.deepEqual(second.points[0].slotId,result.points[0].slotId);
 assert.ok(second.routes.every(r=>r.from.startsWith('block-8-')||r.from.startsWith('block-9-')));
 assert.ok(result.overflow.every(n=>n.x===undefined&&n.y===undefined));
 assert.deepEqual(result.routes.find(r=>r.to==='block-1-0').skippedNodeIds,['block-0-12','block-0-13']);
});

test('repeated pass selection is stable across exclusions, progress, and branch additions',()=>{
 const blocks=Array.from({length:10},(_,i)=>({id:'b'+i}));
 const nodes=blocks.flatMap(b=>[node(b.id+'-a',b.id),node(b.id+'-b',b.id)]);
 nodes.push(node('repair-later',undefined,{main:false,parentId:'b8-a',kind:'repair',lessonId:'later-material'}));
 const data={program:{blocks,nodes}},first=buildTeyvatRoute(data,atlas,{pass:1});
 assert.equal(first.points.find(p=>p.members).parentId,'b8-a');
 assert.ok(!buildTeyvatRoute(data,atlas).overflow.some(p=>p.id==='repair-later'));
 nodes[16].excluded=true;nodes[18].completed=true;nodes[18].status='done';
 const changed=buildTeyvatRoute(data,atlas,{pass:1});
 assert.equal(changed.pass,1);assert.equal(changed.passesCount,2);
 assert.equal(changed.points.find(p=>p.id==='b8-b').slotId,first.points.find(p=>p.id==='b8-b').slotId);
 assert.equal(changed.points.find(p=>p.id==='b9-a').region,'region-1');
 assert.ok(!changed.points.some(p=>p.id==='b8-a'));
 assert.equal(changed.overflow.find(p=>p.id==='repair-later').overflowReason,'side-branch');
 assert.equal(buildTeyvatRoute(data,atlas,{pass:100}).pass,1);
 assert.equal(buildTeyvatRoute(data,atlas,{pass:-1}).pass,0);
 assert.equal(buildTeyvatRoute(data,atlas,{pass:NaN}).pass,0);
});

test('multiple repairs share one stable branch and keep all original materials and IDs',()=>{
 const data=fixture();
 data.program.nodes.push(node('repair-a','start',{main:false,parentId:'one',kind:'repair',lessonId:'repair-lesson-a',available:true}),node('repair-b','start',{main:false,parentId:'one',kind:'repair',lessonId:'repair-lesson-b',completed:true,status:'done'}));
 const result=buildTeyvatRoute(data,atlas),repairs=result.points.filter(p=>p.members);
 assert.equal(repairs.length,1);assert.equal(repairs[0].id,'atlas-repair:one');
 assert.deepEqual(repairs[0].sourceNodeIds,['repair-a','repair-b']);assert.deepEqual(repairs[0].members.map(m=>m.lessonId),['repair-lesson-a','repair-lesson-b']);
 assert.equal(repairs[0].completed,false);assert.equal(repairs[0].available,true);
 assert.equal(result.routes.filter(r=>r.side).length,1);assert.equal(result.slots.filter(s=>s.nodeId).length,3);
 data.program.nodes.find(n=>n.id==='repair-a').excluded=true;
 assert.equal(buildTeyvatRoute(data,atlas).points.find(p=>p.members).id,repairs[0].id);
});

test('unmapped nodes and additional branches remain available in overflow; no course-specific IDs',()=>{
 const data=fixture();
 data.program.nodes.push(node('extra','start',{main:false,parentId:'one',kind:'diagnostic'}),node('orphan','missing'),node('repair-orphan','start',{main:false,parentId:'absent',kind:'repair'}));
 const result=buildTeyvatRoute(data,atlas);
 assert.deepEqual(result.overflow.map(n=>[n.id,n.overflowReason]),[['extra','side-branch'],['orphan','unassigned'],['repair-orphan','side-branch']]);
 const alternate={program:{blocks:[{id:'totally-different',nodeIds:['learn']}],nodes:[{id:'learn',title:'Другая тема',status:'ready',available:true}]}};
 assert.equal(buildTeyvatRoute(alternate,atlas).points[0].id,'learn');
 assert.equal(buildTeyvatRoute({},atlas).slots.length,96);
 assert.deepEqual(buildTeyvatRoute({},atlas).points,[]);
});

test('invalid atlas geometry fails explicitly rather than generating random or missing slots',()=>{
 assert.throws(()=>buildTeyvatRoute(fixture(),[]),/eight/);
 const bad=structuredClone(atlas);bad[0].portals[0].x=101;
 assert.throws(()=>buildTeyvatRoute(fixture(),bad),/percentages/);
 bad[0].portals[0].x=10;bad[0].id=bad[1].id;
 assert.throws(()=>buildTeyvatRoute(fixture(),bad),/unique/);
});
