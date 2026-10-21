import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createLearningService,decideLearningPath} from '../adaptation/service.mjs';
import {findPython312} from '../local-config.mjs';
import {executeGeneratedPython} from '../adaptation/runtime.mjs';

const python=findPython312(process.env.GUILD_PYTHON);
import {code,hash,sourceCourse,material,wrongVariants} from './adaptation-fixtures.mjs';

function setup({failed=0,taskFeedback={},providerHook,validateOverlay,readStandard}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-adaptation-'));
 const course=sourceCourse(),state={testProofs:{},taskFeedback};const checked={};
 for(const [index,task]of course.tasks.entries()){const ok=index>=failed;state.testProofs[task.id]={codeHash:hash,allPassed:ok};checked[task.id]={codeHash:hash,code,result:{ok,tests:[{label:'Технический сценарий',ok}]}};}
 const calls=[];
 const fixtureProvider=async args=>{
  calls.push(args.stage);
  const custom=await providerHook?.(args,{directory,calls,material,wrongVariants});if(custom!==undefined)return custom;
  if(args.stage==='personalize'){const feedback=args.job.evidence.feedback.find(item=>item.text?.trim());return {summary:feedback?'Учли прямой отзыв.':'Новых предпочтений не заявлено.',preferences:feedback?[{category:'examples',rule:'Показывать конкретный вход, выражение и результат.',evidenceIds:[feedback.id],supersedesIds:[]}]:[],sharedProposals:[]};}
  if(args.stage==='generate'){
   assert.ok(fs.readFileSync(path.join(directory,'personalization.json'),'utf8').includes('"version": 1'),'Персонализация должна примениться первой');
   return {materials:['next',...(args.job.decision.practice?[args.job.decision.practice]:[])].map(material)};
  }
  if(args.stage==='review'){
   const branches=['next',...(args.job.decision.practice?[args.job.decision.practice]:[])];
   return {approved:true,summary:'Независимая техническая проверка пройдена.',issues:[],taskAudits:branches.flatMap(branch=>material(branch).tasks.map((_,index)=>({taskId:`adaptive-${args.job.materialKey}-${branch}-task-${index+1}`,clearForBeginner:true,meaningfulConditions:true,independentReferenceCode:'total = 0\nfor value in values:\n    total += value\nprint(total)',wrongVariants:wrongVariants(),conclusion:'Цель, роли входа и выхода и случаи пустоты понятны.'})))};
  }
 };
 const options={directory,course,readState:()=>state,readChecked:id=>checked[id],python,provider:'file',fixtureProvider,validateOverlay,readStandard};
 const service=createLearningService(options);
 return {directory,course,state,checked,calls,service,options,close:async()=>{service.close();await service.whenIdle();fs.rmSync(directory,{recursive:true,force:true});}};
}
async function finish(fixture,input={}){const job=await fixture.service.submit({lessonId:'source-lesson',...input});await fixture.service.whenIdle();return fixture.service.getStatus(job.id);}

test('Resuming preserves matching checkpoints but rechecks changed standards and legacy checkpoints',async()=>{
 for(const change of ['unchanged','standard','legacy']){
  const standardDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-standard-'));
  const standardFile=path.join(standardDirectory,'AUTHORING.md');fs.writeFileSync(standardFile,'Initial teaching standard');
  let publicationAttempts=0;const prompts=[];
  const f=setup({readStandard:()=>fs.readFileSync(standardFile,'utf8'),providerHook:({stage,prompt})=>{prompts.push({stage,prompt});},validateOverlay:()=>{if(++publicationAttempts===1)throw Error('Temporary publication validation failure');}});
  try{
   const originalState=JSON.stringify(f.state),first=await finish(f);
   assert.equal(first.status,'failed');assert.equal(f.service.loadOverlay().lessons.length,0);
   const jobFile=path.join(f.directory,'adaptive','jobs',first.id+'.json');
   const before=JSON.parse(fs.readFileSync(jobFile,'utf8'));
   assert.match(before.checkpoints.generate.inputDigest,/^[a-f0-9]{64}$/);
   assert.match(before.checkpoints.review.inputDigest,/^[a-f0-9]{64}$/);
   if(change==='standard')fs.writeFileSync(standardFile,'Updated teaching standard: require explicit boundary explanations');
   if(change==='legacy'){
    for(const checkpoint of Object.values(before.checkpoints))delete checkpoint.inputDigest;
    fs.writeFileSync(jobFile,JSON.stringify(before));
   }
   await f.service.manage({action:'resume-job',jobId:first.id});await f.service.whenIdle();
   const resumed=f.service.getStatus(first.id);assert.equal(resumed.status,'ready',resumed.error);
   assert.deepEqual(f.calls,change==='unchanged'?['personalize','generate','review']:['personalize','generate','review','generate','review']);
   assert.equal(f.service.loadOverlay().lessons.length,1);assert.equal(JSON.stringify(f.state),originalState);
   const after=JSON.parse(fs.readFileSync(jobFile,'utf8'));
   assert.equal(after.personalizationVersion,before.personalizationVersion);
   if(change==='standard'){
    assert.notEqual(after.checkpoints.generate.inputDigest,before.checkpoints.generate.inputDigest);
    assert.notEqual(after.checkpoints.review.inputDigest,before.checkpoints.review.inputDigest);
    for(const stage of ['generate','review'])assert.match(prompts.filter(item=>item.stage===stage).at(-1).prompt,/Updated teaching standard/);
   }
  }finally{await f.close();fs.rmSync(standardDirectory,{recursive:true,force:true});}
 }
});

test('Personalization is applied before generation; references, examples, manual traces and independent wrong variants execute before publication',async()=>{
 const f=setup();try{
  const original=JSON.stringify(f.state),job=await finish(f,{feedback:{comment:'Я хочу видеть понятные примеры на маленьких числах.'},requestId:'qa-first'});
  assert.equal(job.status,'ready',job.error);assert.deepEqual(f.calls,['personalize','generate','review']);assert.equal(job.personalizationVersion,1);
  const overlay=f.service.loadOverlay();assert.equal(overlay.lessons.length,1);assert.equal(overlay.points[0].id,'future-point');assert.equal(overlay.points[0].kind,'statue');assert.equal(overlay.lessons[0].adaptiveTopicId,'next-topic');assert.equal(overlay.rewardGroups[0].id,overlay.lessons[0].id);assert.equal(overlay.rewardGroups[0].reward,640);
  assert.equal(overlay.tasks[0].referenceCode,undefined);assert.equal(overlay.tasks[0].wrongVariants,undefined);assert.equal(JSON.stringify(f.state),original);
  assert.ok(!JSON.stringify(f.service.snapshot()).includes(code));assert.ok(!JSON.stringify(f.service.snapshot()).includes('referenceCode'));
  const again=await f.service.submit({lessonId:'source-lesson',feedback:{comment:'Я хочу видеть понятные примеры на маленьких числах.'},requestId:'qa-first'});assert.equal(again.id,job.id);for(let i=0;i<5;i++)f.service.getStatus(job.id);assert.equal(f.calls.length,3);
  assert.throws(()=>f.service.getStatus('../../outside'),/Неизвестная/);
 }finally{await f.close();}
});

test('Local difficulties produce separate repair; widespread errors produce reinforcement plus the new topic',async()=>{
 for(const [failed,kind]of [[1,'repair'],[3,'reinforcement']]){
  const f=setup({failed});try{const job=await finish(f);assert.equal(job.status,'ready',job.error);assert.deepEqual(job.branches.map(branch=>branch.kind),['next',kind]);const overlay=f.service.loadOverlay(),practice=overlay.lessons.find(lesson=>lesson.adaptiveBranch===kind),practicePoint=overlay.points.find(point=>point.lessonId===practice.id);assert.equal(practice.type,kind==='repair'?'repair':'lesson');assert.equal(practicePoint.topic,'source-point');assert.equal(overlay.pointPrerequisites['future-point'],null);assert.equal(overlay.pointPrerequisites[practicePoint.id],null);assert.equal(practice.reward,kind==='repair'?40:160);}finally{await f.close();}
 }
});

test('Submitting generated or historical corrective practice updates personalization without nested courses or fake missing-roadmap failures',async()=>{
 const f=setup({failed:1});try{
  const initial=await finish(f);assert.equal(initial.status,'ready',initial.error);const before=JSON.stringify(f.service.loadOverlay()),practice=f.service.loadOverlay().lessons.find(lesson=>lesson.adaptiveBranch==='repair');
  for(const taskId of practice.taskIds){f.state.testProofs[taskId]={codeHash:hash,allPassed:false};f.checked[taskId]={code,codeHash:hash,result:{ok:false,tests:[{label:'Временный сценарий',ok:false}]}};}
  const queued=await f.service.submit({lessonId:practice.id,feedback:{clarity:'mixed',difficulty:5,comment:'Хочу более короткие примеры.'}});await f.service.whenIdle();const submitted=f.service.getStatus(queued.id);assert.equal(submitted.status,'ready',submitted.error);assert.equal(submitted.feedbackOnly,true);assert.equal(JSON.stringify(f.service.loadOverlay()),before);assert.deepEqual(new Set(submitted.branches.map(branch=>branch.lessonId)),new Set(initial.branches.map(branch=>branch.lessonId)));assert.deepEqual(f.calls,['personalize','generate','review','personalize']);
  f.course.tasks.push({...f.course.tasks[0],id:'legacy-task'});f.course.lessons.push({id:'legacy-repair',type:'repair',title:'Историческая практика без продолжения',taskIds:['legacy-task'],sections:[{id:'legacy-theory',taskIds:['legacy-task']}]});f.state.testProofs['legacy-task']={codeHash:hash,allPassed:true};f.checked['legacy-task']={code,codeHash:hash,result:{ok:true,tests:[{label:'Временный сценарий',ok:true}]}};
  const legacy=await f.service.submit({lessonId:'legacy-repair'});await f.service.whenIdle();assert.equal(f.service.getStatus(legacy.id).status,'ready');assert.equal(f.service.getStatus(legacy.id).feedbackOnly,true);assert.equal(JSON.stringify(f.service.loadOverlay()),before);assert.deepEqual(f.calls,['personalize','generate','review','personalize','personalize']);
 }finally{await f.close();}
});

test('Missing/skipped feedback and absent code do not prove mastery or produce fabricated negative judgments',async()=>{
 const f=setup({taskFeedback:{'source-1':[{skipped:true,hardDetails:'Шаблон не должен учитываться'}]}});try{
  delete f.checked['source-1'].code;const job=await finish(f);assert.equal(job.status,'ready',job.error);assert.equal(job.decision.certainty,'limited');assert.equal(job.decision.practice,null);
  const profile=JSON.parse(fs.readFileSync(path.join(f.directory,'personalization.json')));assert.deepEqual(profile.rules,[]);assert.ok(!JSON.stringify(profile).includes('Шаблон не должен учитываться'));
 }finally{await f.close();}
});

test('A mismatching trace, leaking starter, non-discriminating mutant, or rejected independent review leaves the old course untouched',async()=>{
 for(const failure of ['trace','starter','mutant','review']){
  const f=setup({providerHook:({stage},helpers)=>{
   if(stage==='generate'&&failure!=='review'){const next=helpers.material('next');if(failure==='trace')next.sections[0].example.steps[0].variablesJson='{"values":[99]}';if(failure==='starter')next.tasks[0].starter+='total = sum(values)\n';if(failure==='mutant')next.tasks[0].wrongVariants[0].code='total = sum(values)\nprint(total)';return {materials:[next]};}
   if(stage==='review'&&failure==='review')return {approved:false,summary:'Нужно улучшить ясность.',issues:['Непонятно, что дано.'],taskAudits:[]};
  }});try{const job=await finish(f,{feedback:{comment:'Добавьте конкретные примеры.'}});assert.equal(job.status,'failed');assert.equal(f.service.loadOverlay().tasks.length,0);const profile=JSON.parse(fs.readFileSync(path.join(f.directory,'personalization.json')));assert.equal(profile.version,1);assert.equal(profile.rules.length,1);assert.equal(f.state.testProofs['source-1'].allPassed,true);}finally{await f.close();}
 }
});

test('Changed feedback updates personalization but reuses existing published lessons and stable reward/task IDs',async()=>{
 let second=false,previousRule;
 const f=setup({providerHook:({stage,job})=>{
  if(stage==='personalize'&&second)return {summary:'Уточнили предпочтение.',preferences:[{category:'examples',rule:'Показывать один короткий пример перед подробным разбором.',evidenceIds:[job.evidence.feedback.at(-1).id],supersedesIds:[previousRule]}],sharedProposals:[]};
 }});try{
  const first=await finish(f,{feedback:{comment:'Больше конкретных примеров.'}});assert.equal(first.status,'ready',first.error);const before=JSON.stringify(f.service.loadOverlay());previousRule=JSON.parse(fs.readFileSync(path.join(f.directory,'personalization.json'))).rules[0].id;second=true;
  const updated=await finish(f,{feedback:{comment:'Теперь лучше один короткий пример, чем много сразу.'},requestId:'updated'});assert.equal(updated.status,'ready',updated.error);assert.deepEqual(updated.branches,first.branches);assert.equal(JSON.stringify(f.service.loadOverlay()),before);assert.deepEqual(f.calls,['personalize','generate','review','personalize']);const profile=JSON.parse(fs.readFileSync(path.join(f.directory,'personalization.json')));assert.equal(profile.version,3);assert.equal(profile.rules.find(rule=>rule.id===previousRule).status,'superseded');assert.equal(profile.history.at(-1).supersededRuleIds[0],previousRule);
 }finally{await f.close();}
});

test('Correcting a complaint to neutral feedback withdraws its sole-source preference, without asking the model to supersede it',async()=>{
 for(const multiSource of [false,true]){
  let neutral=false;
  const f=setup({providerHook:({stage})=>stage==='personalize'&&neutral?{summary:'Новых предпочтений нет.',preferences:[],sharedProposals:[]}:undefined});
  try{
   const first=await finish(f,{feedback:{comment:'Мне нужны маленькие конкретные примеры.'}});assert.equal(first.status,'ready',first.error);
   const profileFile=path.join(f.directory,'personalization.json'),profile=JSON.parse(fs.readFileSync(profileFile)),ruleId=profile.rules[0].id;
   if(multiSource){profile.observations.push({id:'other-lesson-feedback',kind:'lesson',lessonId:'other-lesson',status:'active',text:'Такие примеры мне помогают.'});profile.rules[0].evidenceIds.push('other-lesson-feedback');fs.writeFileSync(profileFile,JSON.stringify(profile));}
   neutral=true;const before=JSON.stringify(f.service.loadOverlay());const updated=await finish(f,{feedback:{clarity:'clear',comment:''}});assert.equal(updated.status,'ready',updated.error);assert.equal(JSON.stringify(f.service.loadOverlay()),before);
   const after=JSON.parse(fs.readFileSync(profileFile));assert.equal(after.rules.find(rule=>rule.id===ruleId).status,multiSource?'active':'unsupported');assert.ok(after.observations.some(item=>item.status==='superseded'));
   if(!multiSource)assert.ok(after.history.some(entry=>entry.phase==='source-supersession'&&entry.unsupportedRuleIds.includes(ruleId)));
  }finally{await f.close();}
 }
});

test('Feedback without a real source, unsupported runtime, or invalid merged course fails closed and keeps personalization local',async()=>{
 const unknown=setup({providerHook:({stage})=>stage==='personalize'?{summary:'Подмена',preferences:[{category:'examples',rule:'Выдуманное правило',evidenceIds:['unknown-feedback'],supersedesIds:[]}],sharedProposals:[]}:undefined});try{assert.equal((await finish(unknown)).status,'failed');assert.equal(unknown.service.loadOverlay().lessons.length,0);assert.equal(JSON.parse(fs.readFileSync(path.join(unknown.directory,'personalization.json'))).version,0);}finally{await unknown.close();}
 const runtime=setup();try{runtime.course.adaptation.roadmap[1].runtime='data-python';const job=await finish(runtime,{feedback:{comment:'Хочется маленьких примеров.'}});assert.equal(job.status,'failed');assert.match(job.error,/другой проверенный исполнитель/);assert.deepEqual(runtime.calls,['personalize']);assert.equal(job.personalizationVersion,1);}finally{await runtime.close();}
 const invalid=setup({validateOverlay:()=>{throw Error('Конфликт точки карты');}});try{const job=await finish(invalid);assert.equal(job.status,'failed');assert.equal(invalid.service.loadOverlay().lessons.length,0);}finally{await invalid.close();}
});

test('Explicit retries are bounded; restart and repeated status polling never automatically spawn Codex',async()=>{
 const f=setup({providerHook:({stage})=>{if(stage==='generate')throw Error('Временная ошибка провайдера');}});try{
  const first=await finish(f);assert.equal(first.status,'failed');assert.equal(first.canRetry,true);const second=await finish(f);assert.equal(second.id,first.id);assert.equal(second.attempt,2);assert.equal(second.canRetry,false);assert.deepEqual(f.calls,['personalize','generate','generate']);
  const third=await finish(f);assert.equal(third.id,first.id);assert.equal(f.calls.length,3);
  const jobFile=path.join(f.directory,'adaptive','jobs',first.id+'.json'),disk=JSON.parse(fs.readFileSync(jobFile));disk.status='running';disk.stage='validating';fs.writeFileSync(jobFile,JSON.stringify(disk));
  const restarted=createLearningService(f.options);assert.equal(restarted.getStatus(first.id).stage,'interrupted');assert.equal(restarted.snapshot().jobs.length,1);assert.equal(f.calls.length,3);restarted.close();
 }finally{await f.close();}
});

test('An explicit author retry sees its previous private draft and validation feedback without exposing references in API status',async()=>{
 let generated=0;
 const f=setup({providerHook:({stage,prompt},helpers)=>{
  if(stage==='generate'){generated+=1;const draft=helpers.material('next');if(generated===1){draft.sections[0].example.steps[0].variablesJson='{"values":[99]}';return {materials:[draft]};}assert.ok(prompt.includes('previousDraft'));assert.ok(prompt.includes('referenceCode'));assert.ok(prompt.includes('состояние ручного шага'));return {materials:[draft]};}
 }});try{
  const first=await finish(f);assert.equal(first.status,'failed');const second=await finish(f);assert.equal(second.status,'ready',second.error);assert.equal(second.id,first.id);assert.equal(generated,2);assert.deepEqual(f.calls,['personalize','generate','generate','review']);const saved=JSON.parse(fs.readFileSync(path.join(f.directory,'adaptive','jobs',second.id+'.json')));assert.ok(saved.lastGenerated.materials[0].tasks[0].referenceCode);assert.ok(!JSON.stringify(f.service.snapshot()).includes('referenceCode'));assert.ok(!JSON.stringify(f.service.getStatus(second.id)).includes('lastGenerated'));
 }finally{await f.close();}
});

test('Only one preparation runs at a time and an untested lesson cannot be submitted',async()=>{
 let release;const blocked=new Promise(resolve=>{release=resolve;});
 const f=setup({providerHook:async({stage})=>{if(stage==='personalize')await blocked;}});try{
  const one=await f.service.submit({lessonId:'source-lesson'});const again=await f.service.submit({lessonId:'source-lesson'});assert.equal(again.id,one.id);await assert.rejects(f.service.submit({lessonId:'source-lesson',feedback:{comment:'Другой отзыв'}}),/готовится/);release();await f.service.whenIdle();assert.equal(f.service.getStatus(one.id).status,'ready');
  await assert.rejects(f.service.submit({lessonId:'source-lesson',feedback:{difficulty:8}}),/от 1 до 5/);await assert.rejects(f.service.submit({lessonId:'source-lesson',requestId:'../../invalid'}),/номер отправки/);
  f.state.testProofs={};await assert.rejects(f.service.submit({lessonId:'source-lesson'}),/проверь хотя бы одно/);
 }finally{release();await f.close();}
});

test('A closed worker cannot overwrite the interrupted job recovered by a new server',async()=>{
 let release;const blocked=new Promise(resolve=>{release=resolve;});
 const f=setup({providerHook:async({stage})=>{if(stage==='personalize')await blocked;}});let restarted;
 try{
  const job=await f.service.submit({lessonId:'source-lesson'});await new Promise(resolve=>setImmediate(resolve));f.service.close();
  restarted=createLearningService(f.options);assert.equal(restarted.getStatus(job.id).stage,'interrupted');
  const jobFile=path.join(f.directory,'adaptive','jobs',job.id+'.json'),recovered=fs.readFileSync(jobFile,'utf8');release();await f.service.whenIdle();assert.equal(fs.readFileSync(jobFile,'utf8'),recovered);assert.equal(JSON.parse(fs.readFileSync(path.join(f.directory,'personalization.json'))).version,0);
 }finally{release();restarted?.close();await f.close();}
});

test('The trusted trace instrument retains the educational executor restrictions and the starter contains only actual input literals',async()=>{
 assert.equal((await executeGeneratedPython({python,code:'import os\nprint(os.getcwd())',trace:true})).ok,false);
 assert.equal((await executeGeneratedPython({python,code:'values = [2, 3]\n# Напиши свой код здесь',tests:[{inputs:{values:[2,3]},expected:{total:5}}],inspectStarter:true})).ok,true);
 assert.equal((await executeGeneratedPython({python,code:'values = list(range(9))',tests:[{inputs:{values:[2,3]},expected:{total:5}}],inspectStarter:true})).ok,false);
});

test('An unclear overall explanation requests repair even when all tests pass; broad self-reported difficulties request reinforcement',()=>{
 const base={tasks:[{id:'a',status:'passed',codeVerified:true},{id:'b',status:'unknown',codeVerified:false}],feedback:[],lessonFeedback:{clarity:'unclear'}};assert.equal(decideLearningPath(base).practice,'repair');assert.equal(decideLearningPath(base).failed,0);
 assert.equal(decideLearningPath({...base,feedback:['a','b','c'].map(taskId=>({kind:'task',taskId,difficulty:5,hardPart:'algorithm'})),lessonFeedback:{}}).practice,'reinforcement');
 assert.equal(decideLearningPath({...base,feedback:['a','b','c'].map(taskId=>({kind:'task',taskId,difficulty:4,hardPart:'none'})),lessonFeedback:{difficulty:4,clarity:'clear'}}).practice,null);
 assert.equal(decideLearningPath({...base,feedback:[],lessonFeedback:{difficulty:5,clarity:'clear'}}).practice,null);
});
