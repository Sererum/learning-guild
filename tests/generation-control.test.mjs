import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGenerationControl} from '../generation-control.mjs';
import {createReviewBridge,makeReviewRequest} from '../review.mjs';
import {createLearningService} from '../adaptation/service.mjs';
import {sourceCourse,hash,code} from './adaptation-fixtures.mjs';
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'guild-budget-'));

test('One durable daily budget covers every caller; reservations precede launch, retries and changed requests do not reset it',()=>{
 const directory=temp();let current=new Date('2026-10-17T10:00:00Z');try{
  const control=createGenerationControl(directory,{clock:()=>current,reservationTokens:100});control.manage({action:'set-limits',dailyCalls:2,dailyTokens:200,autoResume:false,retentionDays:14});
  const one=control.reserve({kind:'tutor-help'}),two=control.reserve({kind:'lesson-generate'});assert.equal(control.management().usage.calls,2);assert.equal(control.management().usage.reservedTokens,200);
  assert.throws(()=>control.reserve({kind:'another-question'}),/лимит обращений/);control.settle(one,{usage:{input_tokens:20,output_tokens:10}});control.settle(two,{status:'failed'});assert.equal(control.management().usage.tokens,130);assert.equal(control.management().usage.calls,2);
  control.settle(two,{usage:{input_tokens:0,output_tokens:0}});assert.equal(control.management().usage.tokens,130);
  const restored=createGenerationControl(directory,{clock:()=>current,reservationTokens:100});assert.equal(restored.management().settings.autoResume,false);assert.throws(()=>restored.reserve(),/лимит обращений/);
  current=new Date('2026-10-18T10:00:00Z');assert.equal(restored.management().usage.calls,0);restored.reserve();assert.equal(restored.management().usage.calls,1);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('A crash is charged its reserved estimate; a token overrun blocks the next call and cannot refund through a repeated settle',()=>{
 const directory=temp();try{
  const control=createGenerationControl(directory,{reservationTokens:100});control.manage({action:'set-limits',dailyCalls:10,dailyTokens:120});control.reserve();
  const restored=createGenerationControl(directory,{reservationTokens:100});assert.equal(restored.management().usage.tokens,100);assert.equal(restored.management().usage.reservedTokens,0);assert.throws(()=>restored.reserve(),/резерва токенов/);
  restored.manage({action:'set-limits',dailyTokens:300});const second=restored.reserve();restored.settle(second,{usage:{input_tokens:150,output_tokens:90}});assert.equal(restored.management().usage.tokens,340);assert.equal(restored.management().usage.remainingTokens,0);assert.throws(()=>restored.reserve(),/резерва токенов/);
  for(const input of [{dailyCalls:-1},{dailyTokens:1.5},{autoResume:'yes'},{retentionDays:1}])assert.throws(()=>restored.manage({action:'set-limits',...input}));
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('Tutor launch uses the same budget, isolated working directory, disabled tools and real usage telemetry',async()=>{
 const directory=temp();let bridge;try{
  const control=createGenerationControl(directory);control.manage({action:'set-limits',dailyCalls:1,dailyTokens:100000});
  const task={id:'budget-task',name:'Техническая задача',description:'Проверь ввод.',contentVersion:'revision-one'},request=makeReviewRequest(task,'pass','',{ok:false,tests:[]});
  const response={schemaVersion:2,contentVersion:'revision-one',taskId:task.id,codeHash:request.codeHash,rubricVersion:request.rubricVersion,mode:'help',summary:'Проверь повторение.',criteria:null,strengths:[],improvements:[],nextStep:'Посмотри на второй элемент.',question:null};
  const executable=path.join(directory,'fake-codex'),capture=path.join(directory,'capture.json');
  fs.writeFileSync(executable,'#!'+process.execPath+'\n'+`const fs=require('fs');const args=process.argv.slice(2);fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({args,cwd:process.cwd()}));fs.writeFileSync(args[args.indexOf('--output-last-message')+1],${JSON.stringify(JSON.stringify(response))});console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:120,output_tokens:30}}));process.stdin.resume();`);fs.chmodSync(executable,0o700);
  bridge=createReviewBridge(path.join(directory,'reviews'),{provider:'codex',executable,generationControl:control});const job=bridge.enqueue(task,'pass','',{ok:false,tests:[]});
  for(let i=0;i<100&&bridge.read(job.id).status==='pending';i++)await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(bridge.read(job.id).status,'complete');const invocation=JSON.parse(fs.readFileSync(capture));assert.notEqual(invocation.cwd,path.join(directory,'reviews'));for(const name of ['shell_tool','apps','plugins'])assert.ok(invocation.args.includes(name));assert.ok(invocation.args.includes('--json'));assert.ok(invocation.args.includes('web_search="disabled"'));assert.equal(control.management().usage.tokens,150);assert.equal(control.management().usage.calls,1);
  assert.equal(bridge.enqueue(task,'pass','',{ok:false,tests:[]}).id,job.id,'Cached review costs no new invocation');assert.throws(()=>bridge.enqueue(task,'pass','Другой вопрос',{ok:false,tests:[]}),/лимит обращений/);
 }finally{bridge?.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('Editing a task condition invalidates the review cache even when task ID and solution stay the same',()=>{
 const directory=temp();try{const bridge=createReviewBridge(directory,{provider:'file'}),task={id:'stable-task',name:'Пример',description:'Первое условие',contentVersion:'one'},one=bridge.enqueue(task,'pass','',{ok:false,tests:[]}),two=bridge.enqueue({...task,description:'Другое условие',contentVersion:'two'},'pass','',{ok:false,tests:[]});assert.notEqual(one.id,two.id);assert.equal(two.request.contentVersion,'two');}finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('Cancelling preparation preserves the submitted source and does not let the pending model result publish',async()=>{
 const directory=temp(),course=sourceCourse(),state={testProofs:Object.fromEntries(course.tasks.map(task=>[task.id,{codeHash:hash,allPassed:true}]))};let release;const block=new Promise(resolve=>{release=resolve;});const service=createLearningService({directory,course,readState:()=>state,readChecked:()=>({codeHash:hash,code,result:{ok:true,tests:[]}}),provider:'file',fixtureProvider:async()=>{await block;return {summary:'Нет новых предпочтений.',preferences:[],sharedProposals:[]};}});
 try{const original=JSON.stringify(state),job=await service.submit({lessonId:'source-lesson',author:{id:'tester',name:'Тестовый ученик'}});await new Promise(resolve=>setImmediate(resolve));await service.manage({action:'cancel-job',jobId:job.id});release();await service.whenIdle();assert.equal(service.getStatus(job.id).status,'cancelled');assert.equal(service.loadOverlay().tasks.length,0);assert.equal(JSON.stringify(state),original);assert.equal(service.management().jobs[0].canResume,true);const frozen=JSON.parse(fs.readFileSync(path.join(directory,'adaptive','jobs',job.id+'.json')));assert.equal(frozen.evidence.lessonFeedback.author.id,'tester');}
 finally{release();service.close();await service.whenIdle();fs.rmSync(directory,{recursive:true,force:true});}
});

test('Network failure at independent review reuses the already validated author draft on explicit resume',async()=>{
 const {material,wrongVariants}=await import('./adaptation-fixtures.mjs'),{findPython312}=await import('../local-config.mjs');
 const directory=temp(),course=sourceCourse(),state={testProofs:Object.fromEntries(course.tasks.map(task=>[task.id,{codeHash:hash,allPassed:true}]))},calls=[];let failed=false;
 const service=createLearningService({directory,course,readState:()=>state,readChecked:()=>({codeHash:hash,code,result:{ok:true,tests:[]}}),python:findPython312(process.env.GUILD_PYTHON),provider:'file',fixtureProvider:async({stage,job})=>{
  calls.push(stage);if(stage==='personalize')return {summary:'Новых предпочтений нет.',preferences:[],sharedProposals:[]};if(stage==='generate')return {materials:[material('next')]};
  if(!failed){failed=true;throw Error('Временная потеря связи.');}
  return {approved:true,summary:'Независимая проверка пройдена.',issues:[],taskAudits:material('next').tasks.map((_,index)=>({taskId:`adaptive-${job.materialKey}-next-task-${index+1}`,clearForBeginner:true,meaningfulConditions:true,independentReferenceCode:'total = 0\nfor value in values:\n    total += value\nprint(total)',wrongVariants:wrongVariants(),conclusion:'Смысл понятен.'}))};
 }});
 try{const job=await service.submit({lessonId:'source-lesson'});await service.whenIdle();assert.equal(service.getStatus(job.id).status,'failed');const disk=JSON.parse(fs.readFileSync(path.join(directory,'adaptive','jobs',job.id+'.json')));assert.ok(disk.authorAudits);assert.ok(disk.checkpoints.generate);await service.manage({action:'resume-job',jobId:job.id});await service.whenIdle();assert.equal(service.getStatus(job.id).status,'ready',service.getStatus(job.id).error);assert.deepEqual(calls,['personalize','generate','review','review']);assert.equal(service.loadOverlay().lessons.length,1);}
 finally{service.close();await service.whenIdle();fs.rmSync(directory,{recursive:true,force:true});}
});

test('Explicit retention cleanup removes old duplicate prompts while retaining work evidence, authored audits and published material',async()=>{
 const directory=temp(),course=sourceCourse(),service=createLearningService({directory,course,readState:()=>({}),provider:'off'}),id='a'.repeat(24),jobs=path.join(directory,'adaptive','jobs'),raw=path.join(jobs,id,'attempt-1','generate'),published=path.join(directory,'adaptive','published');
 try{fs.mkdirSync(raw,{recursive:true});fs.mkdirSync(published,{recursive:true});fs.writeFileSync(path.join(jobs,id+'.json'),JSON.stringify({id,courseId:course.id,lessonId:'source-lesson',status:'ready',stage:'ready',attempt:1,createdAt:'2020-01-01T00:00:00Z',updatedAt:'2020-01-01T00:00:00Z',evidence:{code:'preserve'},authorAudits:{passed:true}}));fs.writeFileSync(path.join(raw,'generate-input.json'),'old duplicate prompt');fs.writeFileSync(path.join(raw,'generate-result.json'),'old duplicate result');fs.writeFileSync(path.join(raw,'provider-status.json'),'safe telemetry');fs.writeFileSync(path.join(published,id+'.json'),'preserve publication');await assert.rejects(service.manage({action:'archive-raw'}),/подтверждение/);const result=await service.manage({action:'archive-raw',confirm:true});assert.equal(result.removedFiles,2);assert.ok(fs.existsSync(path.join(jobs,id+'.json')));assert.ok(fs.existsSync(path.join(raw,'provider-status.json')));assert.equal(fs.readFileSync(path.join(published,id+'.json'),'utf8'),'preserve publication');assert.equal(JSON.parse(fs.readFileSync(path.join(jobs,id+'.json'))).evidence.code,'preserve');}
 finally{service.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('Latest feedback is selected independently for each author, and correcting Alice never supersedes the teacher source',async()=>{
 const directory=temp(),course=sourceCourse();course.lessons[0].type='repair';const learner={id:'alice',name:'Алиса'},teacher={id:'teacher',name:'Преподаватель'},state={testProofs:Object.fromEntries(course.tasks.map(task=>[task.id,{codeHash:hash,allPassed:true}])),taskFeedback:{'source-1':[{author:teacher,hardDetails:'Показывать стоимость в примерах.',savedAt:'2026-10-17T10:00:00Z',difficulty:2}]},taskFeedbackHistory:{'source-1':[{author:learner,hardDetails:'Сначала маленький пример.',savedAt:'2026-10-17T09:00:00Z',difficulty:2}]}};
 const service=createLearningService({directory,course,readState:()=>state,readChecked:()=>({codeHash:hash,code,result:{ok:true,tests:[]}}),provider:'file',fixtureProvider:async({job})=>({summary:'Сохранили пожелания авторов.',preferences:job.evidence.feedback.filter(item=>item.kind==='task'&&item.text?.trim()).map(item=>({category:'examples',rule:item.text,evidenceIds:[item.id],supersedesIds:[]})),sharedProposals:[]})});
 try{let job=await service.submit({lessonId:'source-lesson',author:teacher});await service.whenIdle();assert.equal(service.getStatus(job.id).status,'ready');let profile=JSON.parse(fs.readFileSync(path.join(directory,'personalization.json')));assert.equal(profile.observations.filter(item=>item.kind==='task'&&item.status==='active').length,2);
  state.taskFeedbackHistory['source-1'].push(state.taskFeedback['source-1'][0]);state.taskFeedback['source-1']=[{author:learner,hardDetails:'Теперь лучше один общий пример.',savedAt:'2026-10-17T11:00:00Z',difficulty:2}];job=await service.submit({lessonId:'source-lesson',author:learner,feedback:{comment:'Изменила пожелание.'}});await service.whenIdle();assert.equal(service.getStatus(job.id).status,'ready');profile=JSON.parse(fs.readFileSync(path.join(directory,'personalization.json')));const observations=profile.observations.filter(item=>item.kind==='task');assert.equal(observations.filter(item=>item.author?.id==='alice'&&item.status==='active').length,1);assert.equal(observations.filter(item=>item.author?.id==='teacher'&&item.status==='active').length,1);assert.equal(observations.find(item=>item.author?.id==='alice'&&item.text==='Сначала маленький пример.').status,'superseded');
 }finally{service.close();await service.whenIdle();fs.rmSync(directory,{recursive:true,force:true});}
});

test('An interrupted tutor review becomes visibly retryable after restart without starting a paid call',()=>{
 const directory=temp(),reviews=path.join(directory,'reviews');fs.mkdirSync(reviews);const id='12345678-1234-1234-1234-123456789abc';
 try{fs.writeFileSync(path.join(reviews,id+'.request.json'),JSON.stringify({request:{mode:'help',effort:'medium'},status:'pending'}));fs.writeFileSync(path.join(reviews,id+'.status.json'),JSON.stringify({status:'pending'}));const control=createGenerationControl(directory),bridge=createReviewBridge(reviews,{provider:'codex',executable:null,generationControl:control});assert.equal(bridge.read(id).status,'failed');assert.match(bridge.read(id).error,/прервался/);assert.equal(control.management().usage.calls,0);bridge.close();}finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('Crash recovery resumes the same frozen attempt and is bounded independently from material correction retries',async()=>{
 const directory=temp(),course=sourceCourse();course.lessons[0].type='repair';const state={testProofs:Object.fromEntries(course.tasks.map(task=>[task.id,{codeHash:hash,allPassed:true}]))},options={directory,course,readState:()=>state,readChecked:()=>({codeHash:hash,code,result:{ok:true,tests:[]}}),provider:'file',fixtureProvider:async()=>({summary:'Новых пожеланий нет.',preferences:[],sharedProposals:[]})};let service=createLearningService(options);
 try{const job=await service.submit({lessonId:'source-lesson'});await service.whenIdle();const file=path.join(directory,'adaptive','jobs',job.id+'.json');
  for(let count=1;count<=2;count++){service.close();const disk=JSON.parse(fs.readFileSync(file));disk.status='running';disk.stage='planning';fs.writeFileSync(file,JSON.stringify(disk));service=createLearningService(options);assert.equal(service.getStatus(job.id).canResume,true);await service.manage({action:'resume-job',jobId:job.id});await service.whenIdle();assert.equal(service.getStatus(job.id).status,'ready');assert.equal(service.getStatus(job.id).attempt,1);assert.equal(service.getStatus(job.id).recoveryCount,count);}
  service.close();const disk=JSON.parse(fs.readFileSync(file));disk.status='running';fs.writeFileSync(file,JSON.stringify(disk));service=createLearningService(options);assert.equal(service.getStatus(job.id).canResume,false);await assert.rejects(service.manage({action:'resume-job',jobId:job.id}),/Лимит/);
 }finally{service.close();await service.whenIdle();fs.rmSync(directory,{recursive:true,force:true});}
});

test('Model context masks private contacts and names and includes only current preference summaries, not previous raw history',async()=>{
 const directory=temp(),course=sourceCourse();course.lessons[0].type='repair';course.manifest.learnerName='Тестовое Личное Имя';const email='learner-private@example.org',oldText='PRIVATE_OLD_UNRELATED_OBSERVATION',state={testProofs:Object.fromEntries(course.tasks.map(task=>[task.id,{codeHash:hash,allPassed:true}]))};
 fs.writeFileSync(path.join(directory,'personalization.json'),JSON.stringify({schemaVersion:1,version:3,observations:[{id:'old-source',kind:'lesson',lessonId:'old',text:oldText,status:'active'}],rules:[{id:'old-rule',category:'examples',text:'Показывать сначала короткий пример.',status:'active',source:'explicit-feedback',evidenceIds:['old-source']}],history:[{summary:'PRIVATE_HISTORY_SHOULD_NOT_BE_A_MODEL_CONTEXT'}],sharedProposals:[]}));let modelPrompt='';
 const service=createLearningService({directory,course,readState:()=>state,readChecked:()=>({codeHash:hash,code,result:{ok:true,tests:[]}}),provider:'file',fixtureProvider:async({prompt})=>{modelPrompt=prompt;return {summary:'Учли только новый отзыв.',preferences:[],sharedProposals:[]};}});
 try{const job=await service.submit({lessonId:'source-lesson',feedback:{comment:`Я Тестовое Личное Имя, почта ${email}. Покажи пример.`}});await service.whenIdle();assert.equal(service.getStatus(job.id).status,'ready');assert.ok(!modelPrompt.includes(email));assert.ok(!modelPrompt.includes('Тестовое Личное Имя'));assert.ok(!modelPrompt.includes(oldText));assert.ok(!modelPrompt.includes('PRIVATE_HISTORY_SHOULD_NOT_BE_A_MODEL_CONTEXT'));assert.ok(modelPrompt.includes('old-rule'));const stored=JSON.parse(fs.readFileSync(path.join(directory,'adaptive','jobs',job.id,'attempt-1','personalize','personalize-input.json')));assert.ok(!stored.prompt.includes(email));const original=JSON.parse(fs.readFileSync(path.join(directory,'adaptive','jobs',job.id+'.json')));assert.ok(original.evidence.lessonFeedback.comment.includes(email),'Original feedback remains local for source audit');const tutor=makeReviewRequest({id:'privacy-task',name:'Техническая задача',description:'Без личных данных'},'pass',`Почта ${email}`,{ok:false,tests:[]},undefined,undefined,{learnerName:'Тестовое Личное Имя'});assert.ok(!tutor.prompt.includes(email));assert.ok(!tutor.prompt.includes('Тестовое Личное Имя'));}
 finally{service.close();await service.whenIdle();fs.rmSync(directory,{recursive:true,force:true});}
});
