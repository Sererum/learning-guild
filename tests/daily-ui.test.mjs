import test from 'node:test';
import assert from 'node:assert/strict';
import {renderDaily,bindDaily,remainingSeconds,countdown} from '../public/pages/daily.js';
import {render,blockStatues} from '../public/pages/world.js';
import {mapIcon} from '../public/map-icons.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const context=(status='available')=>({esc,data:{course:{storageScope:'neutral:default'},daily:{timeZone:'Europe/Moscow',serverNow:'2026-10-22T20:59:00Z',resetsAt:'2026-10-22T21:00:00Z',today:{id:'daily-test',day:'2026-10-22',title:'Учебная практика',prompt:'Вычисли результат <script>bad()</script>',starter:'print("start")',status,reward:{gems:60,gold:100,materials:{ore:2}}},history:[]}}});
test('daily reward is explicitly claimed only after successful completion; claimed state has no payout button',()=>{
 const available=renderDaily(context()),completed=renderDaily(context('completed')),claimed=renderDaily(context('claimed'));
 assert.doesNotMatch(available,/data-daily-action="claim"/);assert.match(completed,/data-daily-action="claim"/);assert.doesNotMatch(claimed,/data-daily-action="claim"/);
 assert.match(available,/00:01:00/);assert.match(available,/60 примогемов/);assert.match(available,/100 моры/);assert.match(available,/2 руды/);assert.match(claimed,/Награда получена/);
 assert.match(available,/&lt;script&gt;/);assert.doesNotMatch(available,/<script>/);
});
test('daily empty bank explains absence, history displays saved solutions as escaped text',()=>{
 const ctx=context();ctx.data.daily.today=null;ctx.data.daily.reason='Сначала пройди знакомую тему';ctx.data.daily.history=[{id:'old',day:'2026-10-21',title:'Прошлая практика',status:'expired',completed:true,code:'print("<saved>")'}];
 const html=renderDaily(ctx);assert.match(html,/Сегодня пока нет дэйлика/);assert.match(html,/Сначала пройди/);assert.match(html,/награда не получена/);assert.match(html,/&lt;saved&gt;/);assert.doesNotMatch(html,/data-daily-action/);
});
test('time expires at deadline with no negative countdown',()=>{
 assert.equal(remainingSeconds('2026-10-22T21:00:00Z',Date.parse('2026-10-22T20:59:59Z')),1);
 assert.equal(remainingSeconds('2026-10-22T21:00:00Z',Date.parse('2026-10-22T21:00:00Z')),0);
 assert.equal(countdown(remainingSeconds('2026-10-22T21:00:00Z',Date.parse('2026-10-23T21:00:00Z'))),'00:00:00');
});
test('expired mounted daily disables actions and refreshes once, using server clock',async()=>{
 const ctx=context();ctx.data.daily.serverNow='2026-10-22T21:00:01Z';let refreshed=0,callback;
 ctx.refresh=async()=>{refreshed++;};ctx.navigate=()=>{};
 const editor=new EventTarget(),button=new EventTarget(),counter={},note={};editor.value='print(1)';button.dataset={dailyAction:'claim'};
 const elements={'#daily-code':editor,'[data-daily-countdown]':counter,'[data-daily-expiry-note]':note};
 const root={isConnected:true,querySelector:s=>elements[s]||null,querySelectorAll:s=>s==='[data-daily-action]'?[button]:[]};
 const original=globalThis.setInterval;globalThis.setInterval=fn=>{callback=fn;return 0;};
 try{bindDaily(root,ctx);callback();callback();await Promise.resolve();assert.equal(refreshed,1);assert.equal(button.disabled,true);assert.equal(counter.textContent,'00:00:00');}finally{globalThis.setInterval=original;root.isConnected=false;callback();}
});
test('map symbols keep distinct silhouettes; only completed teleport emits blue',()=>{
 assert.match(mapIcon('teleport',{active:true}),/#83e8ff/);assert.doesNotMatch(mapIcon('teleport',{active:false}),/#83e8ff/);
 for(const kind of ['statue','teleport','repair','daily'])assert.match(mapIcon(kind),new RegExp('map-icon-'+kind));
 const ctx=context();ctx.data.program={blocks:[{id:'first',title:'Основы'}],nodes:[{id:'done',blockId:'first',title:'Пройденный',main:true,completed:true,available:true,status:'done'},{id:'ready',blockId:'first',title:'Готовый',main:true,completed:false,available:true,status:'ready'}],nextId:'ready'};ctx.data.daily.today.topicId='done';
 const html=render(ctx),ready=html.slice(html.indexOf('data-world-point="ready"'),html.indexOf('data-world-point="ready"')+1300);
 assert.match(ready,/#969ea3/);assert.match(html,/world-statue/);assert.match(html,/world-daily-marker/);assert.match(html,/data-world-daily/);
});
test('statue waits for every required stage, including final exam, but ignores optional repairs',()=>{
 const atlas={regions:[{id:'r',blockId:'b',blockTitle:'Блок',name:'Регион',x:40,y:40}],points:[{id:'one',blockId:'b',main:true,completed:true},{id:'repair',blockId:'b',main:false,parentId:'one',completed:false}],overflow:[{id:'exam',blockId:'b',main:true,completed:false}]};
 assert.equal(blockStatues(atlas)[0].completed,false);atlas.overflow[0].completed=true;assert.equal(blockStatues(atlas)[0].completed,true);
});
