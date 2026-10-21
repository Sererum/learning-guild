import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGuildServer} from '../server.mjs';
import {learningCourseFixture,adaptationFixtureProvider} from './learning-course-fixture.mjs';

async function harness(work,extra={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-risk-settings-')),course=learningCourseFixture(),stateFile=path.join(directory,'progress.json');
 let server,origin,headers;
 const start=async()=>{server=createGuildServer({course,stateFile,importHistory:false,reviewProvider:'file',learningProvider:'file',learningFixtureProvider:adaptationFixtureProvider,sharedDirectory:path.join(directory,'shared'),...extra});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;const html=await(await fetch(origin)).text();headers={Origin:origin,'Content-Type':'application/json','X-Guild-Token':html.match(/name="guild-token" content="([^"]+)"/)[1]};};
 const stop=()=>new Promise(resolve=>server.close(resolve));
 const get=async route=>{const response=await fetch(origin+route);return{status:response.status,data:await response.json()};};
 const post=async(route,input,customHeaders={})=>{const response=await fetch(origin+route,{method:'POST',headers:{...headers,...customHeaders},body:JSON.stringify(input)});return{status:response.status,data:await response.json()};};
 const settings=async input=>post('/api/settings',input),restart=async()=>{await stop();await start();};
 await start();try{await work({directory,course,get,post,settings,restart,stateFile});}finally{await stop();fs.rmSync(directory,{recursive:true,force:true});}
}

test('Settings API protects writes, accepts learner feedback only and preserves historical conflicts without editing shared course',()=>harness(async({directory,course,get,post,settings,restart})=>{
 const source=JSON.stringify(course),initial=await get('/api/settings');assert.equal(initial.status,200);assert.ok(initial.data.settings.profile);
 assert.equal((await post('/api/settings',{area:'profile',action:'set-review-days',days:30},{Origin:'https://wrong.example'})).status,403);
 assert.equal((await post('/api/settings',{area:'profile',action:'set-review-days',days:30},{'X-Guild-Token':'wrong'})).status,403);
 assert.equal((await settings({area:'profile',action:'update-author',authorId:'learner',name:'Тестовый ученик',role:'learner'})).status,400,'author selection is no longer part of learner feedback');
 assert.equal((await settings({area:'profile',action:'set-review-days',days:37})).data.settings.profile.settings.preferenceReviewDays,37);
 assert.equal((await settings({area:'profile',action:'update-about',about:{interests:'Сады и музыка',goals:'Научиться анализировать данные',background:'Знакомые таблицы',avoid:''}})).status,200);
 const code='answer = value\nprint(answer)';assert.equal((await post('/api/check',{task:'source-1',code})).data.result.ok,true);
 const feedback={task:'source-1',lesson:'source-lesson',code,difficulty:3,hardPart:'statement',hardDetails:'Сначала нужен пример.',hintSource:'none',authorId:'learner'};
 const learner=await post('/api/task-feedback',feedback);assert.equal(learner.status,200);assert.equal(learner.data.result.feedback.author.id,'learner');
 const teacher=await post('/api/task-feedback',{...feedback,authorId:'teacher',author:{id:'teacher',role:'teacher'},edit:true,hardDetails:'Сначала полезнее краткая схема.'});assert.equal(teacher.status,200);assert.equal(teacher.data.result.feedback.author.id,'learner','client cannot impersonate another feedback author');assert.equal(teacher.data.state.taskFeedbackHistory['source-1'][0].author.id,'learner');
 const at=new Date().toISOString(),profile={schemaVersion:1,version:1,observations:[{id:'learner-source',kind:'task',taskId:'source-1',text:'Сначала нужен пример.',savedAt:at,author:{id:'learner',name:'Тестовый ученик',role:'learner'}},{id:'teacher-source',kind:'task',taskId:'source-2',text:'Сначала полезнее краткая схема.',savedAt:at,author:{id:'teacher',name:'Преподаватель',role:'teacher'}}],rules:[{id:'example-first',text:'Сначала понятный пример',status:'superseded',supersededBy:'scheme-first',source:'explicit-feedback',evidenceIds:['learner-source']},{id:'scheme-first',text:'Сначала краткая схема',status:'active',source:'explicit-feedback',evidenceIds:['teacher-source']}],history:[],sharedProposals:[]};
 fs.writeFileSync(path.join(directory,'personalization.json'),JSON.stringify(profile));let view=(await get('/api/settings')).data.settings.profile;assert.equal(view.personalization.conflicts.length,1);assert.deepEqual(view.personalization.preferences.map(rule=>rule.status),['review-needed','review-needed']);
 const chosen=await settings({area:'profile',action:'resolve-conflict',conflictId:view.personalization.conflicts[0].id,selectedRuleId:'example-first'});assert.equal(chosen.status,200);view=chosen.data.settings.profile;assert.deepEqual(view.personalization.preferences.map(rule=>rule.status),['active','disabled']);
 assert.equal((await settings({area:'profile',action:'edit-rule',ruleId:'example-first',text:'Показывать вход и понятный результат',confirm:true})).status,200);
 assert.equal((await settings({area:'profile',action:'disable-rule',ruleId:'example-first'})).status,200);await restart();view=(await get('/api/settings')).data.settings.profile;
 assert.equal(view.personalization.preferences[0].status,'disabled');assert.equal(view.personalization.preferences[0].text,'Показывать вход и понятный результат');assert.ok(view.settings.history.length>=4);assert.equal(JSON.stringify(course),source);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'personalization.json'))),profile,'manual decisions remain reversible overlays');
}));

test('Zero shared AI budget blocks tutor and lesson generation before starting a provider',()=>harness(async({directory,get,post,settings})=>{
 const updated=await settings({area:'generation',action:'set-limits',dailyCalls:0,dailyTokens:0,autoResume:false,retentionDays:14});assert.equal(updated.status,200);assert.equal(updated.data.settings.generation.settings.dailyCalls,0);
 const code='answer = value\nprint(answer)';assert.equal((await post('/api/check',{task:'source-1',code})).data.result.ok,true);
 const tutor=await post('/api/ai-review',{task:'source-1',code,answer:'Проверь качество кода.'});assert.equal(tutor.status,400);assert.match(tutor.data.error,/лимит|резерв/);
 const submit=await post('/api/lesson-submit',{lessonId:'source-lesson',feedback:{clarity:'clear',comment:'Техническая проверка бюджета.'}});assert.equal(submit.status,200);
 let job;for(let i=0;i<100;i++){job=(await get('/api/learning-job?id='+submit.data.result.job.id)).data.result.job;if(!['pending','running'].includes(job.status))break;await new Promise(resolve=>setTimeout(resolve,20));}
 assert.equal(job.status,'failed');assert.match(job.error,/лимит|резерв/);assert.equal((await get('/api/settings')).data.settings.generation.usage.calls,0);assert.equal(fs.existsSync(path.join(directory,'provider-started')),false);
},{reviewProvider:'codex',learningProvider:'codex',reviewExecutable:'/private/tmp/no-guild-risk-provider',learningExecutable:'/private/tmp/no-guild-risk-provider'}));

test('Changed course content exposes old solutions, requires fresh checks and never repeats lesson currency',()=>harness(async({course,get,post,restart})=>{
 const code='answer = value\nprint(answer)',checked=await post('/api/check',{task:'source-1',code});assert.equal(checked.data.result.ok,true);const before=checked.data.state.currency,oldVersion=checked.data.contentVersions.taskVersions['source-1'];
 const pending=await post('/api/ai-review',{task:'source-1',code});assert.equal(pending.status,200);
 course.tasks[0].description='Сохрани удвоенный value в answer и выведи результат.';for(const scenario of course.tasks[0].tests)scenario.expected.answer=scenario.inputs.value*2;
 await restart();const after=(await get('/api/state')).data;assert.notEqual(after.contentVersions.taskVersions['source-1'],oldVersion);assert.equal(after.state.currency,before);assert.equal(after.state.claims['source-1'],undefined);assert.equal(after.contentVersions.changed.find(item=>item.taskId==='source-1').needsRecheck,true);
 const archive=await get('/api/content-archive?task=source-1');assert.equal(archive.status,200);assert.match(JSON.stringify(archive.data),/answer = value/);
 const stale=await post('/api/ai-review',{task:'source-1',code});assert.equal(stale.status,400);assert.match(stale.data.error,/тест|верси/);
 assert.equal((await post('/api/check',{task:'source-1',code})).data.result.ok,false);const fresh=await post('/api/check',{task:'source-1',code:'answer = value * 2\nprint(answer)'});assert.equal(fresh.data.result.ok,true);assert.equal(fresh.data.state.currency,before);assert.equal(fresh.data.contentVersions.changed.find(item=>item.taskId==='source-1').needsRecheck,false);
}));
