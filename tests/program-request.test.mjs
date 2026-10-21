import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLearningService} from '../adaptation/service.mjs';
import {createProfileGovernance} from '../profile-governance.mjs';
import {sourceCourse,adaptationFixtureProvider} from './adaptation-fixtures.mjs';
import {findPython312} from '../local-config.mjs';
const python=findPython312(process.env.GUILD_PYTHON);
function setup(t,{providerHook}={}){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-program-')),course=sourceCourse(),state={currency:0,gold:0,books:0,claims:{},testProofs:{},taskFeedback:{},courseCredits:{previous:true}},calls=[];const governance=createProfileGovernance({directory,courseId:course.id,profileId:'synthetic'});const service=createLearningService({directory,course,readState:()=>state,python,provider:'file',governance,fixtureProvider:async input=>{calls.push(input);return await providerHook?.(input)??adaptationFixtureProvider(input);}});t.after(async()=>{service.close();await service.whenIdle();fs.rmSync(directory,{recursive:true,force:true});});return {directory,course,state,governance,service,calls};}

test('Voluntary program request before any test: consent then independently checked optional practice, preserving source and resources',async t=>{
 const f=setup(t),before=JSON.stringify(f.state),source=JSON.stringify(f.course);const request={lessonId:'source-lesson',kind:'reinforcement',message:'Это слишком сложно. Хочу сначала простой пример на маленьких числах.',requestId:'synthetic-request',author:f.governance.resolveLearner()};
 let job=await f.service.requestProgram(request);await f.service.whenIdle();job=f.service.getStatus(job.id);assert.equal(job.status,'awaiting-consent',job.error);assert.deepEqual(f.calls.map(call=>call.stage),['personalize']);assert.equal(f.service.loadOverlay().lessons.length,0);assert.equal(f.governance.snapshot().personalization.preferences.length,0);
 await f.service.manage({action:'confirm-personalization',jobId:job.id,acceptedIds:[]});await f.service.whenIdle();job=f.service.getStatus(job.id);assert.equal(job.status,'ready',job.error);assert.equal(job.effort,'xhigh');assert.deepEqual(job.branches.map(item=>item.kind),['reinforcement']);assert.deepEqual(f.calls.map(call=>call.stage),['personalize','generate','review']);assert.match(f.calls[1].prompt,/ТОЛЬКО отдельную более простую практику/);assert.ok(f.calls[1].prompt.includes(request.message));
 const overlay=f.service.loadOverlay();assert.equal(overlay.lessons.length,1);assert.equal(overlay.tasks.length,3);assert.equal(overlay.points[0].topic,'source-point');assert.equal(overlay.pointPrerequisites[overlay.points[0].id],null);assert.equal(overlay.lessons[0].sourceLessonId,'source-lesson');assert.equal(JSON.stringify(f.course),source);assert.equal(JSON.stringify(f.state),before);assert.equal(f.governance.snapshot().personalization.preferences.length,0);
 const duplicate=await f.service.requestProgram(request);assert.equal(duplicate.id,job.id);assert.equal(f.calls.length,3);await assert.rejects(f.service.requestProgram({...request,message:'Другое сообщение'}),/номер запроса/);
});

test('Program request validates lesson, bounded text and branch before invoking Codex',async t=>{
 const f=setup(t);for(const input of [{lessonId:'missing',message:'Пример'},{lessonId:'source-lesson',message:' '},{lessonId:'source-lesson',message:'x'.repeat(3001)},{lessonId:'source-lesson',message:'Пример',kind:'next'}])await assert.rejects(f.service.requestProgram(input));assert.equal(f.calls.length,0);assert.equal(f.service.snapshot().jobs.length,0);
});

test('Reviewer rejection blocks publication and keeps private request retryable',async t=>{
 const f=setup(t,{providerHook:async input=>input.stage==='personalize'?{summary:'Без изменений',preferences:[],sharedProposals:[]}:input.stage==='review'?{approved:false,summary:'Нужны ясные примеры',issues:['Не подходит уровень'],taskAudits:[]}:undefined});const before=JSON.stringify(f.state),job=await f.service.requestProgram({lessonId:'source-lesson',message:'Хочу короткую практику',kind:'repair'});await f.service.whenIdle();const stopped=f.service.getStatus(job.id);assert.equal(stopped.status,'failed');assert.equal(stopped.canResume,true);assert.match(stopped.error,/рецензент/i);assert.equal(f.service.loadOverlay().lessons.length,0);assert.equal(JSON.stringify(f.state),before);
});

 test('Independent program messages remain active sources and do not silently replace earlier feedback',async t=>{
 const f=setup(t,{providerHook:async input=>input.stage==='personalize'?{summary:'Без новых правил',preferences:[],sharedProposals:[]}:undefined});
 for(const message of ['Хочу сначала совсем маленький пример','Хочу отдельную практику с отрицательными числами']){const job=await f.service.requestProgram({lessonId:'source-lesson',message,kind:'repair'});await f.service.whenIdle();assert.equal(f.service.getStatus(job.id).status,'ready');}
 const sources=f.governance.snapshot().personalization.observations.filter(item=>item.kind==='program');assert.equal(sources.length,2);assert.ok(sources.every(item=>item.status==='active'));assert.equal(f.service.loadOverlay().lessons.length,2);
});

test('Program API keeps loopback session protection and accepts an untested lesson without changing its rewards',async t=>{
 const {createGuildServer}=await import('../server.mjs'),{default:course}=await import('../courses/alice-python/index.mjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-program-api-')),stateFile=path.join(directory,'progress.json');
 const server=createGuildServer({course,stateFile,profileId:'program-api',python,importHistory:false,reviewProvider:'off',learningProvider:'file',learningFixtureProvider:async({stage,job})=>{assert.equal(stage,'personalize');return {summary:'Предложение ученику',preferences:[{category:'examples',rule:'Объяснять на маленьких примерах.',evidenceIds:[job.evidence.feedback[0].id],supersedesIds:[]}],sharedProposals:[]};}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});});
 const origin='http://127.0.0.1:'+server.address().port,html=await(await fetch(origin)).text(),token=html.match(/name="guild-token" content="([^"]+)"/)[1],headers={'Content-Type':'application/json','X-Guild-Token':token,Origin:origin};
 const before=await(await fetch(origin+'/api/state')).json(),lessonId=before.activeLesson.id,body=JSON.stringify({scope:course.id+':program-api',lessonId,message:'Хочу более простую версию',kind:'reinforcement',author:{id:'forged',role:'owner'}});
 const blocked=await fetch(origin+'/api/program-request',{method:'POST',headers:{...headers,Origin:'https://example.com'},body});assert.equal(blocked.status,403);
 for(const scope of [undefined,course.id+':another-profile']){const foreign=await fetch(origin+'/api/program-request',{method:'POST',headers,body:JSON.stringify({...JSON.parse(body),scope})});assert.equal(foreign.status,400);assert.equal((await(await fetch(origin+'/api/state')).json()).learning.jobs.length,0);}
 const response=await fetch(origin+'/api/program-request',{method:'POST',headers,body}),payload=await response.json();assert.equal(response.status,200,JSON.stringify(payload));assert.equal(payload.result.job.programRequest.kind,'reinforcement');
 let after;for(let i=0;i<50;i++){after=await(await fetch(origin+'/api/state')).json();if(after.learning.jobs[0]?.status==='awaiting-consent')break;await new Promise(resolve=>setTimeout(resolve,10));}
 assert.equal(after.learning.jobs[0].status,'awaiting-consent');assert.equal(after.state.currency,before.state.currency);assert.deepEqual(after.state.claims,before.state.claims);assert.deepEqual(after.lessons,before.lessons);assert.equal(after.settings.profile.personalization.observations[0].author.role,'learner');
});

test('Approved diagnostic target follows author and independent reviewer, with zero base and quality gems',async t=>{
 const f=setup(t,{providerHook:async input=>input.stage==='personalize'?{summary:'Без изменений',preferences:[],sharedProposals:[]}:undefined});
 const target={id:'diagnostic-source',title:'Проверка исходной темы',kind:'exam',runtime:'basic-python',diagnostic:true,learningGoals:['Самостоятельно посчитать сумму'],prerequisites:[]};
 const job=await f.service.requestProgram({lessonId:'source-lesson',message:'Проверить знания без пропуска проверки',kind:'reinforcement',curriculumTarget:target});await f.service.whenIdle();const result=f.service.getStatus(job.id);assert.equal(result.status,'ready',result.error);assert.deepEqual(f.calls.map(x=>x.stage),['personalize','generate','review']);assert.match(f.calls[1].prompt,/диагностический экзамен/);assert.match(f.calls[1].prompt,/Самостоятельно посчитать сумму/);const overlay=f.service.loadOverlay();assert.equal(overlay.lessons[0].reward,0);assert.equal(overlay.lessons[0].type,'exam');assert.equal(overlay.tasks[0].qualityCap,0);assert.equal(overlay.lessons[0].adaptiveTopicId,target.id);assert.equal(f.state.currency,0);assert.deepEqual(f.state.claims,{});
});
