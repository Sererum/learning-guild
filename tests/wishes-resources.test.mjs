import test from 'node:test';
import assert from 'node:assert/strict';
import {syntheticCourse} from './course-profile-fixture.mjs';
import {createEngine} from '../shared/engine-core.mjs';
import {renderWishes,bindWishes} from '../public/pages/wishes.js';
import {renderResourceGuide} from '../public/pages/resource-guide.js';
import {itemArt} from '../public/pages/item-art.js';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function context(){const course=syntheticCourse(),rules=createEngine(course),state=rules.initialState();return {rules,esc,data:{course:{recurringTasks:course.engineConfig.recurringTasks},state,gameRules:course.engineConfig,catalog:rules.catalog,banners:rules.banners,courseMap:rules.courseMap,lessons:course.lessons,tasks:Object.values(course.tasks).map(t=>({...t})),presentation:course.presentation,repairPoints:course.repairPoints,day:'2026-10-19'},navigate(){},openLesson(){}};}

test('Weapon wish has both guarantee tiers, distinct five-star art and advances without duplicates',()=>{
 const ctx=context(),{rules}=ctx,s=ctx.data.state;s.currency=16000;
 assert.ok(rules.banners.some(b=>b.id==='weapon'));
 const target=rules.activeBanner(s,'weapon');assert.equal(target.rarity,5);assert.equal(target.kind,'weapon');
 for(let i=1;i<20;i++)assert.equal(rules.wish(s,'weapon',()=>.99).rarity,i%5===0?4:3);
 assert.equal(rules.wish(s,'weapon',()=>.99).id,target.id);
 const next=rules.activeBanner(s,'weapon');assert.notEqual(next.id,target.id);
 assert.equal(rules.wish(s,'weapon',()=>0).id,next.id);assert.equal(rules.activeBanner(s,'weapon'),null);
 for(const item of [target,next])assert.match(itemArt(item),/item-(moonblade|dawn-staff)-v1\.png/);
 assert.notEqual(itemArt(target),itemArt(next));
 assert.equal(s.equipped.weapon,'quill','wishing preserves equipped weapon until explicit equip');
});

test('Weapon banner tab opens complete copy, amounts and resource help',()=>{
 const ctx=context();let html=renderWishes(ctx);assert.match(html,/data-stellar-banner="weapon"/);
 const controls=ctx.data.banners.map(b=>({dataset:{stellarBanner:b.id}}));
 const page={outerHTML:''};let redraws=0;
 const root={querySelectorAll(selector){return selector==='[data-stellar-banner]'?controls:[];},querySelector(selector){if(selector==='.stellar-page'){redraws++;return page;}return null;}};
 bindWishes(root,ctx);controls.find(b=>b.dataset.stellarBanner==='weapon').onclick();html=page.outerHTML;
 assert.ok(redraws);assert.match(html,/Арсенал созвездий/);assert.match(html,/Клинок лунного архива/);assert.match(html,/мечи, палочки и посохи/i);assert.match(html,/data-resource-guide/);assert.doesNotMatch(html,/undefined|NaN/);
 assert.match(html,/до гарантированной 5★/);assert.match(html,/до находки 4★ или выше/);
});

test('Resource guide derives amounts from course rules and distinguishes task supplies and lesson gems',()=>{
 const ctx=context(),html=renderResourceGuide(ctx);assert.match(html,/Мора: <b>\+400/);assert.match(html,/Книги опыта: <b>\+1/);assert.match(html,/Мора: <b>\+1200/);
 assert.match(html,/Материалы приходят за каждую задачу/);assert.match(html,/Примогемы за урок — после всех/);assert.match(html,/300 моры, 1 кристалл ясности и 2 лепестка/);assert.match(html,/каждой работы над ошибками/);assert.match(html,/Кристалл ясности для возвышения — отдельный ресурс/);assert.match(html,/data-resource-lesson=/);assert.doesNotMatch(html,/undefined|NaN/);
 ctx.data.gameRules=structuredClone(ctx.data.gameRules);ctx.data.gameRules.resourceRewards.task.gold=777;assert.match(renderResourceGuide(ctx),/Мора: <b>\+777/);
});

test('Resource guide connects earned supplies to spending without making AI review compulsory',()=>{
 const ctx=context(),before=JSON.stringify(ctx.data.state),html=renderResourceGuide(ctx);
 assert.match(html,/href="#hero" data-resource-page="hero"/);
 assert.match(html,/href="#wishes" data-resource-page="wishes"/);
 assert.match(html,/Ошибки и подсказки не уменьшают награду/);
 assert.match(html,/Ревью ИИ необязательно/);
 assert.match(html,/уже полученный бонус сохраняется/);
 assert.equal(JSON.stringify(ctx.data.state),before);
});
