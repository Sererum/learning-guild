import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {startCodexReview,findCodexExecutable} from '../codex-reviewer.mjs';
import {assertJsonShape,personalizationSchema,generationSchema,independentReviewSchema} from './schema.mjs';
import {personalizationPrompt,generationPrompt,reviewPrompt} from './prompts.mjs';
import {compileMaterials,hydrateExecutionTraces,verifyAuthoredMaterials,independentReviewInput,verifyIndependentReview} from './content.mjs';
import {executeGeneratedPython} from './runtime.mjs';
import {sanitizeForModel} from '../privacy.mjs';
import {createGenerationControl} from '../generation-control.mjs';
import {effortForTask,effortRoleForStage} from '../ai-policy.mjs';

const now=()=>new Date().toISOString();
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
// Bump when execution/validation semantics change without changing the JSON schema.
const validationContractVersion=1;
const readAuthoringStandard=()=>fs.readFileSync(fileURLToPath(new URL('../AUTHORING.md',import.meta.url)),'utf8');
const emptyOverlay=()=>({lessons:[],tasks:[],points:[],routes:[],rewardGroups:[],taskTopics:{},qualityCaps:{},pointPrerequisites:{},repairPoints:[],presentation:{points:{}}});
const canResumeJob=job=>['failed','cancelled'].includes(job.status)&&(job.interrupted?(job.recoveryCount||0)<2:job.budgetBlocked||job.providerBlocked||job.attempt<2);
const activeStatuses=new Set(['pending','running']);
const safeId=id=>typeof id==='string'&&/^[a-f0-9]{24}$/.test(id);
const readJson=(file,fallback)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}};
function writeJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.tmp';fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,file);}
function readFiles(directory){if(!fs.existsSync(directory))return [];return fs.readdirSync(directory).filter(name=>/^[a-f0-9]{24}\.json$/.test(name)).sort().map(name=>readJson(path.join(directory,name)));}
export function validateLessonFeedback(value={}) {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Некорректный отзыв об уроке.');
 if(value.difficulty!==undefined&&(!Number.isInteger(value.difficulty)||value.difficulty<1||value.difficulty>5))throw Error('Сложность урока должна быть от 1 до 5.');
 if(value.clarity!==undefined&&!['clear','mixed','unclear'].includes(value.clarity))throw Error('Выбери понятность объяснений.');
 if(value.comment!==undefined&&(typeof value.comment!=='string'||value.comment.length>1600))throw Error('Комментарий должен быть не длиннее 1600 символов.');
 return {...(value.difficulty!==undefined?{difficulty:value.difficulty}:{}),...(value.clarity!==undefined?{clarity:value.clarity}:{}),comment:(value.comment||'').trim()};
}

export function decideLearningPath(evidence) {
 const checked=evidence.tasks.filter(task=>task.status!=='unknown');
 const failed=checked.filter(task=>task.status==='failed');
 const feedback=evidence.feedback.filter(item=>item.kind==='task'&&!item.skipped&&!item.staleContent);
 const concreteDifficulty=item=>(typeof item.hardPart==='string'&&item.hardPart!=='none')||!!item.hardDetails?.trim();
 const hard=feedback.filter(item=>item.difficulty>=5&&concreteDifficulty(item));
 const difficulties=feedback.map(item=>item.difficulty).filter(Number.isFinite);
 const average=difficulties.length?difficulties.reduce((a,b)=>a+b,0)/difficulties.length:null;
 const difficulty=evidence.lessonFeedback.difficulty??average;
 const hardSections=new Set(failed.map(task=>task.sectionId).filter(Boolean));
 const broad=(failed.length>=3&&(hardSections.size>=2||failed.length/Math.max(checked.length,1)>=0.5))||(hard.length>=3&&new Set(hard.map(item=>item.taskId)).size>=3);
 // 3–4/5 is productive challenge, not a failed lesson. Require an actual
 // reported difficulty before turning a high self-rating into extra practice.
 const clarity=evidence.lessonFeedback.clarity,reportedDifficulty=feedback.some(concreteDifficulty);
 const local=failed.length>0||clarity==='unclear'||(clarity==='mixed'&&(difficulty>=4||reportedDifficulty))||(difficulty>=5&&reportedDifficulty)||hard.length>0;
 const unverified=evidence.tasks.filter(task=>!task.codeVerified).length;
 const practice=broad?'reinforcement':local?'repair':null;
 const certainty=checked.length===evidence.tasks.length&&unverified===0?'supported':'limited';
 const rationale=broad?'Затруднения затрагивают несколько задач: подготовим отдельный закрепляющий урок.':local?'Есть конкретное затруднение: подготовим короткую работу над ошибками рядом с исходной темой.':certainty==='supported'?'Проверенные решения сохранены. Подготовим следующую тему; прохождение тестов само по себе не доказывает полное освоение.':'Часть данных о работе отсутствует. Подготовим продолжение, не отмечая непроверенные задания пройденными.';
 return {practice,certainty,rationale,checked:checked.length,failed:failed.length,total:evidence.tasks.length,averageDifficulty:average,unverifiedCode:unverified};
}

export function createLearningService({directory,course,readCourse=()=>course,readCurriculum=()=>course.adaptation?.roadmap||[],readState,readChecked=()=>null,python,provider='codex',fixtureProvider,executable=findCodexExecutable(),executePython,validateOverlay=()=>{},timeoutMs,stageTimeouts={},onStatus=()=>{},governance,generationControl,readAiEfforts=()=>governance?.settings().aiEfforts||{},readCommonRules=()=>[],readStandard=readAuthoringStandard,readContentVersion=id=>readCourse().tasks.find(task=>task.id===id)?.contentVersion||null}) {
 const root=path.join(directory,'adaptive'),jobsDirectory=path.join(root,'jobs'),publishedDirectory=path.join(root,'published');
 const personalizationFile=path.join(directory,'personalization.json');
 const limits=Object.fromEntries(Object.entries({personalize:180000,generate:900000,review:600000}).map(([stage,defaultLimit])=>{const value=stageTimeouts[stage]??timeoutMs??defaultLimit;if(!Number.isFinite(value)||value<1||value>900000)throw Error('Некорректный предел ожидания этапа Codex.');return [stage,value];}));
 const control=generationControl||createGenerationControl(directory,{readAiEfforts});
 const assertBudgetOpen=()=>{const {settings}=control.management();if(settings.dailyCalls<1)throw Object.assign(Error('Дневной лимит обращений к ИИ исчерпан. Измени лимит в настройках или продолжи завтра.'),{code:'GUILD_BUDGET_LIMIT'});if(settings.dailyTokens<1)throw Object.assign(Error('Дневной резерв токенов ИИ исчерпан. Измени лимит в настройках или продолжи завтра.'),{code:'GUILD_BUDGET_LIMIT'});};
 let running=null,closed=false;const cancelled=new Set();
 const assertActive=job=>{if(closed)throw Error('Приложение остановлено.');if(cancelled.has(job.id))throw Error('Подготовка отменена.');};
 const execute=async input=>{if(closed)throw Error('Приложение остановлено.');const result=await (executePython?executePython(input):executeGeneratedPython({...input,python}));if(closed)throw Error('Приложение остановлено.');return result;};
 const runningChildren=new Set(),activeReservations=new Map();
 const loadJobs=()=>readFiles(jobsDirectory).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const saveJob=job=>{if(closed)return;job.updatedAt=now();writeJson(path.join(jobsDirectory,job.id+'.json'),job);onStatus(publicJob(job));};
 const personalization=()=>{const value=readJson(personalizationFile,{schemaVersion:1,version:0,observations:[],rules:[],history:[],sharedProposals:[]});return governance?.reconcile?governance.reconcile(value):value;};
 const savePersonalization=profile=>writeJson(personalizationFile,governance?.reconcile?governance.reconcile(profile):profile);
 const published=()=>readFiles(publishedDirectory);
 function loadOverlay(){
  const overlay=emptyOverlay();
  for(const publication of published()){
   if(publication.courseId!==course.id)throw Error('Персональные материалы относятся к другому курсу.');
   const part=publication.overlay;
   for(const key of ['lessons','tasks','points','routes','rewardGroups','repairPoints'])overlay[key].push(...(part[key]||[]));
   for(const key of ['taskTopics','qualityCaps','pointPrerequisites'])Object.assign(overlay[key],part[key]||{});
   Object.assign(overlay.presentation.points,part.presentation?.points||{});
  }
  return overlay;
 }
 const modelNames=()=>[...(governance?.settings?.().authors||[]).map(author=>author.name),course.manifest.learnerName].filter(name=>name&&!['Ученик','Преподаватель','Не указан'].includes(name));
 const previousForModel=()=>{const profile=personalization();return {version:profile.version,about:profile.about||{},rules:profile.rules.filter(rule=>['active','review-needed'].includes(rule.status)).map(({id,category,text,status})=>({id,category,text,status}))};};
 const generationProfile=profile=>({about:profile.about||{},rules:profile.rules.filter(rule=>rule.status==='active').map(({id,category,text})=>({id,category,text}))});
 const proposalFor=job=>{
  const proposal=governance?.pendingChanges?.().find(item=>item.id===job.personalizationProposalId);
  if(!proposal)return null;
  const labels={interests:'Интересы',goals:'Цели',background:'Опыт и знакомые темы',avoid:'Чего избегать'};
  return {id:proposal.id,jobId:proposal.jobId,status:proposal.status,changes:proposal.changes.map(change=>({id:change.id,section:change.section||(change.kind==='about'?'about':'teaching'),label:change.beforeStatus==='disabled'?'Снова учитывать пожелание':change.label||(change.kind==='about'?labels[change.field]:'Как мне давать задания'),before:change.before??(change.replaces||[]).map(item=>item.text).join('; '),after:change.after??change.value??change.text??''}))};
 };
 function publicJob(job){return {id:job.id,lessonId:job.lessonId,status:job.status,stage:job.stage,createdAt:job.createdAt,updatedAt:job.updatedAt,attempt:job.attempt,canRetry:canResumeJob(job),canResume:canResumeJob(job),recoveryCount:job.recoveryCount||0,
  ...(job.programRequest?{programRequest:clone(job.programRequest),effort:job.stageEfforts?.generate||effortForTask('program',readAiEfforts())}:{}),...(job.error?{error:job.error}:{}),...(job.summary?{summary:job.summary}:{}),...(job.decision?{decision:job.decision}:{}),...(job.feedbackOnly?{feedbackOnly:true}:{}),...(job.status==='awaiting-consent'?{personalizationProposal:proposalFor(job)}:{}),stageEfforts:clone(job.stageEfforts||{}),branches:job.branches||[],budgetBlocked:!!job.budgetBlocked,providerBlocked:!!job.providerBlocked,personalizationVersion:job.personalizationVersion||0};}
 function snapshot(){const profile=personalization();return {enabled:provider!=='off'&&!!course.adaptation?.roadmap?.length,provider,jobs:loadJobs().slice(0,20).map(publicJob),personalization:{version:profile.version,preferences:profile.rules.filter(rule=>rule.status==='active').map(rule=>({id:rule.id,category:rule.category,text:rule.text})),sharedProposals:profile.sharedProposals.filter(item=>item.status==='needs-independent-review').length},busy:!!running};}
 function getStatus(id){if(!safeId(id))throw Error('Неизвестная отправка урока.');const job=readJson(path.join(jobsDirectory,id+'.json'));if(!job)throw Error('Отправка урока не найдена.');return publicJob(job);}
 const interrupted=[];
 // Keep durable checkpoints, so restoring a stopped app does not buy completed calls again.
 for(const job of loadJobs())if(activeStatuses.has(job.status)){
  const publication=readJson(path.join(publishedDirectory,job.id+'.json'));
  if(publication){job.status='ready';job.stage='ready';job.branches=publication.branches;job.summary='Материалы готовы.';}
  else{interrupted.push(job.id);job.interrupted=true;job.status='failed';job.stage='interrupted';job.error='Подготовка прервалась при остановке приложения. Можно повторить отправку.';}
  saveJob(job);
 }
 function collectEvidence(lesson,feedback,author){
  const state=readState();
  const isLearner=reflection=>!governance?.resolveLearner||reflection.author?.id===governance.resolveLearner().id&&reflection.author?.role==='learner';
  const feedbackFor=taskId=>{const latest=new Map(),values=[...(state.taskFeedbackHistory?.[taskId]||[]),...(state.taskFeedback?.[taskId]||[])];values.sort((a,b)=>(a.savedAt||'').localeCompare(b.savedAt||''));for(const value of values)latest.set(value.author?.id||'unknown',value);return [...latest.values()];};
  const tasks=lesson.taskIds.map(taskId=>{
   const task=readCourse().tasks.find(task=>task.id===taskId)||loadOverlay().tasks.find(task=>task.id===taskId),proof=state.testProofs?.[taskId],record=readChecked(taskId);
   const trusted=record&&proof&&(!task?.contentVersion||proof.contentVersion===task.contentVersion)&&(!task?.contentVersion||record.contentVersion===task.contentVersion)&&typeof proof.codeHash==='string'&&/^[a-f0-9]{64}$/.test(proof.codeHash)&&record.codeHash===proof.codeHash&&typeof record.result?.ok==='boolean';
   const codeVerified=!!(trusted&&typeof record.code==='string'&&crypto.createHash('sha256').update(record.code).digest('hex')===record.codeHash);
   const status=trusted?(record.result?.ok?'passed':'failed'):'unknown';
   const reflection=(state.taskFeedback?.[taskId]||[]).find(isLearner);
   const quality=state.qualityClaims?.[taskId];
   return {id:taskId,contentVersion:readContentVersion(taskId)||task?.contentVersion||proof?.contentVersion||null,name:task?.name||taskId,description:task?.description||'',sectionId:lesson.sections.find(section=>section.taskIds?.includes(taskId))?.id||null,status,codeVerified,code:codeVerified?record.code:null,codeHash:trusted?record.codeHash:null,qualityReview:trusted&&quality?.codeHash===record.codeHash&&quality.criteria?clone(quality.criteria):null,
    result:trusted?{ok:!!record.result.ok,tests:(record.result.tests||[]).map(test=>({label:test.label,ok:!!test.ok,error:test.error||null})),error:record.result.error||null}:null,reflection:reflection?clone(reflection):null};
  });
  const taskFeedback=tasks.flatMap(task=>feedbackFor(task.id).filter(isLearner).map(reflection=>({id:'task-feedback-'+task.id+'-'+digest(reflection).slice(0,10),kind:'task',taskId:task.id,taskName:task.name,...(task.contentVersion&&reflection.contentVersion!==task.contentVersion?{staleContent:true}:{}),...(reflection.skipped?{skipped:true,...(reflection.author?{author:reflection.author}:{})}:reflection),text:reflection.skipped?'':[reflection.hardDetails,reflection.hintDetails].filter(Boolean).join('\n')})));
  const lessonFeedback={author:author||{id:'unknown',name:'Не указан'},id:'lesson-feedback-'+lesson.id+'-'+digest({feedback,author:author?.id||'unknown'}).slice(0,10),kind:'lesson',...feedback,text:feedback.comment};
  return {courseId:course.id,lessonId:lesson.id,lessonTitle:lesson.title,author:author||{id:'unknown',name:'Не указан'},contentVersions:Object.fromEntries(tasks.map(task=>[task.id,task.contentVersion])),tasks,lessonFeedback:{...feedback,author:author||{id:'unknown',name:'Не указан'}},feedback:[...taskFeedback,lessonFeedback]};
 }
 function nextFor(lesson){
  const curriculum=readCurriculum(),current=readCourse(),overlay=loadOverlay(),lessons=[...current.lessons,...overlay.lessons];
  const practiceSubmission=lesson.diagnostic||lesson.type==='repair'||['repair','reinforcement'].includes(lesson.adaptiveBranch);
  let origin=lesson;const seen=new Set();
  while(practiceSubmission&&origin.sourceLessonId&&!seen.has(origin.id)){seen.add(origin.id);const previous=lessons.find(item=>item.id===origin.sourceLessonId);if(!previous)break;origin=previous;}
  const repair=[...(current.repairPoints||[]),...overlay.repairPoints].find(point=>point.lessonId===lesson.id);
  const aliases=new Set([origin.id,origin.adaptiveTopicId].filter(Boolean));
  const source=curriculum.find(topic=>topic.lessonId===origin.id||topic.id===origin.adaptiveTopicId||(practiceSubmission&&repair?.topic&&topic.pointId===repair.topic));
  if(source)aliases.add(source.id);
  return {source,topic:curriculum.find(topic=>(topic.afterLessonIds||[]).some(id=>aliases.has(id))),practiceSubmission,originLessonId:origin.id};
 }
 function finishPracticeSubmission(job,allLessons,allPoints){
  const branchByLesson=new Map();
  const candidates=allLessons.filter(lesson=>lesson.sourceLessonId===job.originLessonId&&lesson.adaptiveBranch);
  const next=allLessons.find(lesson=>lesson.id===job.nextTopic?.lessonId||lesson.adaptiveTopicId===job.nextTopic?.id);
  if(next)candidates.push(next);
  for(const lesson of candidates)branchByLesson.set(lesson.id,{lessonId:lesson.id,pointId:allPoints.find(point=>point.lessonId===lesson.id)?.id||'',title:lesson.title,kind:lesson.adaptiveBranch||'next'});
  job.branches=[...branchByLesson.values()].sort((a,b)=>Number(a.kind!=='next')-Number(b.kind!=='next'));
  job.status='ready';job.stage='ready';job.feedbackOnly=true;job.summary=job.branches.length?'Отзыв о практике учтён. Продолжай исходный маршрут; повторные вложенные разборы не создавались.':'Отзыв о практике учтён, личные рекомендации обновлены. Продолжить можно с текущего урока на карте.';saveJob(job);
 }
 async function ask(stage,job,prompt,schema){
  assertActive(job);assertBudgetOpen();prompt=sanitizeForModel(prompt,{names:modelNames()});
  const inputDigest=digest({prompt,schema,validationContractVersion});
  const checkpoint=job.checkpoints?.[stage];if(checkpoint?.result&&checkpoint.inputDigest===inputDigest){const result=clone(checkpoint.result);if(stage==='personalize'&&!Object.hasOwn(result,'aboutUpdates'))result.aboutUpdates=[];assertJsonShape(result,schema);return result;}
  if(checkpoint){delete job.checkpoints[stage];if(stage==='generate'){delete job.checkpoints.review;delete job.authorAudits;}}
  if(Buffer.byteLength(prompt,'utf8')>500000)throw Error('Учебный контекст слишком большой. Сократи историю или раздели материал перед новой подготовкой.');
  const stageDirectory=path.join(jobsDirectory,job.id,`attempt-${job.attempt}`,stage);fs.mkdirSync(stageDirectory,{recursive:true});
  writeJson(path.join(stageDirectory,stage+'-input.json'),{prompt});
  const role=effortRoleForStage(stage,!!job.programRequest),effort=effortForTask(role,readAiEfforts());
  job.stageEfforts={...job.stageEfforts,[stage]:effort};delete job.providerBlocked;saveJob(job);
  let result;
  if(fixtureProvider)result=await fixtureProvider({stage,role,effort,job:clone(job),prompt,schema:clone(schema)});
  else if(provider==='file'){
   const file=path.join(root,'fixtures',job.id,stage+'.json');if(!fs.existsSync(file))throw Error('Для тестового режима не подготовлен ответ этапа '+stage+'.');result=readJson(file);
  }else if(provider==='codex'){
   if(!executable)throw Error('Локальный Codex не найден. Проверь установку и вход в аккаунт.');
   // Each independent agent starts in a fresh directory containing no author
   // answers or prior-stage prompts. Read-only is not an OS-level read boundary.
   const reservation=control.reserve({kind:'lesson-'+stage});delete job.budgetBlocked;delete job.providerBlocked;activeReservations.set(reservation.id,reservation);let settled=false;
   const isolated=fs.mkdtempSync(path.join(os.tmpdir(),'guild-learning-'+stage+'-'));
   try{
    const statusFile=path.join(isolated,'status.json'),resultFile=path.join(isolated,'result.json');
    const child=startCodexReview({executable,prompt,effort,schema,schemaFile:path.join(isolated,'schema.json'),resultFile,statusFile,cwd:isolated,timeoutMs:limits[stage],noTools:true,jsonEvents:true});
    runningChildren.add(child);
    await new Promise(resolve=>{child.once('error',resolve);child.once('close',resolve);});runningChildren.delete(child);
    if(closed)throw Error('Приложение остановлено.');
    const status=readJson(statusFile);control.settle(reservation,{usage:status?.telemetry?.usage,status:status?.status});settled=true;activeReservations.delete(reservation.id);writeJson(path.join(stageDirectory,'provider-status.json'),status);if(status?.status!=='complete')throw Object.assign(Error(status?.error||'Codex не завершил подготовку.'),{code:status?.code});
    if(fs.statSync(resultFile).size>700000)throw Error('Ответ Codex слишком велик.');result=readJson(resultFile);
   }finally{if(!settled&&activeReservations.has(reservation.id)){control.settle(reservation,{status:'failed'});activeReservations.delete(reservation.id);}fs.rmSync(isolated,{recursive:true,force:true});}
  }else throw Error('Автоматическая подготовка выключена в настройках приложения.');
  assertActive(job);
  if(stage==='personalize'&&result&&typeof result==='object'&&!Object.hasOwn(result,'aboutUpdates'))result.aboutUpdates=[];
  if(stage==='generate'){job.lastGenerated=result;saveJob(job);}
  assertJsonShape(result,schema);writeJson(path.join(stageDirectory,stage+'-result.json'),result);job.checkpoints||={};job.checkpoints[stage]={result:clone(result),inputDigest,completedAt:now()};saveJob(job);return result;
 }
 function updatePersonalization(job,response){
  assertJsonShape(response,personalizationSchema);
  const profile=personalization(),known=new Map(job.evidence.feedback.map(item=>[item.id,item]));
  const attributed=item=>item.evidenceIds.length>0&&item.evidenceIds.every(id=>known.has(id)&&!known.get(id).skipped&&!known.get(id).staleContent&&known.get(id).text?.trim());
  if(response.preferences.some(rule=>!attributed(rule)||!rule.rule.trim()||rule.rule.length>500)||response.aboutUpdates.some(item=>!attributed(item)||item.value.length>1600)||response.sharedProposals.some(rule=>!attributed(rule)||!rule.text.trim()||rule.text.length>500))throw Error('Предпочтения не подтверждены содержательными отзывами.');
  if(new Set(response.aboutUpdates.map(item=>item.field)).size!==response.aboutUpdates.length)throw Error('Для одного поля профиля предложено несколько несовместимых изменений.');
  if(governance?.proposeChanges){
   for(const rule of response.preferences)for(const id of rule.supersedesIds){const previous=profile.rules.find(item=>item.id===id);if(!previous||previous.category!==rule.category)throw Error('Нельзя заменить неизвестное пожелание или пожелание другой категории.');}
   // Shared ideas remain unapproved candidates. Their independent review and
   // explicit local promotion are separate from personal-profile consent.
   if(response.sharedProposals.length&&!job.sharedCandidatesRecorded){
    for(const proposal of response.sharedProposals){const id='proposal-'+digest(proposal.text.trim()).slice(0,16),existing=profile.sharedProposals.find(item=>item.id===id);if(existing){existing.evidenceIds=[...new Set([...existing.evidenceIds,...proposal.evidenceIds])];existing.status='needs-independent-review';}else profile.sharedProposals.push({id,text:proposal.text.trim(),evidenceIds:proposal.evidenceIds,status:'needs-independent-review',supportingProfiles:1,createdAt:now()});}
    savePersonalization(profile);job.sharedCandidatesRecorded=true;
   }
   const proposal=governance.proposeChanges({id:'personalization-'+job.id,jobId:job.id,preferences:response.preferences.map(rule=>({text:rule.rule,category:rule.category,evidenceIds:rule.evidenceIds,supersedesIds:rule.supersedesIds})),aboutUpdates:response.aboutUpdates,observations:job.evidence.feedback});
   job.personalizationProposalId=proposal.id;job.personalizationVersion=profile.version;
   if(proposal.status==='pending'&&proposal.changes.length){job.status='awaiting-consent';job.stage='awaiting-consent';job.summary='Проверь предложенные изменения профиля. Продолжение будет подготовлено после твоего выбора.';saveJob(job);return null;}
   job.personalizationApplied=true;saveJob(job);return personalization();
  }
  if(profile.history.some(entry=>entry.jobId===job.id&&entry.applied))return profile;
  const added=[],superseded=[];
  for(const rule of response.preferences){
   for(const supersedes of rule.supersedesIds){const previous=profile.rules.find(item=>item.id===supersedes);if(!previous||previous.category!==rule.category)throw Error('Нельзя отменить неизвестное предпочтение или правило другой категории.');}
   const text=rule.rule.trim(),id='preference-'+digest({text,category:rule.category}).slice(0,16),existing=profile.rules.find(item=>item.id===id);
   if(existing){existing.evidenceIds=[...new Set([...existing.evidenceIds,...rule.evidenceIds])];existing.lastSeenAt=now();existing.status='active';delete existing.supersededBy;delete existing.unsupportedAt;}
   else{profile.rules.push({id,category:rule.category,text,evidenceIds:rule.evidenceIds,status:'active',source:'explicit-feedback',createdAt:now(),lastSeenAt:now()});added.push(id);}
   for(const supersedes of rule.supersedesIds)if(supersedes!==id){const previous=profile.rules.find(item=>item.id===supersedes);previous.status='superseded';previous.supersededBy=id;superseded.push(supersedes);}
  }
  for(const proposal of response.sharedProposals){const id='proposal-'+digest(proposal.text.trim()).slice(0,16),existing=profile.sharedProposals.find(item=>item.id===id);if(existing){existing.evidenceIds=[...new Set([...existing.evidenceIds,...proposal.evidenceIds])];existing.status='needs-independent-review';}else profile.sharedProposals.push({id,text:proposal.text.trim(),evidenceIds:proposal.evidenceIds,status:'needs-independent-review',supportingProfiles:1,createdAt:now()});}
  profile.version+=1;profile.updatedAt=now();profile.history.push({version:profile.version,jobId:job.id,applied:true,addedRuleIds:added,supersededRuleIds:superseded,summary:response.summary,at:now()});
  savePersonalization(profile);job.personalizationVersion=profile.version;job.personalizationApplied=true;saveJob(job);return personalization();
 }
 function recordIntake(job){
  const profile=personalization(),sourceKey=item=>(item.kind==='task'?'task:'+item.taskId:item.kind==='program'?'program:'+item.id:'lesson:'+item.lessonId)+':author:'+(item.author?.id||'unknown');
  const latest=new Map();
  for(const item of job.evidence.feedback)latest.set(sourceKey({...item,lessonId:job.lessonId}),item.id);
  for(const previous of profile.observations)if(latest.has(sourceKey(previous))&&latest.get(sourceKey(previous))!==previous.id){previous.status='superseded';previous.supersededBy=latest.get(sourceKey(previous));}
  for(const item of job.evidence.feedback){const existing=profile.observations.find(previous=>previous.id===item.id);if(existing){existing.status='active';delete existing.supersededBy;}else profile.observations.push({...item,lessonId:job.lessonId,status:'active',source:'explicit-local-feedback',identity:item.author?.id||'unconfirmed',observedAt:now()});}
  const supported=new Set(profile.observations.filter(item=>item.status!=='superseded'&&!item.skipped&&item.text?.trim()).map(item=>item.id)),withdrawn=[],withdrawnProposals=[];
  for(const rule of profile.rules)if(rule.status==='active'&&rule.source==='explicit-feedback'&&rule.evidenceIds.length&&!rule.evidenceIds.some(id=>supported.has(id))){rule.status='unsupported';rule.unsupportedAt=now();withdrawn.push(rule.id);}
  for(const proposal of profile.sharedProposals)if(proposal.status==='needs-independent-review'&&proposal.evidenceIds.length&&!proposal.evidenceIds.some(id=>supported.has(id))){proposal.status='unsupported';withdrawnProposals.push(proposal.id);}
  if(withdrawn.length||withdrawnProposals.length){profile.version+=1;profile.updatedAt=now();profile.history.push({version:profile.version,jobId:job.id,phase:'source-supersession',applied:false,unsupportedRuleIds:withdrawn,unsupportedProposalIds:withdrawnProposals,summary:'Прежний отзыв исправлен или отозван; неподтверждённые им правила больше не применяются.',at:now()});job.personalizationVersion=profile.version;}
  savePersonalization(profile);
 }
 function makeOverlay(job,artifacts,reusedBranches=[]){
  const overlay=emptyOverlay(),map=readCourse().engineConfig.courseMap;
  const sourcePoint=map.points.find(point=>point.lessonId===job.lessonId)||map.points.find(point=>point.id===job.sourcePointId)||loadOverlay().points.find(point=>point.lessonId===job.lessonId)||map.start;
  const practiceArtifact=artifacts.find(artifact=>artifact.branch!=='next'),practicePointId=practiceArtifact?'point-'+practiceArtifact.lesson.id:reusedBranches.find(branch=>branch.kind!=='next')?.pointId||null;
  for(const [index,artifact]of artifacts.entries()){
   const {lesson,tasks,branch}=artifact,reusedPoint=branch==='next'&&job.nextTopic.pointId?map.points.find(point=>point.id===job.nextTopic.pointId):null,pointId=reusedPoint?.id||'point-'+lesson.id;
   const point={id:pointId,kind:branch==='next'?(artifact.kind==='exam'?'statue':'teleport'):'repair',region:reusedPoint?.region||sourcePoint.region||map.regions[0]?.id,lessonId:lesson.id,name:lesson.title,summary:lesson.subtitle,x:reusedPoint?.x??Math.max(4,Math.min(96,sourcePoint.x+(branch==='next'?9:-9))),y:reusedPoint?.y??Math.max(6,Math.min(94,sourcePoint.y+(branch==='next'?-12:12))),...(branch!=='next'?{topic:sourcePoint.id,recommended:true}:{}),adaptive:true};
   overlay.lessons.push(lesson);overlay.tasks.push(...tasks);overlay.points.push(point);overlay.routes.push({from:sourcePoint.id,to:pointId});
   overlay.rewardGroups.push({id:lesson.id,kind:lesson.type==='repair'?'repair':'lesson',taskIds:lesson.taskIds,reward:lesson.reward,completedTopics:[pointId],visitedPoints:[pointId]});
   // Practice is a recommendation and a separate branch, not an automatic new gate.
   overlay.pointPrerequisites[pointId]=branch==='next'&&!job.decision.practice?sourcePoint.id:null;
   for(const task of tasks){overlay.qualityCaps[task.id]=task.qualityCap;overlay.taskTopics[task.id]=[];}
   if(branch!=='next')overlay.repairPoints.push(point);
   overlay.presentation.points[pointId]={summary:lesson.subtitle,practice:lesson.subtitle,title:lesson.title};
  }
  return overlay;
 }
 function assertEvidenceCurrent(job){for(const source of job.evidence.tasks){const currentVersion=readContentVersion(source.id);if(currentVersion&&(source.contentVersion||null)!==currentVersion)throw Error('Урок обновился после отправки. Проверь сохранённый код на новых тестах и отправь урок заново; прежняя работа сохранена.');}}
 async function run(job){
  try{assertActive(job);assertBudgetOpen();assertEvidenceCurrent(job);
   const standard=readStandard();
   job.status='running';job.stage='personalizing';delete job.error;saveJob(job);recordIntake(job);
   const profile=job.personalizationApplied?personalization():updatePersonalization(job,await ask('personalize',job,personalizationPrompt({evidence:job.evidence,previous:previousForModel()}),personalizationSchema));
   if(!profile)return;
   const profileDigest=digest(generationProfile(profile));
   if(job.generationProfileDigest&&job.generationProfileDigest!==profileDigest){delete job.checkpoints?.generate;delete job.checkpoints?.review;delete job.authorAudits;delete job.lastGenerated;}
   job.generationProfileDigest=profileDigest;
   if(job.personalizationApplied&&!job.personalizationVersion)job.personalizationVersion=profile.version;
   job.decision=job.programRequest?{...decideLearningPath(job.evidence),practice:job.programRequest.kind,certainty:'learner-request',rationale:'По твоей просьбе подготовим отдельную практику перед исходным уроком.'}:decideLearningPath(job.evidence);job.stage='planning';saveJob(job);
   const overlayBefore=loadOverlay(),allLessons=[...readCourse().lessons,...overlayBefore.lessons],allPoints=[...readCourse().engineConfig.courseMap.points,...overlayBefore.points];
   const existingLesson=allLessons.find(lesson=>lesson.id===job.nextTopic?.lessonId||lesson.adaptiveTopicId===job.nextTopic?.id);
   if(job.practiceSubmission&&!job.programRequest){finishPracticeSubmission(job,allLessons,allPoints);return;}
   if(!job.programRequest&&!job.nextTopic)throw Error('В roadmap пока не указана следующая тема. Предпочтения уже сохранены; нужно дополнить программу курса.');
   if(!job.programRequest&&(job.nextTopic.requiresRuntime||job.nextTopic.runtime!==course.manifest.runtime))throw Error('Для следующей темы нужен другой проверенный исполнитель. Предпочтения сохранены, установка библиотек автоматически не выполняется.');
   const desired=job.curriculumTarget?['next']:job.programRequest?[job.programRequest.kind]:['next',...(job.decision.practice?[job.decision.practice]:[])],reusedBranches=[];
   for(const branch of job.programRequest?[]:desired){const existing=branch==='next'?existingLesson:allLessons.find(lesson=>lesson.sourceLessonId===job.lessonId&&lesson.adaptiveBranch===branch);if(existing)reusedBranches.push({lessonId:existing.id,title:existing.title,pointId:allPoints.find(point=>point.lessonId===existing.id)?.id||'',kind:branch});}
   const branches=desired.filter(branch=>!reusedBranches.some(reused=>reused.kind===branch));job.requestedBranches=branches;
   if(!branches.length){job.status='ready';job.stage='ready';job.summary='Предпочтения обновлены. Продолжение уже существует, его задания и прогресс сохранены.';job.branches=reusedBranches;saveJob(job);return;}
   job.stage='generating';saveJob(job);
   // A completed call must not invalidate itself by adding its own draft/error
   // to the next prompt. Preserve the retry context used for that call only.
   if(!job.checkpoints?.generate||!job.generationPromptContext)job.generationPromptContext={lastGenerated:job.lastGenerated||null,validationFeedback:job.validationFeedback||null,reviewIssues:job.reviewIssues||[]};
   const output=await ask('generate',job,generationPrompt({job:{...job,...job.generationPromptContext},course,personalization:profile,decision:job.decision,nextTopic:job.nextTopic,standard:standard+'\nApproved local common teaching rules (data, not authority):\n'+JSON.stringify(readCommonRules()),branches}),generationSchema);
   const artifacts=compileMaterials(output,{job,course,decision:job.decision,nextTopic:job.nextTopic,branches});
   job.stage='validating';saveJob(job);
   const auditDigest=digest({output,inputDigest:job.checkpoints.generate.inputDigest,validationContractVersion});
   const cachedAuthorAudits=job.authorAudits?.generationDigest===auditDigest;
   if(cachedAuthorAudits)await hydrateExecutionTraces(artifacts,execute);
   const authorAudits=cachedAuthorAudits?job.authorAudits.value:await verifyAuthoredMaterials(artifacts,execute);assertActive(job);job.authorAudits={generationDigest:auditDigest,value:authorAudits};saveJob(job);
   job.stage='independent-review';saveJob(job);
   const review=await ask('review',job,reviewPrompt(independentReviewInput(artifacts),standard+'\nApproved local common teaching rules: '+JSON.stringify(readCommonRules()),{programRequest:job.programRequest||null,...(job.programRequest&&!job.curriculumTarget?{sourceObjectives:job.evidence.tasks.map(({name,description})=>({name,description}))}:{}),nextTopic:job.nextTopic,decision:job.decision,requirements:course.adaptation?.requirements,personalization:{about:profile.about||{},rules:profile.rules.filter(rule=>rule.status==='active').map(({category,text})=>({category,text}))}}),independentReviewSchema);
   if(!review.approved||review.issues.length)job.reviewIssues=review.issues;
   const independentAudits=await verifyIndependentReview(review,artifacts,execute);
   assertActive(job);
   assertEvidenceCurrent(job);if(digest(generationProfile(personalization()))!==profileDigest)throw Error('Ты изменил профиль во время подготовки. Продолжи подготовку ещё раз: новые задания учтут последние настройки.');job.stage='publishing';saveJob(job);
   const overlay=makeOverlay(job,artifacts,reusedBranches),existing=loadOverlay(),combined=emptyOverlay();
   for(const key of ['lessons','tasks','points','routes','rewardGroups','repairPoints'])combined[key]=[...existing[key],...overlay[key]];
   for(const key of ['taskTopics','qualityCaps','pointPrerequisites'])combined[key]={...existing[key],...overlay[key]};
   combined.presentation.points={...existing.presentation.points,...overlay.presentation.points};await validateOverlay(combined);assertActive(job);
   job.branches=[...reusedBranches,...artifacts.map(artifact=>({lessonId:artifact.lesson.id,pointId:overlay.points.find(point=>point.lessonId===artifact.lesson.id).id,title:artifact.lesson.title,kind:artifact.branch}))];
   writeJson(path.join(publishedDirectory,job.id+'.json'),{schemaVersion:1,courseId:course.id,sourceLessonId:job.lessonId,jobId:job.id,createdAt:now(),branches:job.branches,overlay,audits:{author:authorAudits,independent:independentAudits}});
   job.status='ready';job.stage='ready';job.summary=job.programRequest?'Отдельная практика готова. Исходный урок и его результаты сохранены.':job.decision.practice?'Готовы следующая тема и отдельная ветка практики.':'Следующая тема готова.';saveJob(job);
  }catch(error){if(!closed){if(!['GUILD_PROVIDER_LIMIT','GUILD_UNSUPPORTED_EFFORT','GUILD_BUDGET_LIMIT'].includes(error.code)&&(['generating','validating'].includes(job.stage)||(job.stage==='independent-review'&&(job.checkpoints?.review||job.reviewIssues?.length)))){delete job.checkpoints?.generate;delete job.checkpoints?.review;delete job.authorAudits;}job.budgetBlocked=error.code==='GUILD_BUDGET_LIMIT';job.providerBlocked=['GUILD_PROVIDER_LIMIT','GUILD_UNSUPPORTED_EFFORT'].includes(error.code);job.status=cancelled.has(job.id)?'cancelled':'failed';job.error=String(error.message||error).slice(0,1000);job.validationFeedback=job.error;job.stage=cancelled.has(job.id)?'cancelled':'failed';saveJob(job);}}finally{running=null;}
 }
 async function submit({lessonId,feedback={},requestId,author}={}){
  if(closed)throw Error('Приложение остановлено.');
  if(provider==='off')throw Error('Автоматическая подготовка выключена в настройках приложения.');
  if(typeof requestId!=='undefined'&&(typeof requestId!=='string'||requestId.length>120||!/^[a-zA-Z0-9_.:-]+$/.test(requestId)))throw Error('Некорректный номер отправки.');
  const lessons=[...readCourse().lessons,...loadOverlay().lessons],lesson=lessons.find(lesson=>lesson.id===lessonId);if(!lesson)throw Error('Урок не найден.');
  if(!course.adaptation?.roadmap?.length)throw Error('Для этого курса ещё не настроено автоматическое продолжение roadmap.');
  const cleanFeedback=validateLessonFeedback(feedback),evidence=collectEvidence(lesson,cleanFeedback,author);
  if(!evidence.tasks.some(task=>task.status!=='unknown'))throw Error('Перед отправкой урока проверь хотя бы одно решение на тестах.');
  const fingerprint=digest({lessonId,evidence}),jobs=loadJobs();
  if(requestId){const sameRequest=jobs.find(job=>job.requestId===requestId);if(sameRequest&&sameRequest.fingerprint!==fingerprint)throw Error('Этот номер отправки уже относится к другой версии работы.');}
  const same=jobs.find(job=>job.fingerprint===fingerprint);
  if(same?.status==='ready')return publicJob(same);
  if(same&&(activeStatuses.has(same.status)||same.status==='awaiting-consent'))return publicJob(same);
  if(running)throw Error('Сейчас готовится продолжение другого отправленного урока. Дождись результата.');
  if(same&&!canResumeJob(same))return publicJob(same);
  const {source,topic,practiceSubmission,originLessonId}=nextFor(lesson);
  const job=same||{schemaVersion:1,id:crypto.randomBytes(12).toString('hex'),materialKey:digest({courseId:course.id,lessonId}).slice(0,18),lessonId,sourceTopicId:lesson.adaptiveTopicId||source?.id||lessonId,sourcePointId:source?.pointId||null,requestId:requestId||null,fingerprint,evidence,nextTopic:topic||null,createdAt:now(),attempt:0};
  job.practiceSubmission=practiceSubmission;job.originLessonId=originLessonId;
  if(same)job.nextTopic=topic||null;
  if(same?.error&&!job.validationFeedback)job.validationFeedback=same.error;
  cancelled.delete(job.id);if(job.interrupted){job.recoveryCount=(job.recoveryCount||0)+1;job.interrupted=false;}else if(!job.budgetBlocked&&!job.providerBlocked)job.attempt+=1;job.status='pending';job.stage='queued';delete job.error;saveJob(job);
  running=job.id;queueMicrotask(()=>run(job));return publicJob(job);
 }
 async function requestProgram({lessonId,message,kind='reinforcement',requestId,author,curriculumTarget}={}){
  if(closed)throw Error('Приложение остановлено.');
  if(provider==='off')throw Error('Подготовка уроков выключена. Включи её в настройках приложения.');
  if(!course.adaptation?.roadmap?.length)throw Error('Для этого курса ещё не настроена подготовка программы.');
  if(typeof message!=='string'||!message.trim()||message.trim().length>3000)throw Error('Напиши пожелание к программе, до 3000 символов.');
  if(!['reinforcement','repair'].includes(kind))throw Error('Выбери простую версию или короткую практику.');
  if(requestId!==undefined&&(typeof requestId!=='string'||requestId.length>120||!/^[a-zA-Z0-9_.:-]+$/.test(requestId)))throw Error('Некорректный номер запроса.');
  const lesson=[...readCourse().lessons,...loadOverlay().lessons].find(item=>item.id===lessonId);if(!lesson)throw Error('Выбери существующий урок.');
  const evidence=collectEvidence(lesson,{},author);
  // Program messages have their own source identity; they never withdraw an existing task/lesson reflection.
  const request={kind,message:message.trim(),lessonTitle:curriculumTarget?.title||lesson.title,...(curriculumTarget?{curriculumTarget:clone(curriculumTarget)}:{})};
  evidence.feedback=[{id:'program-feedback-'+digest({lessonId,request}).slice(0,18),kind:'program',author:evidence.author,text:request.message}];
  evidence.programRequest=request;
  const fingerprint=digest({type:'program',lessonId,request,evidence}),jobs=loadJobs();
  const duplicate=requestId&&jobs.find(job=>job.requestId===requestId);if(duplicate&&duplicate.fingerprint!==fingerprint)throw Error('Этот номер запроса уже использован для другого сообщения.');
  const same=jobs.find(job=>job.fingerprint===fingerprint);if(same)return publicJob(same);
  if(running)throw Error('Сейчас готовится другой материал. Дождись результата или отмени подготовку.');
  const source=course.adaptation?.roadmap?.find(topic=>topic.lessonId===lessonId||topic.id===lesson.adaptiveTopicId);
  const job={schemaVersion:1,id:crypto.randomBytes(12).toString('hex'),materialKey:fingerprint.slice(0,18),lessonId,sourceTopicId:lesson.adaptiveTopicId||source?.id||lessonId,sourcePointId:source?.pointId||null,requestId:requestId||null,fingerprint,evidence,programRequest:request,nextTopic:curriculumTarget?clone(curriculumTarget):null,...(curriculumTarget?{curriculumTarget:clone(curriculumTarget)}:{}),createdAt:now(),attempt:1,status:'pending',stage:'queued'};
  saveJob(job);running=job.id;queueMicrotask(()=>run(job));return publicJob(job);
 }
 function management(){return {...control.management(),jobs:loadJobs().slice(0,40).map(publicJob),busy:!!running};}
 async function manage(input={}){
  if(input.action==='set-limits')return control.manage(input);
  if(input.action==='archive-raw'){
   if(input.confirm!==true)throw Error('Нужно явное подтверждение очистки старых текстов генерации.');
   const before=Date.now()-control.management().settings.retentionDays*86400000;let removedFiles=0;
   for(const job of loadJobs()){
    if(activeStatuses.has(job.status)||new Date(job.updatedAt).getTime()>=before)continue;
    const base=path.join(jobsDirectory,job.id);if(!fs.existsSync(base))continue;
    for(const attempt of fs.readdirSync(base)){
     if(!/^attempt-\d+$/.test(attempt))continue;
     for(const stage of ['personalize','generate','review']){
      const dir=path.join(base,attempt,stage);
      for(const name of [stage+'-input.json',stage+'-result.json']){
       const candidate=path.join(dir,name);if(fs.existsSync(candidate)){fs.unlinkSync(candidate);removedFiles+=1;}
      }
     }
    }
   }
   return {...management(),removedFiles};
  }
  if(!safeId(input.jobId))throw Error('Неизвестная подготовка урока.');const job=readJson(path.join(jobsDirectory,input.jobId+'.json'));if(!job)throw Error('Подготовка урока не найдена.');
  if(input.action==='confirm-personalization'){
   if(job.personalizationConsentAt&&Array.isArray(input.acceptedIds)&&digest([...input.acceptedIds].sort())===job.personalizationConsentDigest)return management();
   if(job.status!=='awaiting-consent')throw Error('Этот запрос уже обработан или не ожидает согласия.');
   if(running)throw Error('Сейчас готовится другой урок. Дождись завершения.');
   if(!governance?.decideChanges)throw Error('Управление персонализацией не подключено.');
   if(!Array.isArray(input.acceptedIds)||input.acceptedIds.some(id=>typeof id!=='string'))throw Error('Выбери изменения профиля или отклони все.');
   assertEvidenceCurrent(job);
   governance.decideChanges({proposalSetId:job.personalizationProposalId,acceptedIds:input.acceptedIds});
   job.personalizationApplied=true;job.personalizationVersion=personalization().version;job.personalizationConsentAt=now();job.personalizationConsentDigest=digest([...input.acceptedIds].sort());
   // A later manual edit wins. Completed author/reviewer checkpoints must never
   // freeze a profile from before this explicit decision.
   delete job.checkpoints?.generate;delete job.checkpoints?.review;delete job.authorAudits;
   cancelled.delete(job.id);job.status='pending';job.stage='queued';delete job.error;saveJob(job);running=job.id;queueMicrotask(()=>run(job));return management();
  }
  if(input.action==='cancel-job'){if(job.status==='ready')throw Error('Материалы уже готовы; отмена их не удаляет.');if(job.status==='awaiting-consent'&&governance?.decideChanges)governance.decideChanges({proposalSetId:job.personalizationProposalId,acceptedIds:[]});cancelled.add(job.id);if(running===job.id)for(const child of runningChildren){try{child.guildCancel?child.guildCancel():process.platform==='win32'?child.kill('SIGKILL'):process.kill(-child.pid,'SIGKILL');}catch{}}job.status='cancelled';job.stage='cancelled';job.error='Подготовка отменена. Исходная работа и готовые материалы сохранены.';saveJob(job);return management();}
  if(input.action!=='resume-job')throw Error('Неизвестное действие с подготовкой урока.');if(running)throw Error('Уже готовится другой урок.');if(job.status==='ready')return management();if(!canResumeJob(job))throw Error('Лимит повторных попыток или восстановления исчерпан.');cancelled.delete(job.id);if(job.interrupted){job.recoveryCount=(job.recoveryCount||0)+1;job.interrupted=false;}else if(!job.budgetBlocked&&!job.providerBlocked)job.attempt+=1;job.status='pending';job.stage='queued';delete job.error;saveJob(job);running=job.id;queueMicrotask(()=>run(job));return management();
 }
 queueMicrotask(()=>{try{if(closed||running||!generationControl||provider!=='codex'||!control.management().settings.autoResume)return;const id=interrupted.find(value=>{const job=readJson(path.join(jobsDirectory,value+'.json'));return canResumeJob(job);});if(id)manage({action:'resume-job',jobId:id}).catch(()=>{});}catch{/* Invalid local settings stop recovery; API reports the configuration error. */}});
 function close(){closed=true;for(const reservation of activeReservations.values())control.settle(reservation,{status:'failed'});activeReservations.clear();for(const child of runningChildren){try{child.guildCancel?child.guildCancel():process.platform==='win32'?child.kill('SIGKILL'):process.kill(-child.pid,'SIGKILL');}catch{}}}
 return {submit,requestProgram,getStatus,snapshot,loadOverlay,management,manage,close,whenIdle:async()=>{while(running)await new Promise(resolve=>setTimeout(resolve,10));}};
}
