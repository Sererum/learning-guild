import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLocalCourseStore,writeLocalJson} from '../local-courses.mjs';
import {createAccountServer} from '../account-server.mjs';
import {migrateLocalCourse} from '../tools/migrate-local-courses.mjs';
import {createEngine} from '../shared/engine-core.mjs';
import starter from '../templates/starter-python/index.mjs';
const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'guild-accounts-test-'));
const spec=(id,extra={})=>({id,title:'Курс '+id,learnerName:'Ученик',goal:'Самостоятельно решить итоговую задачу.',contentMode:'blank',preferencesMode:'new',...extra});

test('local accounts: blank, independent content copy, preferences-only sharing and detach',()=>{
 const root=temporary();try{const store=createLocalCourseStore({root});const a=store.create(spec('first'));const entry=store.load(a.id);const content=structuredClone(starter);content.id=a.id;content.manifest.id=a.id;writeLocalJson(path.join(entry.directory,'content.json'),content);
 writeLocalJson(path.join(entry.directory,'profile','progress.json'),{version:1,currency:999,claims:{'starter-total':true}});
 const prefs=store.preferences(a.learningProfileId);prefs.write({about:{interests:'Музыка'},aiEfforts:{},rules:[]},{expectedRevision:0});
 const b=store.create(spec('second',{contentMode:'copy',contentSourceId:a.id,preferencesMode:'shared',preferencesSourceId:a.id}));const c=store.create(spec('third',{preferencesMode:'copy',preferencesSourceId:a.id}));
 assert.equal(store.load(b.id).course.tasks.length,1);assert.equal(store.load(c.id).course.tasks.length,0);assert.equal(b.learningProfileId,a.learningProfileId);assert.notEqual(c.learningProfileId,a.learningProfileId);
 assert.equal(fs.existsSync(store.load(b.id).stateFile),false);assert.equal(store.load(b.id).course.engineConfig.initialState.currency,0);
 prefs.write({about:{interests:'Кино'},rules:[]},{expectedRevision:1});assert.equal(store.preferences(c.learningProfileId).read().value.about.interests,'Музыка');assert.equal(store.preferences(b.learningProfileId).read().value.about.interests,'Кино');
 const detached=store.detach(b.id,{expectedRevision:2,expectedProfileId:a.learningProfileId});prefs.write({about:{interests:'Кофе'}},{expectedRevision:2});assert.equal(store.preferences(detached.learningProfileId).read().value.about.interests,'Кино');
 assert.throws(()=>store.create(spec('first')),/существует/);assert.throws(()=>prefs.write({}, {expectedRevision:0}),/изменился/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('invalid manifest and symlink profiles cannot route into another account',()=>{const root=temporary();try{const store=createLocalCourseStore({root}),a=store.create(spec('first'));const file=path.join(store.coursesRoot,a.id,'manifest.json');writeLocalJson(file,{...a,id:'second'});assert.throws(()=>store.load(a.id),/не совпадает/);writeLocalJson(file,a);fs.symlinkSync(os.tmpdir(),path.join(store.coursesRoot,a.id,'profile'));assert.throws(()=>store.load(a.id),/ссылкой/);assert.equal(store.list().accounts.length,1);}finally{fs.rmSync(root,{recursive:true,force:true});}});

test('two HTTP accounts preserve tokens, progress, drafts and sharing consent across tabs',async()=>{
 const root=temporary(),store=createLocalCourseStore({root});const a=store.create(spec('first'));const b=store.create(spec('second',{preferencesMode:'shared',preferencesSourceId:a.id}));const server=createAccountServer({root,python:process.env.GUILD_PYTHON||'python3.12',reviewProvider:'off',learningProvider:'off'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const get=async(p)=>{const r=await fetch(base+p);return r.json();};const token=async(id)=>(await(await fetch(base+'/?account='+id)).text()).match(/name="guild-token" content="([^"]+)"/)[1];
 try{const ta=await token(a.id),tb=await token(b.id);assert.notEqual(ta,tb);const post=async(id,t,url,body)=>{const r=await fetch(base+url+'?account='+id,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Guild-Token':t},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const initial=await get('/api/state?account=first');assert.equal(initial.course.storageScope,'first:default');assert.equal(initial.tasks.length,0);assert.equal(initial.state.currency,0);
 let r=await post(a.id,ta,'/api/settings',{area:'profile',action:'update-about',about:{interests:'Музыка'},sharedProfileId:a.learningProfileId,sharedRevision:0});assert.equal(r.status,400);assert.match(r.data.error,/Подтвердите/);
 r=await post(a.id,ta,'/api/settings',{area:'profile',action:'update-about',about:{interests:'Музыка'},sharedProfileId:a.learningProfileId,sharedRevision:0,confirmShared:true,sharedCourseIds:['first','second']});assert.equal(r.status,200);
 const second=await get('/api/state?account=second');assert.equal(second.settings.profile.about.interests,'Музыка');assert.equal(second.state.currency,0);
 r=await post(b.id,ta,'/api/settings',{area:'profile',action:'update-about',about:{interests:'Ошибка'}});assert.equal(r.status,403);
 r=await post(b.id,tb,'/api/settings',{area:'profile',action:'update-about',about:{interests:'Устарело'},sharedProfileId:a.learningProfileId,sharedRevision:0,confirmShared:true,sharedCourseIds:['first','second']});assert.equal(r.status,400);
 const video=await fetch(base+'/assets/wish-anime-3star-v5.mp4',{headers:{Range:'bytes=0-31'}});assert.equal(video.status,206);assert.equal((await video.arrayBuffer()).byteLength,32);
 const listing=await get('/api/accounts');assert.equal(listing.accounts.length,2);assert.equal((await fetch(base+'/local-courses/first/profile/settings.json')).status,404);assert.equal((await fetch(base+'/api/state')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});

test('migration copies the full legacy profile byte-for-byte and never overwrites source',async()=>{
 const root=temporary();try{const source=path.resolve('templates/starter-python'),profile=path.join(root,'old-profile');fs.mkdirSync(profile);const state=createEngine(starter).initialState();state.currency=123;state.futureUnknownField={preserve:true};writeLocalJson(path.join(profile,'progress.json'),state);writeLocalJson(path.join(profile,'profile.json'),{version:1,courseId:starter.id,profileId:'original'});writeLocalJson(path.join(profile,'extra.json'),{feedback:'keep'});const original=fs.readFileSync(path.join(profile,'progress.json'));
 const args={root,sourceCourse:source,stateFile:path.join(profile,'progress.json'),account:starter.id};assert.equal((await migrateLocalCourse(args)).applied,false);const result=await migrateLocalCourse({...args,apply:true});assert.equal(result.preservedProgress,true);assert.deepEqual(fs.readFileSync(path.join(result.destination,'profile','progress.json')),original);assert.deepEqual(fs.readFileSync(path.join(profile,'progress.json')),original);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(result.destination,'profile','extra.json'))),{feedback:'keep'});await assert.rejects(migrateLocalCourse({...args,apply:true}),/существует/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('local course loader uses the selected directory and fails closed for an incomplete package',async()=>{
 const root=temporary();try{
  const store=createLocalCourseStore({root}),a=store.create(spec('first')),b=store.create(spec('second'));
  const directory=path.join(store.coursesRoot,a.id),file=path.join(directory,'manifest.json');
  const {loadCourse}=await import('../course-loader.mjs');
  writeLocalJson(file,{...a,id:b.id});
  await assert.rejects(loadCourse({courseDir:directory}),/не совпадает/);
  writeLocalJson(file,a);
  // Explicit folders can be outside the conventional local-courses parent.
  const standalone=path.join(root,'first');fs.cpSync(directory,standalone,{recursive:true});
  assert.equal((await loadCourse({courseDir:standalone})).manifest.title,a.title);
  fs.unlinkSync(path.join(directory,'content.json'));
  writeLocalJson(path.join(directory,'course.json'),{entry:'fallback.mjs',id:a.id});
  fs.writeFileSync(path.join(directory,'fallback.mjs'),"throw Error('Legacy fallback must not run');");
  await assert.rejects(loadCourse({courseDir:directory}),error=>error.code==='ENOENT'&&error.path.endsWith('content.json'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('detach rejects stale profile identities even when profile revisions match',()=>{
 const root=temporary();try{
  const store=createLocalCourseStore({root}),a=store.create(spec('first')),b=store.create(spec('second',{preferencesMode:'shared',preferencesSourceId:a.id}));
  const detached=store.detach(b.id,{expectedRevision:0,expectedProfileId:a.learningProfileId});
  assert.throws(()=>store.detach(b.id,{expectedRevision:0,expectedProfileId:a.learningProfileId}),/изменился/);
  assert.equal(store.manifest(b.id).learningProfileId,detached.learningProfileId);
  assert.equal(store.manifest(a.id).learningProfileId,a.learningProfileId);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('course copies validate topology before writing and sanitize preference-only copies',()=>{
 const root=temporary();try{
  const store=createLocalCourseStore({root}),a=store.create(spec('first'));
  const course=store.load(a.id).course;course.adaptation.roadmap=[{id:'topic',prerequisites:['missing']}];
  assert.throws(()=>store.create(spec('invalid',{contentMode:'copy',contentSourceId:a.id,effectiveCourse:course})),/зависимость/);
  assert.equal(fs.existsSync(path.join(store.coursesRoot,'invalid')),false);
  const preferenceFile=path.join(store.preferencesRoot,a.learningProfileId,'preferences.json');
  writeLocalJson(preferenceFile,{schemaVersion:1,revision:0,value:{about:{interests:'Музыка'},progress:{currency:123},observations:['private evidence'],rules:[]}});
  const b=store.create(spec('second',{preferencesMode:'copy',preferencesSourceId:a.id}));
  const value=store.preferences(b.learningProfileId).read().value;
  assert.equal(value.about.interests,'Музыка');assert.equal('progress' in value,false);assert.equal('observations' in value,false);
  writeLocalJson(preferenceFile,{schemaVersion:1,revision:-1,value:{}});
  assert.throws(()=>store.preferences(a.learningProfileId).read(),/Повреждён/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('copy keeps optional branches, runtime requirements and exclusions without carrying completion',async()=>{
 const root=temporary();let sourceServer,copyServer;try{
  const {createGuildServer}=await import('../server.mjs');
  const store=createLocalCourseStore({root}),a=store.create(spec('first')),entry=store.load(a.id),course=entry.course;
  course.adaptation.roadmap=[{id:'core',title:'Основа',kind:'lesson',main:true,prerequisites:[],learningGoals:['Понять основу']},{id:'optional',title:'Другой предмет',kind:'lesson',main:false,parentId:'core',blockId:'extra',runtime:'different-runtime',requiresRuntime:true,prerequisites:['core'],learningGoals:['Освоить пример']},{id:'excluded',title:'Отложено',kind:'lesson',main:false,prerequisites:[],learningGoals:[]}];
  course.program={...course.program,blocks:[{id:'core-block',title:'Основа',nodeIds:['core']},{id:'extra',title:'Дополнение',nodeIds:['optional','excluded']}],excluded:['excluded']};
  sourceServer=createGuildServer({course,stateFile:entry.stateFile,profileId:entry.profileId,reviewProvider:'off',learningProvider:'off'});
  const exported=sourceServer.guildCourse();
  assert.equal(exported.adaptation.roadmap.length,3);assert.equal(exported.adaptation.roadmap.find(n=>n.id==='optional').main,false);
  assert.equal(exported.adaptation.roadmap.find(n=>n.id==='optional').requiresRuntime,true);
  assert.deepEqual(exported.program.excluded,['excluded']);assert.equal('completed' in exported.adaptation.roadmap[0],false);
  const b=store.create(spec('second',{title:'Отдельный курс',contentMode:'copy',contentSourceId:a.id,effectiveCourse:exported})),copied=store.load(b.id);
  copyServer=createGuildServer({course:copied.course,stateFile:copied.stateFile,profileId:copied.profileId,reviewProvider:'off',learningProvider:'off'});
  const view=copyServer.guildSnapshot().program;
  assert.equal(view.title,'Отдельный курс');assert.equal(view.progress.done,0);assert.equal(view.progress.total,1);
  assert.equal(view.nodes.find(n=>n.id==='optional').parentId,'core');assert.equal(view.nodes.find(n=>n.id==='optional').main,false);
  assert.equal(view.nodes.find(n=>n.id==='excluded').excluded,true);
 }finally{sourceServer?.guildClose();copyServer?.guildClose();fs.rmSync(root,{recursive:true,force:true});}
});

test('copied presentation keeps lesson mappings but not historical completion or availability',()=>{
 const root=temporary();try{
  const store=createLocalCourseStore({root}),a=store.create(spec('first')),course=structuredClone(starter);
  course.presentation={currentLessonId:'starter-lesson',visibleRegionIds:[],previous:{'starter-point':[]},points:{'starter-point':{lessonId:'starter-lesson',number:'1',prerequisites:[],available:false,legacyRewardField:'legacyPaid'}},roadmap:{'starter-point':{phase:'mastered',note:'Personal assessment'}}};
  const b=store.create(spec('second',{contentMode:'copy',contentSourceId:a.id,effectiveCourse:course}));
  const copied=store.load(b.id).course;
  assert.equal(copied.presentation.points['starter-point'].lessonId,'starter-lesson');
  assert.deepEqual(copied.presentation.previous,{'starter-point':[]});
  assert.equal(copied.presentation.roadmap['starter-point'].phase,undefined);
  assert.equal(copied.presentation.roadmap['starter-point'].note,undefined);
  assert.equal(copied.presentation.points['starter-point'].available,undefined);
  assert.equal(copied.presentation.currentLessonId,undefined);assert.equal(copied.presentation.visibleRegionIds,undefined);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
