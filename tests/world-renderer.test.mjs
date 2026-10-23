import assert from 'node:assert/strict';
import test from 'node:test';
import {render,bind,detailCard,roadLayer,fogReveals,worldItinerary,clampCamera,zoomCamera} from '../public/pages/world.js';
import {buildTeyvatRoute} from '../public/teyvat-route.js';
import {ATLAS_REGIONS,TEYVAT_ATLAS} from '../public/teyvat-atlas.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fixture(scope='render-test'){
 const blocks=Array.from({length:10},(_,i)=>({id:`block-${i}`,title:`Block ${i+1}`}));
 const nodes=blocks.flatMap((b,i)=>Array.from({length:2},(_,j)=>({id:`node-${i}-${j}`,blockId:b.id,title:`Topic ${i+1}.${j+1}`,main:true,status:i===0?j===0?'done':'ready':'future',completed:i===0&&j===0,available:i===0,lessonId:i===0?`lesson-${j}`:null,pointId:`point-${i}-${j}`,lessonPlan:['Observe the result','Try another input'],learningGoals:[]})));
 nodes.push({id:'repair',title:'Review',blockId:blocks[0].id,parentId:nodes[0].id,main:false,kind:'repair',status:'repair',completed:false,available:true,lessonId:'repair-lesson',pointId:'repair-point'});
 return {course:{storageScope:scope},program:{blocks,nodes,nextId:'node-0-1'}};
}
test('real atlas, fixed empty slots, exact geographic ratio, honest statuses, attribution and pass controls',()=>{
 const data=fixture(),html=render({data,esc});
 assert.ok(html.includes(TEYVAT_ATLAS.image));
 assert.match(html,/width:2702px;height:2295px/);
 assert.equal((html.match(/data-world-slot=/g)||[]).length,80);
 assert.equal((html.match(/data-world-point=/g)||[]).length,17);
 for(const s of ['done','repair','ready','future'])assert.ok(html.includes(`data-point-status="${s}"`));
 assert.ok(html.includes(esc(TEYVAT_ATLAS.sourceUrl)));
 assert.ok(html.includes('data-world-pass'));assert.ok(!html.includes('Topic 9.1'));
 assert.ok(!html.includes('preserveAspectRatio="none"'));
});
test('first camera pass follows the current lesson beyond eight blocks',()=>{
 const data=fixture('second-pass');data.program.nextId='node-8-0';
 const html=render({data,esc});
 assert.ok(html.includes('data-world-point="node-8-0"'));
 assert.ok(!html.includes('data-world-point="node-0-0"'));
 assert.match(html,/<option value="1" selected>/);
});
test('sequential paths connect occupied endpoints, never empty slots',()=>{
 const atlas=buildTeyvatRoute(fixture(),ATLAS_REGIONS),html=roadLayer(atlas,esc);
 assert.ok(html.includes('data-road-from="node-0-1" data-road-to="atlas-statue:block-0"'));
 assert.ok(html.includes('data-road-from="atlas-statue:block-0" data-road-to="node-1-0"'));
 assert.ok(!html.includes('data-road-from="atlas-statue:block-0" data-road-to="node-0-0"'));
 assert.ok(!html.includes('data-road-from="node-0-1" data-road-to="node-1-0"'));
 assert.ok(!html.includes(':portal:'));
 assert.equal((html.match(/<path /g)||[]).length,24);
});
test('every occupied block statue is part of the continuous main itinerary',()=>{
 const atlas=buildTeyvatRoute(fixture(),ATLAS_REGIONS),itinerary=worldItinerary(atlas);
 for(const region of atlas.regions){
  const last=atlas.points.filter(p=>p.blockId===region.blockId&&!p.parentId).at(-1),statue='atlas-statue:'+region.blockId;
  assert.ok(itinerary.routes.some(r=>r.to===statue&&r.from===last.id&&!r.side));
  if(region!==atlas.regions.at(-1))assert.ok(itinerary.routes.some(r=>r.from===statue&&!r.side));
 }
});
test('fog selects fixed territories only after completion and has no initial clearing',()=>{
 const data=fixture();data.program.nodes.forEach(n=>n.completed=false);
 const empty=fogReveals(buildTeyvatRoute(data,ATLAS_REGIONS));assert.deepEqual(empty,{territories:[],completedRegions:[]});
 data.program.nodes[0].completed=true;
 const before=fogReveals(buildTeyvatRoute(data,ATLAS_REGIONS));assert.equal(before.territories[0].id,'mondstadt-01');
 data.program.nodes.find(n=>n.id==='node-1-0').available=true;data.program.nodes.find(n=>n.id==='repair').completed=true;
 assert.deepEqual(fogReveals(buildTeyvatRoute(data,ATLAS_REGIONS)),before);
 data.program.nodes[1].completed=true;
 const after=fogReveals(buildTeyvatRoute(data,ATLAS_REGIONS));assert.deepEqual(after.completedRegions,['mondstadt']);assert.equal(after.territories[0].id,'mondstadt:complete');
 assert.ok(!after.territories.some(t=>t.region==='liyue'));
});
test('yellow lesson portal means an available unfinished repair, and returns to normal after repair',()=>{
 const data=fixture('yellow-portal'),ctx={data,esc};
 let html=render(ctx);assert.match(html,/has-available-repair/);assert.match(html,/data-icon-state="repair"/);assert.match(html,/Доступна работа над ошибками/);
 data.program.nodes.find(n=>n.id==='repair').completed=true;
 html=render(ctx);assert.doesNotMatch(html,/has-available-repair/);
 data.program.nodes.find(n=>n.id==='repair').completed=false;data.program.nodes.find(n=>n.id==='repair').available=false;
 assert.doesNotMatch(render(ctx),/has-available-repair/);
});
test('empty program has scenery without invented lessons',()=>{
 const html=render({data:{course:{storageScope:'empty'},program:{blocks:[],nodes:[]}},esc});
 assert.equal((html.match(/data-world-slot=/g)||[]).length,96);
 assert.equal((html.match(/data-world-point=/g)||[]).length,0);
 assert.ok(html.includes('Создай свою программу'));
});
test('cards only offer available materials and escape course text',()=>{
 const data=fixture(),atlas=buildTeyvatRoute(data,ATLAS_REGIONS),node={...atlas.points[1],title:'<script>alert(1)</script>',materials:[{lessonId:'open-id',title:'Available',available:true},{lessonId:'locked-id',title:'Future',available:false}]};
 const html=detailCard({data,esc},node,atlas);
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('data-world-open="open-id"'));assert.ok(!html.includes('data-world-open="locked-id"'));
 assert.ok(html.includes('Observe the result'));assert.ok(html.includes('data-world-program'));
});
test('wheel/pinch zoom preserves the image coordinate under the pointer and clamps extremes',()=>{
 const camera={zoom:1.2,x:-800,y:-600},anchor={x:150,y:220},next=zoomCamera(camera,2,anchor);
 assert.ok(Math.abs((anchor.x-camera.x)/camera.zoom-(anchor.x-next.x)/next.zoom)<1e-9);
 assert.ok(Math.abs((anchor.y-camera.y)/camera.zoom-(anchor.y-next.y)/next.zoom)<1e-9);
 assert.equal(zoomCamera(camera,100,anchor).zoom,2.8);assert.equal(zoomCamera(camera,0,anchor).zoom,.16);
 const bound=clampCamera({zoom:1,x:99999,y:-99999},1000,650);
 assert.equal(bound.x,70);assert.equal(bound.y,650-2295-70);
 const overview=clampCamera({zoom:.2,x:200,y:100},1000,650);
 assert.equal(overview.x,(1000-2702*.2)/2);assert.equal(overview.y,(650-2295*.2)/2);
});
class Element extends EventTarget{
 constructor(dataset={}){super();this.dataset=dataset;this.attributes={};this.style={setProperty:(k,v)=>{this.style[k]=v;}};this.classes=new Set();this.classList={toggle:(k,v)=>v?this.classes.add(k):this.classes.delete(k),add:k=>this.classes.add(k),remove:k=>this.classes.delete(k)};this.hidden=true;this.clientWidth=1000;this.clientHeight=650;this.innerHTML='';}
 setAttribute(k,v){this.attributes[k]=v;}focus(){this.focused=true;}getBoundingClientRect(){return {left:0,top:0};}setPointerCapture(){}scrollIntoView(options){this.scrolled=options;}
}
function mockRoot(data){
 const atlas=buildTeyvatRoute(data,ATLAS_REGIONS),viewport=new Element(),canvas=new Element(),drawer=new Element(),scroll=new Element(),close=new Element(),region=new Element(),scale=new Element(),program=new Element(),current=new Element(),overview=new Element(),pass=new Element();
 const points=atlas.points.map(p=>new Element({worldPoint:p.id}));
 const overflow=atlas.overflow.map(p=>new Element({worldSelect:p.id}));
 const openButtons=[new Element({worldOpen:'lesson-1',worldOrigin:'point-0-1'}),new Element({worldOpen:'forbidden',worldOrigin:''})];
 drawer.querySelector=s=>s==='.world-drawer-scroll'?scroll:s==='[data-world-drawer-close]'?close:null;
 drawer.querySelectorAll=s=>s==='[data-world-open]'?openButtons:s==='[data-world-program]'?[program]:[];
 const lookup={'.world-viewport':viewport,'.world-canvas':canvas,'.world-quest-drawer':drawer,'[data-world-scale]':scale,'[data-world-region]':region,'[data-world-drawer-close]':close,'[data-world-current]':current,'[data-world-overview]':overview,'[data-world-pass]':pass};
 const root={isConnected:true,querySelector:s=>lookup[s]||null,querySelectorAll:s=>s==='[data-world-point]'?points:s==='[data-world-point],[data-world-select]'?[...points,...overflow]:s==='[data-world-program]'?[program]:[]};
 return {root,viewport,canvas,drawer,scroll,close,points,openButtons,pass,overflow};
}
function event(type,props={}){const e=new Event(type,{cancelable:true});for(const [k,v] of Object.entries(props))Object.defineProperty(e,k,{value:v});return e;}
test('selection updates only drawer, preserves camera, opens allowed lesson and handles drag/wheel',()=>{
 const data=fixture('interaction');render({data,esc});const dom=mockRoot(data),opened=[];
 bind(dom.root,{data,esc,openLesson:(...args)=>opened.push(args),navigate:()=>{}});
 const initial=dom.canvas.style.transform;
 dom.points[1].dispatchEvent(event('click'));
 assert.equal(dom.canvas.style.transform,initial);assert.equal(dom.drawer.hidden,false);assert.ok(dom.scroll.innerHTML.includes('Topic 1.2'));
 dom.openButtons[0].onclick();dom.openButtons[1].onclick();assert.deepEqual(opened,[['lesson-1','point-0-1']]);
 dom.close.dispatchEvent(event('click'));assert.equal(dom.drawer.hidden,true);assert.equal(dom.canvas.style.transform,initial);
 dom.viewport.dispatchEvent(event('wheel',{deltaY:-100,deltaMode:0,clientX:300,clientY:200}));assert.notEqual(dom.canvas.style.transform,initial);
 const afterZoom=dom.canvas.style.transform;
 dom.viewport.dispatchEvent(event('pointerdown',{pointerId:1,clientX:300,clientY:200,pointerType:'mouse',button:0}));
 dom.viewport.dispatchEvent(event('pointermove',{pointerId:1,clientX:350,clientY:240}));
 assert.notEqual(dom.canvas.style.transform,afterZoom);
 dom.points[0].dispatchEvent(event('click'));assert.equal(dom.drawer.hidden,true,'drag must not select a portal');
 dom.viewport.dispatchEvent(event('pointerup',{pointerId:1}));
});
test('changing passes restores their own camera and switching accounts clears it',()=>{
 const data=fixture('pass-camera');render({data,esc});const dom=mockRoot(data),ctx={data,esc,openLesson:()=>{},navigate:()=>{}};bind(dom.root,ctx);
 dom.viewport.dispatchEvent(event('wheel',{deltaY:-70,deltaMode:0,clientX:200,clientY:200}));
 const first=dom.canvas.style.transform;dom.pass.value='1';dom.pass.dispatchEvent(event('change'));
 assert.match(dom.root.innerHTML,/data-world-point="node-8-0"/);
 const second=dom.canvas.style.transform;assert.notEqual(second,first);
 dom.pass.value='0';dom.pass.dispatchEvent(event('change'));assert.equal(dom.canvas.style.transform,first);
 dom.pass.value='1';dom.pass.dispatchEvent(event('change'));assert.equal(dom.canvas.style.transform,second);
 const next=fixture('different-account');render({data:next,esc});bind(dom.root,{...ctx,data:next});
 assert.notEqual(dom.canvas.style.transform,first);
});
test('two-finger pinch changes camera without selecting a portal',()=>{
 const data=fixture('pinch');render({data,esc});const dom=mockRoot(data);bind(dom.root,{data,esc,openLesson:()=>{},navigate:()=>{}});
 const first=dom.canvas.style.transform;
 dom.viewport.dispatchEvent(event('pointerdown',{pointerId:1,clientX:250,clientY:250,pointerType:'touch',button:0}));
 dom.viewport.dispatchEvent(event('pointerdown',{pointerId:2,clientX:350,clientY:250,pointerType:'touch',button:0}));
 dom.viewport.dispatchEvent(event('pointermove',{pointerId:2,clientX:400,clientY:250}));
 assert.notEqual(dom.canvas.style.transform,first);
 assert.equal(dom.canvas.style['--world-inverse'],1/1.875);
 dom.points[0].dispatchEvent(event('click'));assert.equal(dom.drawer.hidden,true);
 dom.viewport.dispatchEvent(event('pointercancel',{pointerId:1}));dom.viewport.dispatchEvent(event('pointercancel',{pointerId:2}));
});
test('current program step takes priority over an available repair even without ready materials',()=>{
 const data=fixture('next-step-priority');data.program.nextId='node-1-0';
 const html=render({data,esc}),current=html.match(/<button[^>]*class="world-point[^\"]*is-current[^\"]*"[^>]*data-world-point="([^"]+)"/);
 assert.equal(current?.[1],'node-1-0');
 const dom=mockRoot(data);bind(dom.root,{data,esc,openLesson:()=>{},navigate:()=>{}});
 const point=buildTeyvatRoute(data,ATLAS_REGIONS).points.find(p=>p.id==='node-1-0');
 const expected=clampCamera({zoom:1.25,x:500-point.x/100*TEYVAT_ATLAS.width*1.25,y:325-point.y/100*TEYVAT_ATLAS.height*1.25},1000,650);
 assert.equal(dom.canvas.style.transform,`translate(${expected.x}px,${expected.y}px) scale(1.25)`);
});
test('overflow selection reveals its card while keeping camera still; normal portals do not scroll',()=>{
 const data=fixture('overflow-card');data.program.nodes.push({id:'extra-practice',title:'Extra practice',blockId:'block-0',parentId:'node-0-0',main:false,kind:'practice',status:'future'});
 render({data,esc});const dom=mockRoot(data);bind(dom.root,{data,esc,openLesson:()=>{},navigate:()=>{}});
 const camera=dom.canvas.style.transform;dom.points[0].dispatchEvent(event('click'));
 assert.equal(dom.drawer.scrolled,undefined);assert.equal(dom.canvas.style.transform,camera);
 dom.close.dispatchEvent(event('click'));dom.overflow[0].dispatchEvent(event('click'));
 assert.deepEqual(dom.drawer.scrolled,{block:'nearest',behavior:'instant'});
 assert.equal(dom.canvas.style.transform,camera);assert.equal(dom.drawer.hidden,false);assert.ok(dom.scroll.innerHTML.includes('Extra practice'));
});
