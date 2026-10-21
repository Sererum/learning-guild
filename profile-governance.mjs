import fs from 'node:fs';
import {normalizeAiEfforts,aiEffortPreset} from './ai-policy.mjs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const statuses=new Set(['active','disabled','review-needed','superseded','unsupported']);
const roles=new Set(['learner','teacher']);
const clone=value=>structuredClone(value);
const token=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);
const text=(value,max=500)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Введите понятный короткий текст.');return value.trim();};
const read=(file,fallback)=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):clone(fallback);
const defaultProfile=()=>({schemaVersion:1,version:0,observations:[],rules:[],history:[],sharedProposals:[]});
const aboutFields=['interests','goals','background','avoid'];
const emptyAbout=()=>Object.fromEntries(aboutFields.map(key=>[key,'']));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,20);
function aboutInput(input){if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Заполните сведения о себе.');const result={};for(const [key,value] of Object.entries(input)){if(!aboutFields.includes(key))throw Error('Неизвестное поле профиля.');if(typeof value!=='string'||value.length>2000)throw Error('В каждом поле допустимо до 2000 символов.');result[key]=value.trim();}return result;}
const aboutLabels={interests:'Личные интересы',goals:'Цели обучения',background:'Что я уже знаю',avoid:'Какие примеры мне не подходят'};
const conflictId=ids=>'conflict-'+createHash('sha256').update([...ids].sort().join('\n')).digest('hex').slice(0,16);

// The source profile stays intact. Governance is a reversible local overlay;
// old clients may keep writing rules without deleting manual decisions.
export function createProfileGovernance({directory,profileId='default',courseId='default',clock=()=>new Date()}={}){
 if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('Нужна абсолютная папка профиля.');
 const settingsFile=path.join(directory,'settings.json'),profileFile=path.join(directory,'personalization.json');
 const now=()=>new Date(clock()).toISOString();
 const defaults=()=>({schemaVersion:1,profileId,courseId,authors:[{id:'learner',name:'Ученик',role:'learner'},{id:'teacher',name:'Преподаватель',role:'teacher'}],activeAuthorId:'learner',preferenceReviewDays:90,about:emptyAbout(),aboutSources:{},manualRules:[],changeProposals:[],importedSeeds:[],ruleOverrides:{},conflictResolutions:{},history:[]});
 function settings(){const value={...defaults(),...read(settingsFile,{})};value.about={...emptyAbout(),...value.about};value.aiEfforts=normalizeAiEfforts(value.aiEfforts);if(value.profileId!==profileId||value.courseId!==courseId)throw Error('Настройки относятся к другому профилю или курсу.');return clone(value);}
 function atomic(file,value){fs.mkdirSync(directory,{recursive:true});if(fs.existsSync(file)){const backup=path.join(directory,'backups');fs.mkdirSync(backup,{recursive:true});fs.copyFileSync(file,path.join(backup,path.basename(file)+'.'+Date.now()+'.'+randomUUID()+'.json'));}const temporary=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}}
 function resolveAuthor(id){const config=settings(),author=config.authors.find(item=>item.id===(id??config.activeAuthorId));if(!author||!token(author.id)||!roles.has(author.role))throw Error('Выберите автора отзыва в настройках.');return clone({id:author.id,name:author.name,role:author.role});}
 function resolveLearner(){const config=settings(),author=config.authors.find(item=>item.id==='learner'&&item.role==='learner')||config.authors.find(item=>item.role==='learner');return author?clone({id:author.id,name:author.name,role:'learner'}):{id:'learner',name:'Ученик',role:'learner'};}
 function reconcile(input){
  const profile={...defaultProfile(),...clone(input||{})},config=settings();
  for(const rule of config.manualRules||[]){if(!profile.rules.some(item=>item.id===rule.id))profile.rules.push(clone(rule));for(const observation of rule.sourceObservations||[])if(!profile.observations.some(item=>item.id===observation.id))profile.observations.push(clone(observation));}
  profile.about=clone(config.about);
  const observations=new Map(profile.observations.map(item=>[item.id,item]));
  const authorIds=rule=>new Set((rule.evidenceIds||[]).map(id=>observations.get(id)?.author?.id).filter(Boolean));
  const rawRules=new Map(profile.rules.map(rule=>[rule.id,clone(rule)])),conflicts=[];
  for(const rule of rawRules.values()){
   const target=rawRules.get(rule.supersededBy);if(!target)continue;
   const left=authorIds(rule),right=authorIds(target);
   // A model may identify a semantic conflict; keyword matching cannot do so.
   // Unknown attribution also cannot silently revoke another person's rule.
   if(!left.size||!right.size||[...left].some(id=>!right.has(id))||[...right].some(id=>!left.has(id))){
    const ids=[rule.id,target.id].sort(),id=conflictId(ids);if(!conflicts.some(item=>item.id===id))conflicts.push({id,ruleIds:ids,status:'pending',reason:'Разные или неизвестные авторы высказали несовместимые пожелания. Выберите подходящее правило или отключите оба.'});
   }
  }
  profile.rules=profile.rules.map(rule=>{
   const result={...rule},override=config.ruleOverrides?.[rule.id];
   const sources=(rule.evidenceIds||[]).map(id=>observations.get(id)).filter(item=>item&&item.status!=='superseded'&&!item.skipped&&item.text?.trim());
   if(override?.manualSource)sources.push({id:'manual-'+rule.id,text:override.text,author:override.manualSource.author,observedAt:override.manualSource.at,kind:override.manualSource.kind||'manual',sourceLabel:override.manualSource.sourceLabel,source:override.manualSource.source});
   result.sources=sources.map(item=>({id:item.id,text:item.text,author:item.author?clone(item.author):null,at:item.savedAt||item.observedAt||null,kind:item.kind,sourceLabel:item.sourceLabel,source:item.source,taskId:item.taskId,lessonId:item.lessonId}));
   const uniqueSources=new Set(sources.map(item=>[item.author?.id||'unknown',item.kind||'feedback',item.taskId||item.lessonId||item.id].join(':')));
   const sourceDates=sources.map(item=>Date.parse(item.savedAt||item.observedAt||'')).filter(Number.isFinite);
   const freshest=Math.max(...[...sourceDates,Date.parse(override?.confirmedAt||'')].filter(Number.isFinite));
   result.supportCount=uniqueSources.size;
   if(!statuses.has(result.status))result.status='review-needed';
   if(override?.text)result.text=override.text;
   if(override?.status==='disabled'){result.status='disabled';result.reviewReason='Отключено вручную.';}
   else if(!sources.length&&rule.source==='explicit-feedback'){result.status='unsupported';result.reviewReason='Исходный отзыв исправлен или отозван.';}
   else if(result.status!=='superseded'||override?.status==='active'){
    if(override?.status==='active'){result.status='active';result.reviewReason='Подтверждено учеником.';}
    else if(rule.requiresConsent){result.status='review-needed';result.reviewReason='Будет применяться только после вашего согласия.';}
    else if(uniqueSources.size<2){result.status='review-needed';result.reviewReason='Пока это один отзыв. Подтвердите правило или дождитесь повторного пожелания.';}
    else {result.status='active';result.reviewReason='Пожелание повторяется в независимых отзывах.';}
    if(result.status==='active'&&(!Number.isFinite(freshest)||(new Date(clock()).getTime()-freshest)>config.preferenceReviewDays*86400000)){result.status='review-needed';result.reviewReason='Пора проверить, актуально ли это пожелание.';result.expired=true;}
   }
   return result;
  });
  for(const conflict of conflicts){
   const resolution=config.conflictResolutions?.[conflict.id];
   if(resolution){conflict.status='resolved';conflict.resolution=clone(resolution);}
   for(const id of conflict.ruleIds){const rule=profile.rules.find(item=>item.id===id);if(!rule)continue;if(!resolution){if(config.ruleOverrides?.[id]?.status!=='disabled'){rule.status='review-needed';rule.reviewReason='Есть противоречащее пожелание. Нужен ваш выбор.';}rule.conflictId=conflict.id;}else if(resolution.selectedRuleId!==id){rule.status='disabled';rule.reviewReason='Отключено при разрешении противоречия.';}}
  }
  profile.conflicts=conflicts;
  return profile;
 }
 const pendingChanges=()=>settings().changeProposals.filter(item=>item.status==='pending');
 function snapshot(){const config=settings(),profile=reconcile(read(profileFile,defaultProfile())),safe=item=>{const {evidenceIds,sourceObservations,...rest}=item;return rest;};return {settings:{...config,manualRules:config.manualRules.map(safe)},about:clone(config.about),pendingChanges:pendingChanges(),personalization:{version:profile.version,about:clone(config.about),preferences:profile.rules.map(safe),observations:profile.observations,history:profile.history,conflicts:profile.conflicts,sharedProposals:profile.sharedProposals.map(safe)},statusLabels:{active:'Применяется',disabled:'Отключено', 'review-needed':'Нужно подтвердить',superseded:'Заменено',unsupported:'Источник больше не подтверждает'}};}
 function saveSettings(config,action,detail={}){config.updatedAt=now();config.history=[...(config.history||[]),{id:randomUUID(),action,at:config.updatedAt,author:resolveLearner(),...detail}];atomic(settingsFile,config);}
 function addLocalRule(config,{id,ruleText,category='explanations',source='manual',sourceReference=null,observations=[],at=now()}){id=id||'personal-'+randomUUID().slice(0,16);if(!token(id))throw Error('Некорректный номер пожелания.');const content=text(ruleText,1000),author=source==='local-import'?null:resolveLearner();config.manualRules??=[];if(!config.manualRules.some(item=>item.id===id))config.manualRules.push({id,category,text:content,status:'active',source,requiresConsent:true,evidenceIds:observations.map(item=>item.id),sourceObservations:clone(observations),createdAt:at});config.ruleOverrides??={};config.ruleOverrides[id]={...(config.ruleOverrides[id]||{}),text:content,status:'active',confirmedAt:at,updatedAt:at,manualSource:{author,at,kind:source,...(source==='local-import'?{sourceLabel:'Из прежних материалов курса',source:sourceReference}:{})},author};return id;}
 function proposeChanges(input={}){
  const config=settings(),id=input.id||'proposal-'+hash({jobId:input.jobId,preferences:input.preferences,aboutUpdates:input.aboutUpdates});if(!token(id))throw Error('Некорректный номер предложения.');const existing=config.changeProposals.find(item=>item.id===id);if(existing)return clone(existing);
  if(input.jobId!==undefined&&!token(input.jobId))throw Error('Некорректный номер разбора.');
  if(input.preferences!==undefined&&(!Array.isArray(input.preferences)||input.preferences.length>50))throw Error('Слишком много предложений.');
  const profile=reconcile(read(profileFile,defaultProfile())),changes=[],at=now(),observations=Array.isArray(input.observations)?clone(input.observations):[];
  for(const preference of input.preferences||[]){if(!preference||!['string','object'].includes(typeof preference))throw Error('Некорректное пожелание.');const ruleText=text(typeof preference==='string'?preference:(preference.text??preference.rule),1000),ruleId=typeof preference==='object'&&preference.id?preference.id:'preference-'+hash({text:ruleText,category:preference.category||'explanations'});if(!token(ruleId))throw Error('Некорректный номер пожелания.');const previous=profile.rules.find(item=>item.id===ruleId);if(previous?.text===ruleText&&previous.status==='active')continue;const replaces=(preference.supersedesIds||[]).map(id=>{const old=profile.rules.find(item=>item.id===id);if(!old)throw Error('Предложение заменяет неизвестное пожелание.');return {id,text:old.text,status:old.status};});changes.push({id:'change-'+hash({kind:'rule',ruleId,ruleText}),kind:'rule',section:'teaching',label:'Как мне давать задания',ruleId,text:ruleText,after:ruleText,category:preference.category||'explanations',before:previous?.text??null,beforeStatus:previous?.status??null,replaces,source:{jobId:input.jobId||null,at,observationIds:preference.evidenceIds||[]}});}
  const aboutUpdates=Array.isArray(input.aboutUpdates)?input.aboutUpdates.map(item=>({field:item?.field,value:item?.value,evidenceIds:item?.evidenceIds||[]})):Object.entries(aboutInput(input.aboutUpdates||{})).map(([field,value])=>({field,value,evidenceIds:[]}));
  if(aboutUpdates.length>aboutFields.length||new Set(aboutUpdates.map(item=>item.field)).size!==aboutUpdates.length)throw Error('Для каждого поля можно предложить только одно изменение.');
  for(const update of aboutUpdates){const {[update.field]:value}=aboutInput({[update.field]:update.value}),field=update.field;if(config.about[field]!==value)changes.push({id:'change-'+hash({kind:'about',field,value}),kind:'about',section:'about',label:aboutLabels[field],field,value,after:value,before:config.about[field],source:{jobId:input.jobId||null,at,observationIds:update.evidenceIds}});}
  const proposal={id,jobId:input.jobId||null,status:changes.length?'pending':'no-changes',createdAt:at,changes,observations};config.changeProposals.push(proposal);saveSettings(config,'propose-changes',{proposalSetId:id,changeIds:changes.map(item=>item.id)});return clone(proposal);
 }
 function decideChanges({proposalSetId,acceptedIds}={}){
  const config=settings(),proposal=config.changeProposals.find(item=>item.id===proposalSetId);if(!proposal)throw Error('Предложение не найдено.');if(!Array.isArray(acceptedIds)||acceptedIds.some(id=>typeof id!=='string'||!proposal.changes.some(item=>item.id===id))||new Set(acceptedIds).size!==acceptedIds.length)throw Error('Выберите изменения, с которыми согласны.');
  if(proposal.status!=='pending'){if(JSON.stringify([...(proposal.acceptedIds||[])].sort())===JSON.stringify([...acceptedIds].sort()))return snapshot();throw Error('Вы уже ответили на это предложение.');}
  const accepted=new Set(acceptedIds),profile=reconcile(read(profileFile,defaultProfile())),at=now();
  const acceptedRules=new Set(proposal.changes.filter(item=>accepted.has(item.id)&&item.kind==='rule').map(item=>item.ruleId));for(const change of proposal.changes.filter(item=>accepted.has(item.id)))if((change.replaces||[]).some(item=>acceptedRules.has(item.id)))throw Error('Выберите одно из заменяющих друг друга пожеланий.');
  for(const change of proposal.changes.filter(item=>accepted.has(item.id))){const currentRule=change.kind==='rule'?profile.rules.find(item=>item.id===change.ruleId):null,current=change.kind==='about'?config.about[change.field]:(currentRule?.text??null);if(current!==change.before||(change.kind==='rule'&&(currentRule?.status??null)!==change.beforeStatus))throw Error('Настройка уже изменена вручную. Обновите предложение, чтобы не потерять вашу правку.');for(const replaced of change.replaces||[]){const old=profile.rules.find(item=>item.id===replaced.id);if(old?.text!==replaced.text||old.status!==replaced.status)throw Error('Заменяемое пожелание уже изменилось. Обновите предложение.');}}
  for(const change of proposal.changes){change.decision=accepted.has(change.id)?'accepted':'rejected';change.decidedAt=at;if(change.decision!=='accepted')continue;if(change.kind==='about'){config.about[change.field]=change.value;config.aboutSources[change.field]={...change.source,consentedAt:at,author:resolveLearner(),proposalSetId};}else{const evidence=new Set(change.source.observationIds);addLocalRule(config,{id:change.ruleId,ruleText:change.text,category:change.category,source:'feedback-consent',observations:proposal.observations.filter(item=>evidence.has(item.id)),at});for(const replaced of change.replaces||[])config.ruleOverrides[replaced.id]={...(config.ruleOverrides[replaced.id]||{}),status:'disabled',updatedAt:at,author:resolveLearner(),replacedBy:change.ruleId};}}
  proposal.status='decided';proposal.acceptedIds=[...acceptedIds];proposal.decidedAt=at;proposal.author=resolveLearner();saveSettings(config,'decide-changes',{proposalSetId,acceptedIds:[...acceptedIds],rejectedIds:proposal.changes.filter(item=>!accepted.has(item.id)).map(item=>item.id)});return snapshot();
 }
 function importSeed(seed={}){
  const config=settings(),id=seed.id||'seed-'+hash(seed);if(!token(id))throw Error('Некорректный номер исходного профиля.');if((seed.profileId&&seed.profileId!==profileId)||(seed.courseId&&seed.courseId!==courseId))throw Error('Исходный профиль относится к другому ученику или курсу.');if(config.importedSeeds.includes(id))return snapshot();const about=aboutInput(seed.about||{}),at=now();for(const [field,value] of Object.entries(about))if(!config.about[field]&&!config.aboutSources[field]){config.about[field]=value;config.aboutSources[field]={kind:'local-import',seedId:id,at,source:seed.source||null};}
  const rules=seed.preferences??seed.rules;if(rules!==undefined&&(!Array.isArray(rules)||rules.length>100))throw Error('Некорректный исходный список пожеланий.');for(const rule of rules||[]){const ruleText=typeof rule==='string'?rule:rule.text,ruleId=typeof rule==='object'&&rule.id?rule.id:'imported-'+hash({seed:id,text:ruleText});if(!config.manualRules.some(item=>item.id===ruleId)&&!config.ruleOverrides[ruleId])addLocalRule(config,{id:ruleId,ruleText,category:rule.category||'explanations',source:'local-import',sourceReference:rule.source||seed.source||null,at});}config.importedSeeds.push(id);saveSettings(config,'import-local-seed',{seedId:id,source:seed.source||null});return snapshot();
 }
 function act(input={}){
  const config=settings(),before=clone(config),action=input.action,at=now();let detail={};
  if(action==='set-ai-efforts'){if(input.preset!==undefined&&input.efforts!==undefined)throw Error('Выберите набор или отдельные уровни ИИ.');if(input.preset===undefined&&(!input.efforts||typeof input.efforts!=='object'||Array.isArray(input.efforts)))throw Error('Укажите настройки тщательности ИИ.');config.aiEfforts=input.preset!==undefined?aiEffortPreset(input.preset):normalizeAiEfforts({...config.aiEfforts,...(input.efforts??null)});detail={aiEfforts:clone(config.aiEfforts)};}
  else if(action==='set-author'){resolveAuthor(input.authorId);config.activeAuthorId=input.authorId;}
  else if(action==='add-author'){
   const id=input.authorId||'author-'+randomUUID().slice(0,8);if(!token(id)||config.authors.some(item=>item.id===id)||!roles.has(input.role))throw Error('Укажите уникального автора и роль «ученик» или «преподаватель».');
   config.authors.push({id,name:text(input.name,80),role:input.role});detail.authorId=id;
  }else if(action==='update-author'){
   const author=config.authors.find(item=>item.id===input.authorId);if(!author)throw Error('Автор не найден.');author.name=text(input.name,80);if(input.role!==undefined){if(!roles.has(input.role))throw Error('Неизвестная роль.');author.role=input.role;}detail.authorId=author.id;
  }else if(action==='set-review-days'){
   if(!Number.isInteger(input.days)||input.days<1||input.days>3650)throw Error('Введите число дней от 1 до 3650.');config.preferenceReviewDays=input.days;
  }else if(action==='update-about'){
   const updates=aboutInput(input.about);for(const [field,value] of Object.entries(updates)){config.about[field]=value;config.aboutSources[field]={kind:'manual',at,author:resolveLearner()};}detail.fields=Object.keys(updates);
  }else if(action==='add-rule'){
   detail.ruleId=addLocalRule(config,{ruleText:input.text,category:input.category||'explanations',at});
  }else if(action==='decide-changes'){
   return decideChanges(input);
  }else if(['disable-rule','confirm-rule','edit-rule'].includes(action)){
   const profile=reconcile(read(profileFile,defaultProfile())),rule=profile.rules.find(item=>item.id===input.ruleId);if(!rule)throw Error('Правило не найдено.');
   if(action==='edit-rule'&&input.confirm!==true)throw Error('Подтвердите применение изменённого правила.');
   const previous=config.ruleOverrides?.[rule.id]||{};config.ruleOverrides??={};config.ruleOverrides[rule.id]={...previous,status:action==='disable-rule'?'disabled':'active',...(action==='edit-rule'?{text:text(input.text),manualSource:{author:resolveLearner(),at,kind:'manual'}}:{}),...(action==='disable-rule'?{}:{confirmedAt:at}),updatedAt:at,author:resolveLearner()};detail={ruleId:rule.id,previousText:previous.text||rule.text};
  }else if(action==='resolve-conflict'){
   const profile=reconcile(read(profileFile,defaultProfile())),conflict=profile.conflicts.find(item=>item.id===input.conflictId);if(!conflict)throw Error('Противоречие не найдено.');
   if(input.selectedRuleId!==null&&!conflict.ruleIds.includes(input.selectedRuleId))throw Error('Выберите одно из двух правил или отключите оба.');
   config.conflictResolutions??={};config.conflictResolutions[conflict.id]={selectedRuleId:input.selectedRuleId,at,author:resolveLearner()};
   config.ruleOverrides??={};for(const id of conflict.ruleIds)config.ruleOverrides[id]={...(config.ruleOverrides[id]||{}),status:id===input.selectedRuleId?'active':'disabled',confirmedAt:at,updatedAt:at};detail={conflictId:conflict.id,selectedRuleId:input.selectedRuleId};
  }else throw Error('Неизвестное действие настройки.');
  config.updatedAt=at;config.history=[...(config.history||[]),{id:randomUUID(),action,at,author:resolveLearner(),...detail,before:{activeAuthorId:before.activeAuthorId,preferenceReviewDays:before.preferenceReviewDays,ruleOverrides:before.ruleOverrides,conflictResolutions:before.conflictResolutions}}];atomic(settingsFile,config);return snapshot();
 }
 return {settings,resolveAuthor,resolveLearner,snapshot,act,reconcile,proposeChanges,decideChanges,pendingChanges,importSeed};
}
