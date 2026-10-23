import crypto from 'node:crypto';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(value);
const clone=value=>structuredClone(value);
const defaults={gems:60,gold:100,books:1,materials:{ore:2,cloth:2,notes:2}};
const scalarRewards=['gems','gold','books','crystals','petals'];
const forbiddenKeys=new Set(['__proto__','prototype','constructor']);

export function dailyTimeZone(bank={},manifest={}){
 const zone=bank.timeZone??manifest.timeZone??'Europe/Moscow';
 if(typeof zone!=='string')throw Error('Укажи часовой пояс дэйликов.');
 try{new Intl.DateTimeFormat('en-CA',{timeZone:zone}).format(new Date());}catch{throw Error('Неизвестный часовой пояс дэйликов.');}
 return zone;
}
export function dailyDay(now,timeZone){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(part=>[part.type,part.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export function nextDailyReset(now,timeZone){
 const day=dailyDay(now,timeZone);let low=now.getTime(),high=low+36*60*60*1000;
 // Search the real next date boundary: DST days can be 23 or 25 hours.
 while(high-low>1){const middle=Math.floor((low+high)/2);if(dailyDay(new Date(middle),timeZone)===day)low=middle;else high=middle;}
 return new Date(high).toISOString();
}
function rewardPack(input){
 const source=input===undefined?defaults:input;
 if(!object(source)||Object.keys(source).some(key=>!scalarRewards.includes(key)&&key!=='materials'))throw Error('Неверный набор наград дэйлика.');
 const reward={};
 for(const key of scalarRewards){const value=source[key]??0;if(!Number.isSafeInteger(value)||value<0||value>1000000)throw Error('Награда дэйлика должна быть неотрицательным целым числом.');reward[key]=value;}
 if(source.materials!==undefined&&!object(source.materials))throw Error('Неверные материалы дэйлика.');
 reward.materials={};for(const [key,value] of Object.entries(source.materials||{})){
  if(!safeId(key)||forbiddenKeys.has(key)||!Number.isSafeInteger(value)||value<0||value>1000000)throw Error('Неверные материалы дэйлика.');
  reward.materials[key]=value;
 }
 return reward;
}
export function validateDailyBank(bank){
 if(bank===undefined||bank===null)return;
 if(!object(bank)||!Array.isArray(bank.variants))throw Error('Банк дэйликов должен содержать variants.');
 dailyTimeZone(bank);rewardPack(bank.reward);const ids=new Set();
 for(const variant of bank.variants){
  if(!object(variant)||!safeId(variant.id)||ids.has(variant.id)||!safeId(variant.topicId))throw Error('У дэйлика нужны уникальный id и topicId.');ids.add(variant.id);
  if(typeof (variant.title??variant.name)!=='string'||!(variant.title??variant.name).trim()||typeof (variant.prompt??variant.description)!=='string'||!(variant.prompt??variant.description).trim()||typeof variant.starter!=='string')throw Error('У дэйлика нужны название, условие и стартовый код.');
  if(!Array.isArray(variant.tests)||!variant.tests.length||variant.tests.some(test=>!object(test)||typeof test.label!=='string'||!object(test.inputs)||!object(test.expected)||!Object.keys(test.expected).length))throw Error('У дэйлика должны быть проверочные сценарии с ожидаемыми переменными.');
  if(variant.constraints!==undefined&&!object(variant.constraints))throw Error('Неверные ограничения дэйлика.');
  if(variant.reviewed!==undefined&&typeof variant.reviewed!=='boolean')throw Error('reviewed у дэйлика должен быть true или false.');
 }
}
function publicResult(result,task){
 if(!result)return null;
 return {ok:result.ok===true,...(typeof result.error==='string'?{error:result.error}:{}),tests:(result.tests||[]).map((test,index)=>({label:task.tests[index]?.label||test.label,ok:test.ok===true,...(task.tests[index]?.hidden||task.hiddenTests?.includes(index)?{hidden:true}:{...(typeof test.error==='string'?{error:test.error}:{}),...(typeof test.note==='string'?{note:test.note}:{}),...(typeof test.output==='string'?{output:test.output}:{})})}))};
}

export function createDailyService({readCourse,readProgram,readState,persist,clock=()=>new Date(),scope}){
 if(!scope||typeof scope!=='string')throw Error('Дэйлики должны принадлежать конкретному курсу и профилю.');
 const now=()=>{const date=new Date(clock());if(!Number.isFinite(date.getTime()))throw Error('Не удалось определить дату дэйлика.');return date;};
 const context=()=>{const course=readCourse(),bank=course.daily;validateDailyBank(bank);const timeZone=dailyTimeZone(bank||{},course.manifest||{}),date=now();return {bank,timeZone,date,day:dailyDay(date,timeZone),resetsAt:nextDailyReset(date,timeZone)};};
 function ledger(){const value=readState().daily;if(value&&(value.version!==1||value.scope!==scope||!object(value.entries)))throw Error('История дэйликов относится к другому профилю или формату.');return value||{version:1,scope,entries:{}};}
 function transaction(change){const state=readState(),before=clone(state);try{change(state);persist();}catch(error){for(const key of Object.keys(state))delete state[key];Object.assign(state,before);throw error;}}
 const tie=(day,key)=>crypto.createHash('sha256').update(scope+'\0'+day+'\0'+key).digest('hex');
 function select(items,counts,day,last){
  const candidates=items.length>1?items.filter(item=>item!==last):items;
  return [...candidates].sort((a,b)=>(counts[a]||0)-(counts[b]||0)||tie(day,a).localeCompare(tie(day,b)))[0];
 }
 function ensure(ctx){
  const stored=ledger(),entries=Object.values(stored.entries),latest=entries.sort((a,b)=>b.day.localeCompare(a.day))[0];
  if(latest&&ctx.day<latest.day)return {entry:null,reason:'Дата компьютера раньше последнего дэйлика. Проверь часы.'};
  const existing=stored.entries[ctx.day];if(existing)return {entry:existing};
  const bank=ctx.bank;
  if(!bank?.variants?.length)return {entry:null,reason:'Для этого курса ещё не подготовлен запас дэйликов.'};
  const learned=new Map((readProgram().nodes||[]).filter(node=>node.completed&&!node.excluded).map(node=>[node.id,node]));
  if(!learned.size)return {entry:null,reason:'Дэйлики появятся после первой освоенной темы.'};
  const variants=bank.variants.filter(variant=>variant.reviewed===true&&learned.has(variant.topicId));
  if(!variants.length)return {entry:null,reason:'Для освоенных тем пока нет проверенных дэйликов.'};
  const topicCounts={},variantCounts={};for(const entry of entries){topicCounts[entry.topicId]=(topicCounts[entry.topicId]||0)+1;variantCounts[entry.variantId]=(variantCounts[entry.variantId]||0)+1;}
  const topics=[...new Set(variants.map(v=>v.topicId))],topicId=select(topics,topicCounts,ctx.day,latest?.topicId);
  const choices=variants.filter(v=>v.topicId===topicId),lastVariant=entries.find(entry=>entry.topicId===topicId)?.variantId;
  const variantId=select(choices.map(v=>v.id),variantCounts,ctx.day,lastVariant),variant=choices.find(v=>v.id===variantId);
  const id='daily-'+crypto.createHash('sha256').update(scope+'\0'+ctx.day).digest('hex').slice(0,24);
  const task={id,name:variant.title??variant.name,tests:clone(variant.tests),...(variant.constraints?{constraints:clone(variant.constraints)}:{}),...(Array.isArray(variant.hiddenTests)?{hiddenTests:clone(variant.hiddenTests)}:{})};
  const entry={id,day:ctx.day,timeZone:ctx.timeZone,resetsAt:ctx.resetsAt,issuedAt:ctx.date.toISOString(),topicId,topicTitle:learned.get(topicId).title||topicId,variantId,title:variant.title??variant.name,prompt:variant.prompt??variant.description,starter:variant.starter,reward:rewardPack(bank.reward),task,checks:[],status:'available'};
  transaction(state=>{state.daily??=stored;state.daily.entries[ctx.day]=entry;});return {entry:ledger().entries[ctx.day]};
 }
 function current(id){
  const ctx=context(),{entry}=ensure(ctx);
  if(!entry||entry.id!==id||entry.day!==ctx.day||ctx.date.getTime()>=Date.parse(entry.resetsAt))throw Object.assign(Error('Этот дэйлик уже завершился. Открой сегодняшнее задание.'),{code:'DAILY_EXPIRED'});
  return {entry,ctx};
 }
 function summary(entry,date){const expired=date.getTime()>=Date.parse(entry.resetsAt);return {id:entry.id,day:entry.day,title:entry.title,topicId:entry.topicId,topicTitle:entry.topicTitle,status:entry.status==='claimed'?'claimed':expired?'expired':entry.status,completed:!!entry.completedAt,claimedAt:entry.claimedAt||null,resetsAt:entry.resetsAt};}
 function snapshot(){
  const ctx=context(),{entry,reason}=ensure(ctx),entries=Object.values(ledger().entries).sort((a,b)=>b.day.localeCompare(a.day));
  const today=entry?{...summary(entry,ctx.date),prompt:entry.prompt,starter:entry.starter,reward:clone(entry.reward),code:entry.checks.at(-1)?.code??entry.starter,lastResult:publicResult(entry.checks.at(-1)?.result,entry.task)}:null;
  return {timeZone:entry?.timeZone||ctx.timeZone,serverNow:ctx.date.toISOString(),resetsAt:entry?.resetsAt||ctx.resetsAt,today,history:entries.filter(item=>item.id!==entry?.id).map(item=>({...summary(item,ctx.date),code:item.checks.at(-1)?.code??item.starter,lastResult:publicResult(item.checks.at(-1)?.result,item.task),receivedAfterDeadline:item.checks.at(-1)?.receivedAfterDeadline===true})),reason:reason||null};
 }
 function task(id){return clone(current(id).entry.task);}
 function recordCheck(id,{code,result}){
  if(typeof code!=='string'||code.length>16000||!object(result)||result.infrastructureError)throw Error('Не удалось сохранить проверку дэйлика.');
  let selected;
  try{selected=current(id);}catch(error){
   // A run begun before midnight may finish after it. Keep the submitted
   // solution in its original day's history, but do not create completion.
   const old=error.code==='DAILY_EXPIRED'&&Object.values(ledger().entries).find(entry=>entry.id===id),date=now();
   if(old&&date.getTime()>=Date.parse(old.resetsAt))transaction(()=>{old.checks.push({at:date.toISOString(),code,result:clone(result),receivedAfterDeadline:true});old.checks=old.checks.slice(-30);});
   throw error;
  }
  const {entry,ctx}=selected;
  const passed=result.ok===true&&Array.isArray(result.tests)&&result.tests.length===entry.task.tests.length&&result.tests.every(test=>test.ok===true);
  transaction(()=>{entry.checks.push({at:ctx.date.toISOString(),code,result:clone(result)});entry.checks=entry.checks.slice(-30);if(passed){entry.completedAt??=ctx.date.toISOString();entry.successfulCheck={at:ctx.date.toISOString(),code,result:clone(result)};if(entry.status!=='claimed')entry.status='completed';}});
  return {completed:!!entry.completedAt,message:entry.status==='claimed'?'Повторение проверено. Сегодняшняя награда уже получена.':passed?'Дэйлик выполнен. Забери награду до обновления дня.':'Проверка сохранена. Исправь сложные места и попробуй ещё раз.'};
 }
 function claim(id){
  const {entry,ctx}=current(id);
  if(entry.status==='claimed')return {already:true,reward:{gems:0,gold:0,books:0,crystals:0,petals:0,materials:{}},message:'Сегодняшняя награда уже получена.'};
  if(!entry.completedAt||entry.status!=='completed')throw Error('Сначала выполни дэйлик и пройди все проверки.');
  transaction(state=>{
   for(const key of scalarRewards){const field=key==='gems'?'currency':key;state[field]=(state[field]||0)+entry.reward[key];}
   state.materials??={};for(const [key,value] of Object.entries(entry.reward.materials))state.materials[key]=(state.materials[key]||0)+value;
   entry.status='claimed';entry.claimedAt=ctx.date.toISOString();
  });
  return {reward:clone(entry.reward),message:'Награда за дэйлик получена. Следующее задание появится после полуночи.'};
 }
 return {snapshot,task,recordCheck,claim};
}
