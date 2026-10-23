import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLocalCourseStore,courseAvatars,writeLocalJson} from '../local-courses.mjs';
import {createAccountServer} from '../account-server.mjs';
import {renderSettings,bindSettings} from '../public/pages/settings.js';
const spec=(id,extra={})=>({id,title:'Исходный курс',learnerName:'Ученик',goal:'Подробная итоговая цель обучения.',contentMode:'blank',preferencesMode:'new',...extra});
const update=(extra={})=>({title:'Новое название',description:'Короткое описание',avatar:courseAvatars[1].url,expectedMetadataRevision:0,...extra});
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'guild-metadata-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,store:createLocalCourseStore({root})};}

test('metadata writes only the selected manifest atomically, preserves goals, progress, preferences and unknown fields',t=>{
 const {root,store}=fixture(t),first=store.create(spec('first')),second=store.create(spec('second',{preferencesMode:'shared',preferencesSourceId:'first'}));
 const directory=store.load('first').directory,file=path.join(directory,'manifest.json');writeLocalJson(file,{...first,extension:{keep:true}});
 writeLocalJson(path.join(directory,'profile','progress.json'),{version:1,currency:321,claims:{example:true}});
 store.preferences(first.learningProfileId).write({about:{goals:'Личная цель'},rules:[]},{expectedRevision:0});
 const untouched=[path.join(directory,'program.json'),path.join(directory,'content.json'),path.join(directory,'profile','progress.json'),path.join(root,'local-learning-profiles',first.learningProfileId,'preferences.json'),path.join(store.coursesRoot,'second','manifest.json')];
 const before=untouched.map(file=>fs.readFileSync(file,'utf8')),next=store.updateMetadata('first',update());
 assert.equal(next.title,'Новое название');assert.equal(next.description,'Короткое описание');assert.equal(next.avatar,courseAvatars[1].url);assert.equal(next.metadataRevision,1);assert.equal(next.goal,first.goal);assert.deepEqual(next.extension,{keep:true});assert.equal(next.learningProfileId,second.learningProfileId);
 assert.deepEqual(untouched.map(file=>fs.readFileSync(file,'utf8')),before);
 assert.equal(store.load('first').course.manifest.title,next.title);assert.equal(store.load('first').course.program.title,next.title);assert.equal(store.load('first').course.program.finish,first.goal);
 assert.ok(!fs.readdirSync(directory).some(name=>name.endsWith('.tmp')||name.endsWith('.lock')));
 assert.equal(createLocalCourseStore({root}).manifest('first').description,next.description);
});

test('metadata rejects stale edits, unexpected fields, long text and arbitrary image paths without writes',t=>{
 const {store}=fixture(t);store.create(spec('first'));const file=path.join(store.coursesRoot,'first','manifest.json'),before=fs.readFileSync(file,'utf8');
 for(const invalid of [update({title:''}),update({title:'a'.repeat(181)}),update({title:'line\nbreak'}),update({description:'a'.repeat(241)}),update({description:'line\nbreak'}),update({description:{}}),update({avatar:'/assets/private.png'}),update({avatar:'/assets/../private.png'}),update({avatar:'https://example.com/avatar.png'}),update({avatar:'/assets/nav-book-painted-v1.png?account=second'}),update({goal:'Changed'}),update({expectedMetadataRevision:1}),update({expectedMetadataRevision:undefined})]){
  assert.throws(()=>store.updateMetadata('first',invalid));assert.equal(fs.readFileSync(file,'utf8'),before);
 }
 store.updateMetadata('first',update());assert.throws(()=>store.updateMetadata('first',update()),/изменились/);
 for(const choice of courseAvatars)assert.ok(fs.existsSync(new URL('../public'+choice.url,import.meta.url)));
});

test('HTTP metadata has separate CSRF action and immediately updates an already open course',async t=>{
 const {root,store}=fixture(t),first=store.create(spec('first'));store.create(spec('second',{preferencesMode:'shared',preferencesSourceId:'first'}));
 const server=createAccountServer({root,python:process.env.GUILD_PYTHON||'python3.12',reviewProvider:'off',learningProvider:'off'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port,get=async url=>(await fetch(base+url)).json();
 const before=await get('/api/state?account=first'),otherBefore=await get('/api/state?account=second'),listing=await get('/api/accounts');
 const post=async(headers={},extra={})=>{const response=await fetch(base+'/api/accounts',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({action:'update-metadata',id:'first',...update(),...extra})});return {status:response.status,body:await response.json()};};
 assert.equal((await post()).status,403);assert.equal((await post({'X-Guild-Token':listing.token,Origin:'https://example.com'})).status,403);assert.equal(store.manifest('first').title,first.title);
 const saved=await post({'X-Guild-Token':listing.token,Origin:base});assert.equal(saved.status,200);
 const after=await get('/api/state?account=first'),otherAfter=await get('/api/state?account=second');
 assert.equal(after.course.title,update().title);assert.equal(after.program.title,update().title);assert.equal(after.course.description,update().description);assert.equal(after.course.avatar,update().avatar);assert.equal(after.account.title,update().title);assert.equal(after.account.metadataRevision,1);
 assert.equal(after.program.finish,before.program.finish);assert.deepEqual(after.state,before.state);assert.deepEqual(after.settings.profile,before.settings.profile);assert.equal(otherAfter.course.title,otherBefore.course.title);assert.deepEqual(otherAfter.state,otherBefore.state);assert.equal(otherAfter.account.avatar,otherBefore.account.avatar);
 assert.equal((await get('/api/settings?account=first')).course.title,update().title);assert.equal((await post({'X-Guild-Token':listing.token,Origin:base})).status,400);
});

test('course settings expose bounded separate fields and fixed avatar choices with escaped text',()=>{
 const data={course:{title:'Курс'},account:{id:'synthetic',...update(),metadataRevision:0,avatarChoices:courseAvatars},settings:{profile:{settings:{},personalization:{}},generation:{},shared:{},versions:{},execution:{}}};data.account.title='<script>bad()</script>';
 const button={dataset:{settingsTab:'course'}},root={querySelector:()=>null,querySelectorAll:selector=>selector==='[data-settings-tab]'?[button]:[]};bindSettings(root,{data,refresh:()=>{}});button.onclick();
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const html=renderSettings({data,esc});
 assert.match(html,/data-settings-form="course"/);assert.match(html,/name="title"[^>]*maxlength="180"/);assert.match(html,/name="description"[^>]*maxlength="240"/);assert.equal((html.match(/type="radio" name="avatar"/g)||[]).length,courseAvatars.length);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|name="goal"|name="goals"/);assert.match(html,/только к этому курсу/);
});
