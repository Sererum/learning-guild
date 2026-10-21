import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createLearningService} from '../adaptation/service.mjs';
import {createProfileGovernance} from '../profile-governance.mjs';
import {findPython312} from '../local-config.mjs';
import {sourceCourse,code,hash,adaptationFixtureProvider} from './adaptation-fixtures.mjs';

function setup({noChanges=false,about=true,teacherFeedback=false,readVersion,onGenerate}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-consent-')),course=sourceCourse();
 const governance=createProfileGovernance({directory,profileId:'learner-test',courseId:course.id});
 governance.act({action:'update-about',about:{interests:'Кофе',goals:'Аналитика',background:'Excel',avoid:''}});
 const state={testProofs:Object.fromEntries(course.tasks.map(task=>[task.id,{codeHash:hash,allPassed:true}]))};
 if(teacherFeedback)state.taskFeedback={'source-1':[{author:{id:'teacher',role:'teacher',name:'Преподаватель'},hardDetails:'TEACHER_SECRET_DO_NOT_USE',savedAt:new Date().toISOString()}]};
 const checked={code,codeHash:hash,result:{ok:true,tests:[{label:'QA',ok:true}]}};
 const calls=[],prompts=[];
 const options={directory,course,governance,python:findPython312(process.env.GUILD_PYTHON),provider:'file',readState:()=>state,readChecked:()=>checked,...(readVersion?{readContentVersion:readVersion}:{}),fixtureProvider:async args=>{
  calls.push(args.stage);prompts.push({stage:args.stage,prompt:args.prompt});
  if(args.stage==='personalize')return {summary:'Ученик выбирает изменения.',preferences:noChanges?[]:[{category:'examples',rule:'Показывать операции на конкретных данных.',evidenceIds:[args.job.evidence.feedback.at(-1).id],supersedesIds:[]}],aboutUpdates:about&&!noChanges?[{field:'interests',value:'Кофе и Genshin',evidenceIds:[args.job.evidence.feedback.at(-1).id]}]:[],sharedProposals:[]};
  if(args.stage==='generate')onGenerate?.(governance);
  return adaptationFixtureProvider(args);
 }};
 let service=createLearningService(options);
 return {directory,governance,calls,prompts,state,options,get service(){return service;},async restart(){service.close();await service.whenIdle();service=createLearningService(options);},async close(){service.close();await service.whenIdle();fs.rmSync(directory,{recursive:true,force:true});}};
}
async function submit(f){const pending=await f.service.submit({lessonId:'source-lesson',author:f.governance.resolveLearner(),feedback:{comment:'Люблю кофе и Genshin. Хочу видеть операции на конкретных данных.'}});await f.service.whenIdle();return f.service.getStatus(pending.id);}
async function consent(f,job,acceptedIds){await f.service.manage({action:'confirm-personalization',jobId:job.id,acceptedIds});await f.service.whenIdle();return f.service.getStatus(job.id);}

test('Personal changes wait for explicit consent and selected changes alone reach author and reviewer',async()=>{
 const f=setup({teacherFeedback:true});try{
  const job=await submit(f);assert.equal(job.status,'awaiting-consent');assert.deepEqual(f.calls,['personalize']);assert.equal(f.governance.snapshot().about.interests,'Кофе');assert.equal(f.governance.snapshot().personalization.preferences.length,0);assert.equal(f.service.loadOverlay().tasks.length,0);
  assert.equal(job.personalizationProposal.changes.length,2);assert.ok(!JSON.stringify(job).includes('evidenceIds'));assert.ok(!JSON.stringify(job).includes('TEACHER_SECRET_DO_NOT_USE'));assert.ok(!f.prompts[0].prompt.includes('TEACHER_SECRET_DO_NOT_USE'));
  const rule=job.personalizationProposal.changes.find(item=>item.section==='teaching');const done=await consent(f,job,[rule.id]);assert.equal(done.status,'ready',done.error);assert.deepEqual(f.calls,['personalize','generate','review']);assert.equal(f.governance.snapshot().about.interests,'Кофе');assert.equal(f.governance.snapshot().personalization.preferences.filter(item=>item.status==='active').length,1);
  for(const stage of ['generate','review']){const prompt=f.prompts.find(item=>item.stage===stage).prompt;assert.match(prompt,/Кофе/);assert.match(prompt,/Excel/);assert.match(prompt,/Показывать операции/);assert.ok(!prompt.includes('TEACHER_SECRET_DO_NOT_USE'));}
  await f.service.manage({action:'confirm-personalization',jobId:job.id,acceptedIds:[rule.id]});assert.deepEqual(f.calls,['personalize','generate','review']);
 }finally{await f.close();}
});

test('Awaiting consent survives restart; reject all continues with newest manually edited profile',async()=>{
 const f=setup();try{
  const job=await submit(f);await f.restart();assert.equal(f.service.getStatus(job.id).status,'awaiting-consent');assert.equal(f.service.snapshot().busy,false);assert.deepEqual(f.calls,['personalize']);
  f.governance.act({action:'update-about',about:{interests:'Пионы'}});f.governance.act({action:'add-rule',text:'Объяснять через знакомые таблицы.'});
  const done=await consent(f,job,[]);assert.equal(done.status,'ready',done.error);assert.deepEqual(f.calls,['personalize','generate','review']);assert.equal(f.governance.snapshot().about.interests,'Пионы');const generate=f.prompts.find(item=>item.stage==='generate').prompt;assert.match(generate,/Пионы/);assert.match(generate,/знакомые таблицы/);assert.ok(!f.governance.snapshot().personalization.preferences.some(item=>item.text==='Показывать операции на конкретных данных.'));
 }finally{await f.close();}
});

test('Changed task version rejects consent before any profile decision',async()=>{
 let version='v1';const f=setup({readVersion:()=>version});try{
  const job=await submit(f);version='v2';await assert.rejects(f.service.manage({action:'confirm-personalization',jobId:job.id,acceptedIds:job.personalizationProposal.changes.map(item=>item.id)}),/Урок обновился/);assert.equal(f.governance.pendingChanges()[0].status,'pending');assert.equal(f.governance.snapshot().about.interests,'Кофе');assert.deepEqual(f.calls,['personalize']);
 }finally{await f.close();}
});

test('No proposed changes continue without an empty consent form',async()=>{
 const f=setup({noChanges:true});try{const job=await submit(f);assert.equal(job.status,'ready',job.error);assert.deepEqual(f.calls,['personalize','generate','review']);assert.equal(f.governance.pendingChanges().length,0);}finally{await f.close();}
});


test('A cancelled consent request cannot publish or leave an orphan pending form',async()=>{
 const f=setup();try{const job=await submit(f);await f.service.manage({action:'cancel-job',jobId:job.id});assert.equal(f.service.getStatus(job.id).status,'cancelled');assert.equal(f.governance.pendingChanges().length,0);await assert.rejects(f.service.manage({action:'confirm-personalization',jobId:job.id,acceptedIds:job.personalizationProposal.changes.map(item=>item.id)}),/не ожидает согласия/);assert.deepEqual(f.calls,['personalize']);assert.equal(f.governance.snapshot().about.interests,'Кофе');}finally{await f.close();}
});

test('Consent cannot overwrite a newer manual About me change; rejecting it remains possible',async()=>{
 const f=setup();try{const job=await submit(f);f.governance.act({action:'update-about',about:{interests:'Новый личный выбор'}});const about=job.personalizationProposal.changes.find(item=>item.section==='about');await assert.rejects(f.service.manage({action:'confirm-personalization',jobId:job.id,acceptedIds:[about.id]}),/уже изменена вручную/);assert.equal(f.governance.snapshot().about.interests,'Новый личный выбор');assert.equal(f.service.getStatus(job.id).status,'awaiting-consent');const done=await consent(f,job,[]);assert.equal(done.status,'ready',done.error);assert.equal(f.governance.snapshot().about.interests,'Новый личный выбор');}finally{await f.close();}
});

test('A manual profile change during generation blocks stale publication and invalidates checkpoints on retry',async()=>{
 let change=true;const f=setup({onGenerate:gov=>{if(change){change=false;gov.act({action:'update-about',about:{interests:'Более свежие интересы'}});}}});try{const job=await submit(f);const failed=await consent(f,job,[]);assert.equal(failed.status,'failed');assert.match(failed.error,/изменил профиль/);assert.equal(f.service.loadOverlay().tasks.length,0);await f.service.manage({action:'resume-job',jobId:job.id});await f.service.whenIdle();const done=f.service.getStatus(job.id);assert.equal(done.status,'ready',done.error);assert.deepEqual(f.calls,['personalize','generate','review','generate','review']);assert.match(f.prompts.filter(item=>item.stage==='generate').at(-1).prompt,/Более свежие интересы/);}finally{await f.close();}
});
