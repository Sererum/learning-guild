import {readFileSync as readCourseFixture} from 'node:fs';
import {lessons as courseLessons} from '../lessons.mjs';
const coursePresentation=JSON.parse(readCourseFixture(new URL('../courses/alice-python/presentation.json',import.meta.url)));
import test from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../engine.mjs';
import {publicTasks} from '../tasks.mjs';
import {notebookLesson} from '../notebook.mjs';
import {visibleRegions,describePoint} from '../public/journey.js';

const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const count=(html,re)=>[...html.matchAll(re)].length;
function context(){const state=rules.initialState();rules.importCourseHistory(state);return {data:{course:{recurringTasks:['daily']},presentation:coursePresentation,lessons:courseLessons,state,tasks:publicTasks({}),lesson:notebookLesson,courseMap:rules.courseMap,day:'2026-10-16'},rules,esc,openLesson(){},navigate(){},api:async()=>{}};}
async function view(id){return import(`../public/pages/journal-presentation.js?test=${id}`);}
function control(dataset={}){return {dataset,value:'',selectionStart:0,events:{},addEventListener(event,fn){this.events[event]=fn;},fire(event){this.events[event]?.({target:this,currentTarget:this});},focus(){},setSelectionRange(){}};}
function rootSurface(){const groups={};for(const [name,values] of Object.entries({bookSection:['lessons','daily','repair','history'],achievementFilter:['all','earned','locked'],achievementSlot:['0','1','2','3','4']}))groups[`[data-${name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}]`]=values.map(value=>control({[name]:value}));const singles={};for(const name of ['book-status','book-search','book-map','book-detail-open','achievement-search','achievement-clear'])singles[`[data-${name}]`]=control();return {innerHTML:'',groups,singles,querySelectorAll:selector=>groups[selector]||[],querySelector:selector=>singles[selector]||null};}

test('journal availability is the shared describePoint result for real course points',async()=>{
 const pages=await view('gates'),ctx=context(),before=JSON.stringify(ctx.data.state),html=pages.renderBook(ctx),regions=new Set(visibleRegions(ctx).map(r=>r.id));
 const points=ctx.data.courseMap.points.filter(p=>regions.has(p.region)&&!['daily','repair'].includes(p.kind));
 assert.equal(count(html,/data-book-open-point=/g),points.length);
 for(const p of points){const button=html.match(new RegExp(`data-book-open-point="${p.id}"([^>]*)>`));assert.ok(button,`${p.id} has an action`);assert.equal(button[1].includes('disabled'),!describePoint(ctx,p).available,`${p.id} uses shared prerequisites`);}
 assert.match(html,/class="book-selected-detail"/);assert.match(html,/<img class="quest-cover-art"[^>]*src="\/assets\/book-landscape-v1\.png"/);assert.doesNotMatch(html,/undefined|NaN/);assert.equal(JSON.stringify(ctx.data.state),before);
});

test('journal puts the full algorithms lesson first and opens either complete lesson through the shared route',async()=>{
 const pages=await view('whole-lessons'),ctx=context(),calls=[];ctx.openLesson=(...args)=>calls.push(args);
 const html=pages.renderBook(ctx);
 assert.match(html,/Доступны полный урок 2\.4 и финал блока 1/);
 assert.ok(html.indexOf('data-book-open-point="algorithms"')<html.indexOf('data-book-open-point="foundation-archon"'));
 assert.ok(html.indexOf('data-book-open-point="foundation-archon"')<html.indexOf('data-book-open-point="frequency"'));
 assert.match(html,/до 10 за обычную задачу и до 20 за мини-проект/);
 const openControls=['algorithms','foundation-archon','frequency'].map(id=>control({bookOpenPoint:id}));
 const root=rootSurface(),queryAll=root.querySelectorAll;
 root.querySelectorAll=selector=>selector==='[data-book-open-point]'?openControls:queryAll(selector);
 pages.bindBook(root,ctx);
 for(const item of openControls)item.onclick();
 assert.deepEqual(calls,[['algorithms','algorithms'],['foundations-exam','foundation-archon']]);
});

test('journal sections, status and search preserve daily completion and empty states',async()=>{
 const pages=await view('filters'),ctx=context(),root=rootSurface();ctx.data.state.claims['daily:2026-10-16']=true;
 root.innerHTML=pages.renderBook(ctx);pages.bindBook(root,ctx);root.groups['[data-book-section]'][1].onclick();
 assert.equal(count(root.innerHTML,/data-book-open-point=/g),1);assert.match(root.innerHTML,/data-book-open-point="daily-point"/);assert.match(root.innerHTML,/Награда получена/);
 root.singles['[data-book-status]'].value='next';root.singles['[data-book-status]'].fire('change');assert.equal(count(root.innerHTML,/data-book-open-point=/g),0);
 root.singles['[data-book-status]'].value='all';root.singles['[data-book-status]'].fire('change');root.singles['[data-book-search]'].value='несуществующая тема 742';root.singles['[data-book-search]'].fire('input');assert.match(root.innerHTML,/Пока нет таких поручений/);
});

test('gallery uses nine real medals, exactly five slots and earned/locked/search filters',async()=>{
 const pages=await view('gallery'),ctx=context(),root=rootSurface(),before=JSON.stringify(ctx.data.state);root.innerHTML=pages.renderAchievements(ctx);pages.bindAchievements(root,ctx);
 assert.equal(count(root.innerHTML,/data-achievement-slot=/g),5);assert.equal(count(root.innerHTML,/class="panel achievement-card/g),rules.achievements.length);assert.equal(count(root.innerHTML,/data-achievement-equip=/g),rules.earnedAchievements(ctx.data.state).length);assert.match(root.innerHTML,/<img class="quest-medallion quest-medallion-painted/);
 root.groups['[data-achievement-filter]'][1].onclick();assert.equal(count(root.innerHTML,/class="panel achievement-card/g),rules.earnedAchievements(ctx.data.state).length);
 root.groups['[data-achievement-filter]'][2].onclick();assert.equal(count(root.innerHTML,/data-achievement-equip=/g),0);assert.equal(count(root.innerHTML,/data-achievement-slot=/g),5);
 root.singles['[data-achievement-search]'].value='несуществующая медаль 742';root.singles['[data-achievement-search]'].fire('input');assert.match(root.innerHTML,/Достижения не найдены/);assert.equal(JSON.stringify(ctx.data.state),before);
});
