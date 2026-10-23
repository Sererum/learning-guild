import {taskFeedbackTemplate,saveTaskFeedback} from './feedback.mjs';
import http from 'node:http';
import {createBrowserState} from './browser-state.mjs';
import fs from 'node:fs';
import {aiRoles,aiEffortLabels} from './ai-policy.mjs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createEngine} from './shared/engine-core.mjs';
import defaultCourse from './shared/blank-course.mjs';
import {loadCourse,validateCourse} from './course-loader.mjs';
import {readLocalConfig,resolveCourseSettings,profileStateFile,validateProfileId,bindProfile,acquireProfileLock,findPython312} from './local-config.mjs';
import {createReviewBridge,codeHash,proposedRubric} from './review.mjs';
import {publicTestResult,caseDetails} from './test-cases.mjs';
import {browserRulesSource} from './browser-source.mjs';
import {createLearningService} from './adaptation/service.mjs';
import {withLearningOverlay} from './learning-course.mjs';
import {createProfileGovernance} from './profile-governance.mjs';
import {createContentVersions} from './content-versions.mjs';
import {createGenerationControl} from './generation-control.mjs';
import {buildPythonLaunch,getExecutionCapabilities} from './execution-sandbox.mjs';
import {executeGeneratedPython} from './adaptation/runtime.mjs';
import {createSharedStandards} from './shared-standards.mjs';
import {loadCourseProfile} from './shared/course-profile.mjs';
import {withProfileAssets,readProfileAsset,isPrivatePortraitAsset} from './shared/profile-assets.mjs';
import {diagnosePython} from './python-diagnostics.mjs';
import {createProgramService} from './program-service.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
export function moscowDay(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function runPython(task,code,python,{executionMode='isolated'}={}){return new Promise(resolve=>{
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'learning-guild-'));
 let launch;try{launch=buildPythonLaunch({python,script:path.join(root,'runner.py'),cwd,mode:executionMode});}catch(error){fs.rmSync(cwd,{recursive:true,force:true});resolve({ok:false,infrastructureError:true,error:error.message});return;}
 const child=spawn(launch.command,launch.args,launch.options);
 let out='',err='',done=false;
 function finish(result){if(done)return;done=true;clearTimeout(timer);fs.rmSync(cwd,{recursive:true,force:true});resolve(result);}
 function stop(){try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL');}catch{}}
 const timer=setTimeout(()=>{stop();finish({ok:false,error:'Ячейка остановлена через 3 секунды. Проверь, меняется ли переменная условия и приближается ли она к остановке.'});},3000);
 child.on('error',e=>finish({ok:false,infrastructureError:true,error:'Не удалось запустить Python: '+e.message}));
 child.stdout.on('data',b=>{out+=b.toString();if(out.length>200000){stop();finish({ok:false,error:'Слишком много вывода. Проверь цикл.'});}});
 child.stderr.on('data',b=>{if(err.length<6000)err+=b.toString();});
 child.on('close',()=>{try{finish(JSON.parse(out));}catch{finish({ok:false,error:err||'Python завершился без результата.'});}});
 child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({code,mode:task.mode,tests:task.tests,constraints:task.constraints}));
});}
export function publicCourseTasks(tasks,revealed={},qualityCaps) {
 const fields=new Set(['id','name','description','starter','hints','minutes','tag','materials','qualityCap','reward','section','repairLessonId','repairTopic','statement','answerExamples','constraints']);
 return tasks.map(source=>{const {tests}=source,task=Object.fromEntries(Object.entries(source).filter(([key])=>fields.has(key)));return {...task,...(qualityCaps?{qualityCap:qualityCaps[task.id]??0}:{}),
   scenarios:tests.map(test=>test.label),cases:tests.map((_,index)=>caseDetails(source,index,revealed))};});
}
export function createGuildServer({course=defaultCourse,profileId='default',stateFile=profileStateFile(course.id,profileId),python=findPython312(process.env.GUILD_PYTHON),importHistory=true,reviewProvider=process.env.GUILD_REVIEW_MODE||'codex',reviewEnabled=reviewProvider!=='off',reviewRubric=proposedRubric,reviewExecutable,learningProvider=process.env.GUILD_LEARNING_MODE||'codex',learningFixtureProvider,learningExecutable=reviewExecutable,learningTimeoutMs,learningExecutePython,programFixtureProvider,sharedDirectory,sharedReviewProvider=reviewProvider,sharedReviewFixture,sharedPreferences,accountContext}={}){
 validateProfileId(profileId);course=loadCourseProfile(course,{stateFile,profileId});validateCourse(course);
 const baseCourse=course;
 let engine=createEngine(course),{initialState,normalizeState,importCourseHistory,act,claim,claimQuality,canStudyGate,catalog,banners,courseMap}=engine;
 let {tasks,lessons,repairPoints=[]}=course;
 bindProfile(stateFile,course.id,profileId);
 const releaseProfile=acquireProfileLock(stateFile);
 try {
 const existingSave=fs.existsSync(stateFile);
 let state=initialState();if(existingSave){state=JSON.parse(fs.readFileSync(stateFile,'utf8'));if(state.version!==1)throw Error('Неподдерживаемая версия сохранения');normalizeState(state);}
 const directory=path.dirname(stateFile),governance=createProfileGovernance({directory,courseId:course.id,profileId,sharedPreferences}),generationControl=createGenerationControl(directory,{readAiEfforts:()=>governance.settings().aiEfforts}),browserState=createBrowserState(directory,course.id+':'+profileId);
 const seedFile=path.join(directory,'personalization-seed.json');
 if(fs.existsSync(seedFile))governance.importSeed(JSON.parse(fs.readFileSync(seedFile,'utf8')));
 const learner=()=>({...governance.resolveLearner(),name:state.name||course.manifest.learnerName||'Ученик'});
 const executionFile=path.join(directory,'execution-settings.json');
 const executionMode=()=>fs.existsSync(executionFile)?JSON.parse(fs.readFileSync(executionFile,'utf8')).mode||'isolated':'isolated';
 const reviewer=createReviewBridge(path.join(directory,'reviews'),{enabled:reviewEnabled,rubric:reviewRubric,provider:reviewProvider,executable:reviewExecutable,generationControl,readAiEfforts:()=>governance.settings().aiEfforts,tutor:{courseId:course.id,subject:course.manifest.subject||'Python',learnerName:state.name||course.manifest.learnerName}});
 const token=crypto.randomBytes(24).toString('hex');let running=false,diagnosing=false;
 function persist(){fs.mkdirSync(path.dirname(stateFile),{recursive:true});fs.writeFileSync(stateFile+'.tmp',JSON.stringify(state,null,2),{mode:0o600});fs.renameSync(stateFile+'.tmp',stateFile);}
 if(importHistory){const before=JSON.stringify(state);importCourseHistory(state,{awardRewards:false});if(JSON.stringify(state)!==before)persist();}
 const readChecked=taskId=>{const file=path.join(path.dirname(stateFile),'checks',taskId+'.json');return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;};
 const versions=createContentVersions({directory,readCourse:()=>course,readState:()=>state,readChecked});versions.reconcile();
 const currentState=()=>versions.effectiveState(state),currentChecked=id=>versions.isCurrentProof(id,state.testProofs?.[id])?readChecked(id):null;
 let standards=null;
 const learning=createLearningService({directory,course:baseCourse,readCourse:()=>course,readCurriculum:options=>program.curriculum(options),readState:currentState,readChecked:currentChecked,readContentVersion:versions.versionForTask,python,governance,generationControl,readCommonRules:()=>standards?.activeRules()||[],
  provider:learningProvider,fixtureProvider:learningFixtureProvider,executable:learningExecutable,timeoutMs:learningTimeoutMs,executePython:learningExecutePython||((input)=>executeGeneratedPython({...input,python,executionMode:executionMode()})),
  validateOverlay:overlay=>withLearningOverlay(baseCourse,overlay)});
 const program=createProgramService({directory,courseId:course.id,profileId,readCourse:()=>course,readState:currentState,learning,generationControl,readAiEfforts:()=>governance.settings().aiEfforts,readPreferences:()=>({about:governance.snapshot().about,rules:governance.snapshot().personalization.preferences.filter(r=>r.status==='active').map(r=>r.text)}),provider:learningProvider,executable:learningExecutable,fixtureProvider:programFixtureProvider});
 const personalNames=[course.manifest.learnerName,...governance.settings().authors.map(author=>author.name)].filter(Boolean);
 const localSharedDirectory=sharedDirectory||(!path.relative(root,path.resolve(stateFile)).startsWith('..')?path.join(root,'local-data','shared'):path.join(directory,'shared-rules'));
 standards=createSharedStandards({directory:localSharedDirectory,profileScope:course.id+':'+profileId,readProposals:()=>governance.snapshot().personalization.sharedProposals,resolveAuthor:learner,resolveLocalOwner:()=>({id:'local-owner',role:'local-owner'}),generationControl,executable:learningExecutable,provider:sharedReviewProvider,reviewFixture:sharedReviewFixture,personalNames,readAiEfforts:()=>governance.settings().aiEfforts});
 let learningRevision='',learningWarning=null;
 function learningSnapshot(){try{return learning.snapshot();}catch(error){learningWarning='Личная история обучения недоступна: '+error.message;return {enabled:false,jobs:[],warning:learningWarning};}}
 function refreshLearningCourse(){
  try{
   const overlay=learning.loadOverlay(),jobs=learningSnapshot().jobs,revision=JSON.stringify({overlay,ready:jobs.filter(job=>job.status==='ready').map(job=>[job.id,job.updatedAt]),claims:state.claims,lessonClaims:state.lessonClaims});
   if(revision!==learningRevision){
    const updated=withLearningOverlay(baseCourse,overlay,jobs,currentState()),nextEngine=createEngine(updated);
    course=updated;engine=nextEngine;
    ({initialState,normalizeState,importCourseHistory,act,claim,claimQuality,canStudyGate,catalog,banners,courseMap}=engine);
    ({tasks,lessons,repairPoints=[]}=course);learningRevision=revision;
    versions.reconcile();
   }
   learningWarning=null;
  }catch(error){learningWarning='Личные материалы не подключены: '+error.message;}
 }
 function settingsSnapshot(){return {ai:{roles:aiRoles,effortLabels:aiEffortLabels},profile:governance.snapshot(),generation:{...generationControl.management(),...learning.management?.()},shared:standards?.snapshot()||{proposals:[],activeRules:[],history:[]},versions:versions.snapshot(),execution:{mode:executionMode(),capabilities:getExecutionCapabilities({python})}};}
 async function settingsAction(input){
  const affectsPreferences=input.area==='profile'||input.area==='generation'&&input.action==='confirm-personalization';
  if(accountContext&&affectsPreferences){const sharing=accountContext.sharing();const changes=input.action!=='decide-changes'&&input.action!=='confirm-personalization'||input.acceptedIds?.length;if(changes){if(input.sharedProfileId!==sharing.id)throw Error('Связь профиля изменилась. Обновите страницу.');if(input.sharedRevision!==sharing.revision)throw Error('Настройки изменились. Обновите страницу перед сохранением.');if(sharing.courses.length>1&&(input.confirmShared!==true||JSON.stringify([...(input.sharedCourseIds||[])].sort())!==JSON.stringify(sharing.courses.map(c=>c.id).sort())))throw Error('Подтвердите изменение общего профиля для всех связанных курсов.');}}
  if(input.area==='browser-state'){if(input.action!=='save')throw Error('Неизвестное действие для черновиков.');browserState.save(input);return {message:'Черновики сохранены в локальном профиле.'};}
  if(input.area==='profile'){if(['set-author','add-author','update-author'].includes(input.action))throw Error('Отзывы оставляет ученик. Выбор автора больше не требуется.');const result=governance.act(input);personalNames.splice(0,personalNames.length,...[course.manifest.learnerName,...governance.settings().authors.map(author=>author.name)].filter(Boolean));return result;}
  if(input.area==='generation')return input.action==='set-limits'?generationControl.manage(input):await learning.manage(input);
  if(input.area==='shared'){if(!standards)throw Error('Общие правила пока недоступны.');return await standards.act(input);}
  if(input.area==='execution'){
   if(input.action!=='set-mode'||!['isolated','trusted-local'].includes(input.mode))throw Error('Выберите режим запуска кода.');
   if(input.mode==='trusted-local'&&input.confirm!==true)throw Error('Подтверди последствия доверенного запуска.');
   const next={mode:input.mode,updatedAt:new Date().toISOString(),author:{id:'local-owner',role:'local-owner'}};fs.writeFileSync(executionFile+'.tmp',JSON.stringify(next,null,2),{mode:0o600});fs.renameSync(executionFile+'.tmp',executionFile);return {message:'Режим запуска сохранён.'};
  }
  throw Error('Неизвестный раздел настроек.');
 }
 function snapshot(){refreshLearningCourse();versions.reconcile();const programState=program.snapshot(),earnedPresentation={...(course.presentation?.points||{})};for(const n of programState.nodes){if((n.jobId||n.excluded)&&n.pointId)earnedPresentation[n.pointId]={...earnedPresentation[n.pointId],available:n.available};if(n.masteryVia)for(const point of n.pointIds)earnedPresentation[point]={...earnedPresentation[point],phase:'mastered'};if(n.available&&n.prerequisites.some(id=>programState.nodes.find(x=>x.id===id)?.masteryVia)&&n.pointId)earnedPresentation[n.pointId]={...earnedPresentation[n.pointId],available:true};}return {...(accountContext?{account:accountContext.snapshot()}:{}),program:programState,browserState:browserState.snapshot(),contentVersions:versions.snapshot(),settings:settingsSnapshot(),authors:{choices:[learner()],active:learner()},learning:{...learningSnapshot(),...(learningWarning?{warning:learningWarning}:{})},gameRules:course.engineConfig,course:{id:course.id,title:course.manifest.title,subject:course.manifest.subject||'Python',learnerName:state.name||course.manifest.learnerName,profileId,storageScope:course.id+':'+profileId,legacyStorageMigration:!!course.manifest.legacyStorageMigration&&profileId==='default',runtime:course.manifest.runtime,recurringTasks:course.engineConfig.recurringTasks||[]},presentation:{previous:course.engineConfig.pointPrerequisites||{},...(course.presentation||{}),points:earnedPresentation},state:accountContext?accountContext.assets(withProfileAssets(currentState(),stateFile)):withProfileAssets(currentState(),stateFile),catalog,banners,courseMap,repairPoints,feedbackTemplate:taskFeedbackTemplate,lesson:course.notebookLesson||lessons[0],activeLesson:course.activeLesson||lessons[0],lessons,tasks:publicCourseTasks(tasks,state.revealedTests||{},course.engineConfig.qualityCaps||{}),day:moscowDay(),reviewer:{enabled:reviewer.enabled,provider:reviewer.provider,rubric:reviewer.rubric,efforts:reviewer.efforts,defaultEffort:reviewer.defaultEffort,helpDefaultEffort:reviewer.helpDefaultEffort},mode:'local',contractVersion:2};}
 function reply(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
 const server=http.createServer(async(req,res)=>{
   res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
   const host=req.headers.host||'';if(!/^127\.0\.0\.1:\d+$/.test(host)){reply(res,403,{error:'Доступ только через 127.0.0.1'});return;}
   const url=new URL(req.url,'http://'+host);
   if(req.method==='GET'&&(url.pathname==='/api/state'||url.pathname==='/api/settings')){reply(res,200,snapshot());return;}
   if(req.method==='GET'&&url.pathname==='/api/content-archive'){try{refreshLearningCourse();const task=url.searchParams.get('task');if(!tasks.some(item=>item.id===task))throw Error('Задание не найдено.');reply(res,200,{archive:versions.archive(task)});}catch(error){reply(res,400,{error:error.message});}return;}
   if(req.method==='GET'&&url.pathname==='/api/learning-job'){try{const job=learning.getStatus(url.searchParams.get('id'));reply(res,200,{...snapshot(),result:{job}});}catch(error){reply(res,400,{error:error.message});}return;}
   if(req.method==='GET'&&url.pathname==='/rules.js'){
     refreshLearningCourse();const source=browserRulesSource(course.engineConfig);
     res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
     res.end(`(()=>{${source}\nwindow.guildRules={activeBanner,learnedPoints,pointAvailable,visiblePoints,courseHistory,normalizeState,achievements,earnedAchievements,itemPower,power,discoveredZones,pointRevealed,explorationPercent,enhancementTarget,materialOptions,enhancementPlan};})();`);return;
   }
   if(req.method==='POST'&&(url.pathname==='/api/action'||url.pathname==='/api/run'||url.pathname==='/api/execute'||url.pathname==='/api/check'||url.pathname==='/api/diagnostics'||url.pathname==='/api/review-result'||url.pathname==='/api/ai-review'||url.pathname==='/api/reveal-test'||url.pathname==='/api/task-feedback'||url.pathname==='/api/lesson-submit'||url.pathname==='/api/program-request'||url.pathname==='/api/program'||url.pathname==='/api/settings')){
     if(req.headers.origin!=='http://'+host){reply(res,403,{code:'ORIGIN_REJECTED',error:'Запрос пришёл из другой вкладки или источника. Открой урок по его локальному адресу.'});return;}
     if(req.headers['x-guild-token']!==token){reply(res,403,{code:'SESSION_EXPIRED',error:'Сервер был перезапущен. Обнови подключение и повтори действие — код сохранён.'});return;}
     try{
       let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>(url.pathname==='/api/settings'?5*1024*1024:24000))throw Error('Решение слишком длинное');}
       const input=JSON.parse(body);
       if(url.pathname==='/api/diagnostics'){
         if(typeof input.code!=='string'||input.code.length>16000)throw Error('Добавь код размером до 16000 символов.');
         if(diagnosing){reply(res,429,{error:'Проверка записи уже выполняется.'});return;}
         diagnosing=true;try{reply(res,200,await diagnosePython(input.code,python));}finally{diagnosing=false;}return;
       }
       refreshLearningCourse();let result;
       if(url.pathname==='/api/settings'){const result=await settingsAction(input);reply(res,200,{...snapshot(),result});return;}
       if(url.pathname==='/api/program'){if(input.scope!==course.id+':'+profileId)throw Error('Профиль изменился. Обнови страницу.');const result=await program.act(input);reply(res,200,{...snapshot(),result});return;}
       if(url.pathname==='/api/program-request'){if(input.scope!==course.id+':'+profileId)throw Error('Профиль изменился. Обнови страницу: запрос не отправлен.');const job=await learning.requestProgram({lessonId:input.lessonId,message:input.message,kind:input.kind,requestId:input.requestId,author:learner()});reply(res,200,{...snapshot(),result:{job}});return;}
       if(url.pathname==='/api/lesson-submit'){const job=await learning.submit({...input,author:learner()});reply(res,200,{...snapshot(),result:{job}});return;}
       if(url.pathname==='/api/task-feedback'){
         const task=tasks.find(t=>t.id===input.task),lesson=lessons.find(l=>l.id===input.lesson&&l.taskIds.includes(input.task)),proof=currentState().testProofs?.[input.task];
         if(!task||!lesson||!proof||(input.edit!==true&&(typeof input.code!=='string'||proof.codeHash!==codeHash(input.code))))throw Error('Сначала проверь эту версию задания на тестах.');
         const cached=JSON.parse(fs.readFileSync(path.join(path.dirname(stateFile),'checks',task.id+'.json'),'utf8'));
         if(cached.codeHash!==proof.codeHash)throw Error('Результат проверки изменился. Проверь код ещё раз.');
         if(!versions.isCurrentProof(task.id,proof))throw Error('Условие задания обновилось. Проверь решение заново.');
         const previous=state.taskFeedback?.[task.id];if(previous?.length&&!currentState().taskFeedback?.[task.id]?.length){state.taskFeedbackHistory??={};state.taskFeedbackHistory[task.id]=[...(state.taskFeedbackHistory[task.id]||[]),...previous];delete state.taskFeedback[task.id];}
         result=saveTaskFeedback(state,task,lesson,proof,cached.result,{...input,author:learner()});result.feedback=versions.stampTask(task.id,result.feedback);state.taskFeedback[task.id][0]=result.feedback;persist();reply(res,200,{...snapshot(),result});return;
       }
       if(url.pathname==='/api/reveal-test'){const task=tasks.find(t=>t.id===input.task);if(!task||!Number.isInteger(input.index)||input.index<0||input.index>=task.tests.length)throw Error('Тест не найден');state.revealedTests??={};state.revealedTests[task.id]??=[];if(!state.revealedTests[task.id].includes(input.index))state.revealedTests[task.id].push(input.index);persist();const cacheFile=path.join(path.dirname(stateFile),'checks',task.id+'.json');result=fs.existsSync(cacheFile)?publicTestResult(task,JSON.parse(fs.readFileSync(cacheFile,'utf8')).result,state.revealedTests):{revealed:true};}else if(url.pathname==='/api/ai-review'){const task=tasks.find(t=>t.id===input.task);if(!task||typeof input.code!=='string')throw Error('Задание не найдено');const proof=currentState().testProofs?.[task.id];if(!proof||!versions.isCurrentProof(task.id,proof)||proof.codeHash!==codeHash(input.code))throw Error('Сначала проверь эту версию кода на тестах');const cache=JSON.parse(fs.readFileSync(path.join(path.dirname(stateFile),'checks',task.id+'.json'),'utf8'));if(cache.codeHash!==proof.codeHash)throw Error('Проверь код на тестах ещё раз');result={review:reviewer.enqueue({...task,contentVersion:versions.versionForTask(task.id)},input.code,String(input.answer||'').slice(0,3000),publicTestResult(task,cache.result,state.revealedTests||{}),input.effort,input.previousReviewId)};}else if(url.pathname==='/api/review-result'){result=reviewer.read(input.id);if(result.status==='complete'){const proof=currentState().testProofs?.[result.taskId];if(!versions.isCurrentProof(result.taskId,{codeHash:result.codeHash,allPassed:true,contentVersion:result.request?.contentVersion||result.contentVersion}))throw Error('Условие задания изменилось. Проверь текущую версию и запроси новое ревью.');result.bonus=claimQuality(state,result.taskId,result,proof,reviewer.rubric);persist();}}else if(url.pathname==='/api/run'||url.pathname==='/api/execute'||url.pathname==='/api/check'){
         if(running){reply(res,429,{error:'Сначала дождись предыдущей проверки'});return;}
         const execute=url.pathname==='/api/execute';
         const example=typeof input.task==='string'&&input.task.startsWith('example-')?(course.algorithmLesson?.sections||lessons.flatMap(lesson=>lesson.sections)).find(section=>'example-'+section.id===input.task)?.example:null;
         const task=execute?{id:input.task,mode:'execute'}:example?{id:input.task,tests:[{label:'Разобранный пример',inputs:{},expected:{}}]}:tasks.find(t=>t.id===input.task);if(!task)throw Error('Поручение не найдено');
         const rule=course.engineConfig.taskRules?.[task.id]||{};
         if(!(rule.requiresClaims||[]).every(id=>currentState().claims[engine.claimKey(id,moscowDay())]))throw Error(rule.requiresMessage||'Сначала заверши предыдущие задания');
         if(typeof input.code!=='string'||input.code.length>16000)throw Error('Добавь решение размером до 16000 символов');
         running=true;try{result=await runPython(task,input.code,python,{executionMode:executionMode()});if(result.infrastructureError)throw Error(result.error);}finally{running=false;}
         if(result.ok&&!example&&!execute){
           const preview=rule.gate&&!canStudyGate(currentState(),rule.gate);
           if(preview)result.reward={gems:0,preview:true,message:'Проверено в предпросмотре. '+(course.engineConfig.gates?.[rule.gate]?.message||'Сначала заверши предыдущую главу.')};
           else {result.reward=claim(state,task.id,moscowDay(),{completionClaims:currentState().claims});persist();}
         }
         if(url.pathname==='/api/check'){state.testProofs??={};const hash=codeHash(input.code);state.testProofs[task.id]=versions.stampTask(task.id,{codeHash:hash,allPassed:!!result.ok});state.taskAttempts??={};state.taskAttempts[task.id]=[...(state.taskAttempts[task.id]||[]),{codeHash:hash,allPassed:!!result.ok,checkedAt:new Date().toISOString()}].slice(-30);const checksDir=path.join(path.dirname(stateFile),'checks');fs.mkdirSync(checksDir,{recursive:true});fs.writeFileSync(path.join(checksDir,task.id+'.json'),JSON.stringify(versions.stampTask(task.id,{code:input.code,codeHash:hash,result})),{mode:0o600});persist();}if(!execute&&!example)result=publicTestResult(task,result,state.revealedTests||{});
       }else{result=act(state,input,moscowDay(),()=>crypto.randomInt(0,2**32)/2**32);persist();}
       reply(res,200,{...snapshot(),result});
     }catch(e){reply(res,400,{error:e.message});}return;
   }
   if(req.method!=='GET'){reply(res,405,{error:'Метод недоступен'});return;}
   // Only public, versioned cinema files; never read profile media through this route.
   if(/^\/assets\/wish-anime-[345]star-v[3569]\.mp4$/.test(url.pathname)){
     const file=path.join(root,'public',url.pathname.slice(1));if(!fs.existsSync(file)||!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()){reply(res,404,{error:'Анимация не найдена'});return;}
     const size=fs.statSync(file).size,headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'public, max-age=0, must-revalidate'};
     if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);let start=0,end=size-1;
       if(match){if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}else if(match[2])start=Math.max(0,size-Number(match[2]));}
       if(!match||(!match[1]&&!match[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start){res.writeHead(416,{'Content-Range':'bytes */'+size});res.end();return;}
       res.writeHead(206,{...headers,'Content-Range':'bytes '+start+'-'+end+'/'+size,'Content-Length':end-start+1});fs.createReadStream(file,{start,end}).pipe(res);return;
     }
     res.writeHead(200,{...headers,'Content-Length':size});fs.createReadStream(file).pipe(res);return;
   }
   if(/^\/assets\/(?:equipment\/)?[a-zA-Z0-9_-]+\.(png|svg|webp)$/.test(url.pathname)){
     const name=url.pathname.slice('/assets/'.length),privateAsset=readProfileAsset(stateFile,name);
     if(privateAsset){res.writeHead(200,{'Content-Type':'image/png','Content-Length':privateAsset.length,'Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin'});res.end(privateAsset);return;}
     if(isPrivatePortraitAsset(name)){reply(res,404,{error:'Личная иллюстрация не найдена в этом профиле'});return;}
     const asset=path.join(root,'public',url.pathname.slice(1));if(!fs.existsSync(asset)||!fs.lstatSync(asset).isFile()||fs.lstatSync(asset).isSymbolicLink()){reply(res,404,{error:'Иллюстрация не найдена'});return;}
     const type=asset.endsWith('.svg')?'image/svg+xml':asset.endsWith('.webp')?'image/webp':'image/png';res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(fs.readFileSync(asset));return;
   }
   const assets={'/pages/wish-cinema.js':'pages/wish-cinema.js','/equipment-scene.js':'equipment-scene.js','/equipment-manifest.js':'equipment-manifest.js','/pages/resource-guide.js':'pages/resource-guide.js','/pages/resource-guide.css':'pages/resource-guide.css','/pages/hero-equipment.js':'pages/hero-equipment.js','/pages/program.js':'pages/program.js','/pages/program-practice.js':'pages/program-practice.js','/pages/program.css':'pages/program.css','/pages/settings.js':'pages/settings.js','/pages/settings.css':'pages/settings.css','/storage.js':'storage.js','/lesson-workbench/feedback.js':'lesson-workbench/feedback.js','/pages/wishes.js':'pages/wishes.js','/pages/wishes.css':'pages/wishes.css','/pages/item-art.js':'pages/item-art.js','/pages/journal-presentation.js':'pages/journal-presentation.js','/pages/journal-theme.css':'pages/journal-theme.css','/pages/quest-art.js':'pages/quest-art.js','/fantasy-theme.css':'fantasy-theme.css',...{"/lesson-workbench/index.html":"lesson-workbench/index.html","/lesson-workbench/app.js":"lesson-workbench/app.js","/lesson-workbench/editor.js":"lesson-workbench/editor.js","/lesson-workbench/workspace.js":"lesson-workbench/workspace.js","/lesson-workbench/transport.js":"lesson-workbench/transport.js","/lesson-workbench/style.css":"lesson-workbench/style.css","/lesson-workbench/frame.js":"lesson-workbench/frame.js"},'/':'index.html','/app.js':'app.js','/journey.js':'journey.js','/legacy-drafts.html':'legacy-drafts.html','/style.css':'style.css','/transport.js':'transport.js','/pages/world.js':'pages/world.js','/pages/terrain.js':'pages/terrain.js','/pages/world.css':'pages/world.css','/pages/hero.js':'pages/hero.js','/pages/hero.css':'pages/hero.css','/pages/book.js':'pages/book.js','/pages/book.css':'pages/book.css','/pages/lesson.js':'pages/lesson.js','/pages/lesson.css':'pages/lesson.css'};
   if(!assets[url.pathname]){reply(res,404,{error:'Не найдено'});return;}
   const file=assets[url.pathname];let content=fs.readFileSync(path.join(root,'public',file),'utf8');
   if(file==='index.html'||file==='lesson-workbench/index.html')content=content.replace('__GUILD_TOKEN__',token).replace('__GUILD_ACCOUNT__',accountContext?.id||'');
   if(accountContext&&(file==='index.html'||file==='lesson-workbench/index.html'))content=content.replaceAll('src="/rules.js"','src="/rules.js?account='+accountContext.id+'"');
   res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(content);
 });
 let profileClosed=false;const closeProfile=()=>{if(profileClosed)return;profileClosed=true;program.close();learning.close();reviewer.close?.();standards?.close?.();releaseProfile();};
 server.guildClose=closeProfile;server.guildSnapshot=snapshot;server.guildPlan=input=>program.act(input);server.guildCourse=()=>{
  refreshLearningCourse();const view=program.snapshot(),nodes=view.nodes;
  // Copy curriculum, including optional branches and exclusions, without exporting
  // progress, discussion, generated-job state or assessment evidence.
  const keys=['id','title','lessonId','pointId','prerequisites','learningGoals','lessonPlan','main','parentId','blockId','runtime','requiresRuntime'];
  return {...structuredClone(course),
   program:{...structuredClone(course.program),blocks:structuredClone(view.blocks),excluded:nodes.filter(n=>n.excluded).map(n=>n.id),nodes:Object.fromEntries(nodes.map(n=>[n.id,{lessonPlan:n.lessonPlan,pointIds:n.pointIds}]))},
   adaptation:{...structuredClone(course.adaptation),roadmap:nodes.map(n=>({...Object.fromEntries(keys.filter(k=>n[k]!==undefined).map(k=>[k,structuredClone(n[k])])),kind:n.kind||'lesson'}))}};
 };server.once('close',closeProfile);server.once('error',closeProfile);
 return server;
 } catch(error) {releaseProfile();throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 setImmediate(async()=>{
 try {
  const chosen=readLocalConfig({args:process.argv.slice(2)}),python=findPython312(chosen.python);
  const {createAccountServer}=await import('./account-server.mjs');
  const server=createAccountServer({root,python});
  server.listen(chosen.port,'127.0.0.1',()=>console.log('Гильдия знаний: http://127.0.0.1:'+chosen.port));
  server.on('error',e=>{console.error(e.message);process.exitCode=1;});
 } catch(error) {console.error(error.message);process.exitCode=1;}
 });
}
