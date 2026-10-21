import fs from 'node:fs';
import {effortForTask} from './ai-policy.mjs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {startCodexReview,findCodexExecutable} from './codex-reviewer.mjs';
import {deidentifySharedText,sanitizeForModel} from './privacy.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const targets=['Все профили и курсы на этом компьютере'];
const clone=value=>structuredClone(value);
const reviewSchema={type:'object',additionalProperties:false,required:['candidateHash','approved','summary','examples'],properties:{candidateHash:{type:'string'},approved:{type:'boolean'},summary:{type:'string'},examples:{type:'array',minItems:2,maxItems:4,items:{type:'object',additionalProperties:false,required:['domain','input','application'],properties:{domain:{type:'string'},input:{type:'string'},application:{type:'string'}}}}}};
function read(file){if(!fs.existsSync(file))return {schemaVersion:1,proposals:[],history:[]};const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.schemaVersion!==1||!Array.isArray(data.proposals)||!Array.isArray(data.history))throw Error('Повреждено локальное хранилище общих правил.');return data;}
export function createSharedStandards({directory,readProposals=()=>[],resolveAuthor,resolveLocalOwner,generationControl,executable,provider='codex',reviewFixture,timeoutMs=60000,clock=()=>new Date(),personalNames=[],profileScope='local',readAiEfforts=()=>({})}={}){
 if(!path.isAbsolute(directory||''))throw Error('Нужна абсолютная папка общих правил.');
 const file=path.join(directory,'standards.json'),ownerToken=randomUUID();let closed=false;const workers=new Set(),pending=new Map();
 const now=()=>clock().toISOString();
 const clean=value=>deidentifySharedText(value,{names:personalNames});
 const teacher=()=>{const owner=resolveLocalOwner?.(),author=owner?.role==='local-owner'?owner:resolveAuthor?.();if(!['teacher','local-owner'].includes(author?.role))throw Error('Изменение общего стандарта доступно только владельцу локального приложения.');return {role:author.role,id:hash(JSON.stringify([profileScope,author.id])).slice(0,16)};};
 function save(data){
  if(closed)throw Error('Настройки закрыты.');fs.mkdirSync(directory,{recursive:true});
  const lockFile=file+'.lock';let lock;
  for(let attempt=0;attempt<2;attempt++)try{lock=fs.openSync(lockFile,'wx',0o600);fs.writeFileSync(lock,JSON.stringify({pid:process.pid}));break;}catch(error){
   if(error.code!=='EEXIST')throw error;let owner;try{owner=JSON.parse(fs.readFileSync(lockFile,'utf8')).pid;}catch{}
   let stale=false;if(Number.isInteger(owner)&&owner>0)try{process.kill(owner,0);}catch(check){stale=check.code==='ESRCH';}
   if(stale&&attempt===0){fs.unlinkSync(lockFile);continue;}
   throw Error('Другой профиль сейчас сохраняет общие правила. Обновите страницу и повторите действие.');
  }
  if(lock===undefined)throw Error('Не удалось заблокировать общие правила.');
  const temporary=file+'.'+randomUUID()+'.tmp';
  try{
   const latest=read(file);if((latest.revision||0)!==(data.revision||0))throw Error('Общие правила изменены в другом профиле. Обновите страницу перед сохранением.');
   data.revision=(latest.revision||0)+1;fs.writeFileSync(temporary,JSON.stringify(data,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,file);
  }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);fs.closeSync(lock);fs.unlinkSync(lockFile);}
 }
 function audit(data,action,item,author){data.history.push({id:randomUUID(),at:now(),action,ruleId:item.id,revisionHash:item.revisionHash,author});}
 function candidates(){const data=read(file);for(const proposal of readProposals()||[]){if(proposal.status==='unsupported')continue;let text;try{text=clean(proposal.text);}catch{continue;}const id='shared-'+hash(text).slice(0,20);if(!data.proposals.some(item=>item.id===id))data.proposals.push({id,text,revisionHash:hash(text),status:'pending',createdAt:now()});}return data;}
 function view(item){const result=clone(item);delete result.preview;delete result.reviewOwner;result.canAccept=item.status==='approved'&&item.review?.approved===true&&item.review.candidateHash===item.revisionHash;result.targets=targets;return result;}
 function snapshot(){return {proposals:candidates().proposals.map(view),activeRules:activeRules(),history:read(file).history.slice(-80),canManage:resolveLocalOwner?.()?.role==='local-owner'||resolveAuthor?.()?.role==='teacher',scope:'local-computer',privacy:'Общие правила не содержат исходных отзывов. Автоматическое удаление личных данных не заменяет вашу проверку.'};}
 function activeRules(){return read(file).proposals.filter(item=>item.status==='accepted'&&item.review?.approved&&item.review.candidateHash===item.revisionHash).map(({id,text,revisionHash})=>({id,text,revisionHash}));}
 function get(data,id){const item=data.proposals.find(item=>item.id===id);if(!item)throw Error('Общее предложение не найдено.');return item;}
 function preview(item,author){item.preview={token:randomUUID(),revisionHash:item.revisionHash,authorId:author.id,at:now()};return {...view(item),previewToken:item.preview.token};}
 async function invoke(item){const work=fs.mkdtempSync(path.join(os.tmpdir(),'guild-common-review-'));let ticket,child;try{
  ticket=generationControl?.reserve({kind:'common-rule-review',maxTokens:12000});
  const input={candidateHash:item.revisionHash,text:item.text,targets};
  const prompt='Ты независимый проверяющий общего педагогического стандарта. Доступны только обезличенное правило и общая область применения. Не используй файлы или инструменты. Проверь пользу для разных учеников, Python и ML, отсутствие личных предпочтений, опасных требований и противоречий. Дай минимум два конкретных примера из разных предметных областей; если универсальность не доказана, approved=false. Верни только JSON по схеме. Не переиначивай правило.\n'+JSON.stringify(sanitizeForModel(input));
  const effort=effortForTask('sharedRuleReview',readAiEfforts());
  let result,usage;
  if(provider==='file'){if(!reviewFixture)throw Error('Тестовый проверяющий не настроен.');result=await reviewFixture({candidate:clone(input),effort,prompt,cwd:work,schema:clone(reviewSchema)});}
  else {if(provider!=='codex')throw Error('Независимая проверка сейчас выключена.');const binary=executable||findCodexExecutable();if(!binary)throw Error('Локальный Codex недоступен.');const resultFile=path.join(work,'result.json'),statusFile=path.join(work,'status.json');child=startCodexReview({executable:binary,prompt,effort,schema:reviewSchema,schemaFile:path.join(work,'schema.json'),resultFile,statusFile,cwd:work,timeoutMs,noTools:true,jsonEvents:true});workers.add(child);await new Promise((resolve,reject)=>{child.once('error',()=>reject(Error('Не удалось запустить независимую проверку.')));child.once('close',()=>{let status;try{status=JSON.parse(fs.readFileSync(statusFile,'utf8'));}catch{}usage=status?.telemetry?.usage;if(status?.status!=='complete')reject(Error(status?.error||'Проверка прервалась.'));else resolve();});});result=JSON.parse(fs.readFileSync(resultFile,'utf8'));}
  if(closed)throw Error('Проверка остановлена.');
  if(result?.candidateHash!==item.revisionHash||typeof result.approved!=='boolean'||typeof result.summary!=='string'||!result.summary.trim()||result.summary.length>2000||!Array.isArray(result.examples)||result.examples.length<2||result.examples.length>4)throw Error('Проверяющий вернул неполный ответ. Общее правило не принято.');
  const domains=new Set();for(const example of result.examples){for(const key of ['domain','input','application'])if(typeof example[key]!=='string'||!example[key].trim()||example[key].length>1000)throw Error('В проверке не хватает конкретных примеров.');domains.add(example.domain.toLowerCase().trim());}if(domains.size<2)throw Error('Нужны примеры минимум из двух разных предметных областей.');
  generationControl?.settle(ticket,{usage,status:'complete'});ticket=null;return sanitizeForModel(result,{names:personalNames});
 }finally{if(ticket)generationControl?.settle(ticket,{status:'failed'});if(child)workers.delete(child);fs.rmSync(work,{recursive:true,force:true});}}
 async function act(input={}){if(closed)throw Error('Настройки закрыты.');const author=teacher();recoverInterruptedReviews();const data=candidates(),item=get(data,input.proposalId);
  if(input.action==='preview'){const result=preview(item,author);save(data);return {preview:result};}
  if(input.action==='review'){
   if(pending.has(item.id)||item.status==='reviewing')throw Error('Это предложение уже проверяется.');if(item.status==='accepted')throw Error('Принятое правило сначала нужно изменить или отключить.');
   item.status='reviewing';item.reviewOwner={pid:process.pid,token:ownerToken,deadline:Date.now()+timeoutMs+5000};delete item.preview;save(data);const promise=(async()=>{let review;try{let timer;try{review=await Promise.race([invoke(item),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Независимая проверка не успела завершиться. Повторите позже.')),timeoutMs+1000);})]);}finally{clearTimeout(timer);}if(closed)return;const current=read(file),target=get(current,item.id);if(target.revisionHash!==item.revisionHash||target.status!=='reviewing'||target.reviewOwner?.token!==ownerToken)return;delete target.reviewOwner;target.review=review;target.status=review.approved?'approved':'needs-changes';target.reviewedAt=now();delete target.preview;audit(current,'review',target,author);const result=preview(target,author);save(current);return {preview:result};}catch(error){if(!closed){const current=read(file),target=get(current,item.id);if(target.revisionHash===item.revisionHash&&target.status==='reviewing'&&target.reviewOwner?.token===ownerToken){target.status='failed';delete target.reviewOwner;target.error=String(error.message).slice(0,400);audit(current,'review-failed',target,author);save(current);}}throw error;}finally{pending.delete(item.id);}})();pending.set(item.id,promise);return promise;
  }
  if(input.action==='accept'){
   if(input.confirm!==true||input.shownTargets!==true||!item.preview||input.previewToken!==item.preview.token||input.revisionHash!==item.revisionHash||item.preview.revisionHash!==item.revisionHash||item.preview.authorId!==author.id)throw Error('Сначала откройте точный предпросмотр и подтвердите область применения.');
   if(item.status!=='approved'||item.review?.approved!==true||item.review.candidateHash!==item.revisionHash)throw Error('Сначала нужна успешная независимая проверка этого текста.');item.status='accepted';item.acceptedAt=now();delete item.preview;
  }else if(input.action==='reject'){item.status='rejected';delete item.preview;}
  else if(input.action==='disable'){if(item.status!=='accepted')throw Error('Это правило не применяется.');item.status='disabled';delete item.preview;}
  else if(input.action==='edit'){if(input.confirm!==true)throw Error('Подтвердите изменение текста.');item.previousRevisions=[...(item.previousRevisions||[]),{text:item.text,revisionHash:item.revisionHash,status:item.status,at:now()}];item.text=clean(input.text);item.revisionHash=hash(item.text);item.status='pending';delete item.review;delete item.preview;}
  else throw Error('Неизвестное действие с общими правилами.');audit(data,input.action,item,author);save(data);return {preview:input.action==='edit'?previewAndSave(data,item,author):undefined};
 }
 function previewAndSave(data,item,author){const result=preview(item,author);save(data);return result;}
 // A surviving profile can retry a dead/expired owner's review without a server
 // restart. This uses the same lock and revision guard as every shared write;
 // contention stops the action before any new model call. Live owners survive.
 function alive(owner){if(!Number.isInteger(owner?.pid)||owner.pid<1||!Number.isFinite(owner.deadline)||Date.now()>owner.deadline)return false;try{process.kill(owner.pid,0);return true;}catch(error){return error.code!=='ESRCH';}}
 function recoverInterruptedReviews(){const existing=read(file);let interrupted=false;for(const item of existing.proposals)if(item.status==='reviewing'&&!alive(item.reviewOwner)){item.status='failed';delete item.reviewOwner;item.error='Проверка была прервана. Запустите её снова.';interrupted=true;}if(interrupted)save(existing);}
 recoverInterruptedReviews();
 return {snapshot,act,activeRules,close(){
  if(closed)return;for(const child of workers)child.guildCancel?.();
  try{const data=read(file);let changed=false;for(const item of data.proposals)if(item.status==='reviewing'&&item.reviewOwner?.token===ownerToken){item.status='failed';delete item.reviewOwner;item.error='Проверка остановлена. Можно повторить её позже.';changed=true;}if(changed)save(data);}catch{}
  closed=true;
 }};
}
