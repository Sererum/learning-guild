/** Common course-independent game engine. Config is JSON-serializable for server/browser parity. */
export function createEngine(course){
const config=course.engineConfig||course;
const clone=value=>JSON.parse(JSON.stringify(value));
const {catalog=[],banners=[],courseMap={points:[],routes:[],regions:[]},courseHistory=[],achievements=[],taskRewards={},rewardGroups=[]}=config;
const itemById = id => catalog.find(x=>x.id===id);


function activeBanner(s,kind){return catalog.find(x=>x.kind===kind&&x.rarity===5&&!s.inventory[x.id])||null;}


function importCourseHistory(s,{awardRewards=true}={}){
  normalizeState(s);s.courseCredits??={};let added=0;
  for(const entry of courseHistory){
    if(!Object.hasOwn(s.courseCredits,entry.id)){
      const reward=awardRewards?entry.reward:0;
      s.courseCredits[entry.id]={reward,name:entry.name,kind:entry.kind,source:entry.source};
      s.currency+=reward;added+=reward;
    }
    for(const id of entry.points)if(!s.visited.includes(id))s.visited.push(id);
    for(const id of entry.closed||[])if(!s.completedTopics.includes(id))s.completedTopics.push(id);
  }
  return added;
}


function earnedAchievements(s){return achievements.filter(a=>a.confirmed?(s.completedTopics||[]).includes(a.id):a.requires.every(id=>s.claims[id]));}


function normalizeState(s){
  s.claims??={};s.history??=[];s.inventory??={};s.equipped??={};s.pity??={};
  for(const banner of banners)s.pity[banner.id]??=0;
  s.materials??=clone(config.normalization?.materials||config.initialState?.materials||{notes:6,tomes:1,ore:8,crystal:1,cloth:8,silk:1,dust:0});
  s.characterXp??=0;s.completedTopics??=clone(config.normalization?.completedTopics||[]);
  s.achievementSlots??=Array(5).fill(null);s.achievementSlots=Array.from({length:5},(_,i)=>s.achievementSlots[i]||null);
  s.statues??=[];s.visited??=[];s.lessonClaims??={};
  for(const group of rewardGroups){
    const migration=group.legacyMigration;
    if(migration&&s[migration.policyField]!==migration.policy){s[migration.creditField]=group.taskIds.filter(id=>s.claims[id]).length*migration.perTask;s[migration.policyField]=migration.policy;}
    if(migration&&s[migration.creditField]&&group.taskIds.every(id=>s.claims[id])&&!s.lessonClaims[group.id])s.lessonClaims[group.id]={gems:0,base:group.reward,imported:true};
  }
  s.pityFour??=Object.fromEntries(banners.map(b=>{let count=0;for(const drop of s.history.filter(x=>x.banner===b.id)){if(drop.rarity>=4)break;count++;}return [b.id,Math.min(4,count)];}));
  for(const [id,item] of Object.entries(config.normalization?.inventory||{}))s.inventory[id]??=clone(item);
  for(const [slot,id] of Object.entries(config.normalization?.equipped||{}))s.equipped[slot]??=id;
  for(const point of courseMap.points)if(point.kind==='statue'&&s.claims[point.task]&&!s.statues.includes(point.id))s.statues.push(point.id);
  return s;
}

function initialState(){return normalizeState(clone({version:1,name:'Исследователь',hair:'chestnut',skin:'warm',currency:0,gold:800,books:4,petals:0,crystals:0,level:19,stage:0,inventory:{},equipped:{},pity:{},claims:{},history:[],world:0,...config.initialState}));}

function itemPower(s,id){const x=itemById(id);if(!x)return 0;const level=s.inventory[id]?.level||0;return x.power+level*(x.kind==='artifact'?3:x.kind==='weapon'?2:1);}


function power(s){return s.level*2+s.stage*10+['flower','feather','clock','weapon','outfit'].reduce((sum,slot)=>sum+itemPower(s,s.equipped[slot]),0);}


function learnedPoints(s){
 const ids=new Set(s.completedTopics||[]);
 for(const entry of [...(config.historyCatalog||[]),...courseHistory])if(s.courseCredits?.[entry.id])(entry.points||[]).forEach(id=>ids.add(id));
 for(const [task,points] of Object.entries(config.taskTopics||{}))if(s.claims[task])points.forEach(id=>ids.add(id));
 for(const group of rewardGroups)if(group.taskIds.length&&group.taskIds.every(id=>s.claims[id]))[...(group.completedTopics||[]),...(group.visitedPoints||[])].forEach(id=>ids.add(id));
 return [...ids].filter(id=>!s.contentNeedsRecheckPoints?.includes(id)&&courseMap.points.some(p=>p.kind==='teleport'&&p.id===id));
}

function pointAvailable(s,p){
 const learned=learnedPoints(s);if(learned.includes(p.id))return true;
 if(p.kind==='daily'||p.kind==='repair')return learned.includes(p.topic)&&pointRevealed(s,p);
 if(p.kind==='statue')return (config.statuePrerequisites?.[p.id]||[]).every(id=>learned.includes(id));
 const previous=config.pointPrerequisites||{};
 return Object.hasOwn(previous,p.id)&&(!previous[p.id]||[previous[p.id]].flat().every(id=>learned.includes(id)))&&(!p.requires||!!s.claims[p.requires]);
}

function visiblePoints(s){return courseMap.points.filter(p=>pointAvailable(s,p));}


function discoveredZones(s){return [...learnedPoints(s),...courseMap.points.filter(p=>p.kind==='statue'&&s.claims[p.task]).map(p=>p.id)].map(id=>courseMap.points.find(p=>p.id===id)).filter(Boolean).map(p=>({id:p.id,x:p.x*10,y:p.y*6.5,radius:p.kind==='statue'?225:92,kind:p.kind}));}


function pointRevealed(s,p){const x=p.x*10,y=p.y*6.5;return discoveredZones(s).some(z=>Math.hypot(x-z.x,y-z.y)<=z.radius);}


function explorationPercent(s){const zones=discoveredZones(s);let count=0;for(let y=0;y<650;y+=13)for(let x=0;x<1000;x+=20)if(zones.some(z=>Math.hypot(x-z.x,y-z.y)<z.radius))count++;return Math.round(count/2500*100);}


function enhancementTarget(s,target){
  if(target==='character')return {id:target,kind:'character',name:s.name,level:s.level,xp:s.characterXp||0,cap:s.stage?40:20,step:500,offset:0};
  const x=itemById(target),owned=s.inventory[target];if(!x||!owned||!['artifact','weapon','outfit'].includes(x.kind))throw Error('Выбери героиню, оружие, одежду или артефакт');
  return {id:x.id,kind:x.kind,name:x.name,level:owned.level||0,xp:owned.xp||0,cap:x.kind==='artifact'?4:19,step:100,offset:x.kind==='artifact'?0:1};
}


function materialOptions(s,target){
  const t=enhancementTarget(s,target),m=s.materials||{};
  if(t.kind==='character')return [{id:'notes',name:'Заметки странницы',symbol:'▤',xp:100,count:m.notes||0},{id:'books',name:'Книга опыта',symbol:'▣',xp:500,count:s.books},{id:'tomes',name:'Том мудрости',symbol:'▥',xp:1000,count:m.tomes||0}];
  if(t.kind==='weapon')return [{id:'ore',name:'Руда усиления',symbol:'◆',xp:100,count:m.ore||0},{id:'crystal',name:'Звёздный кристалл',symbol:'✧',xp:500,count:m.crystal||0}];
  if(t.kind==='outfit')return [{id:'cloth',name:'Лунная ткань',symbol:'▧',xp:100,count:m.cloth||0},{id:'silk',name:'Звёздный шёлк',symbol:'❧',xp:500,count:m.silk||0}];
  return [{id:'dust',name:'Пыль реликвий',symbol:'✦',xp:100,count:m.dust||0},...catalog.filter(x=>x.kind==='artifact'&&x.rarity===3).map(x=>({id:'fodder:'+x.id,name:x.name,symbol:'✿',xp:100,count:Math.max(0,(s.inventory[x.id]?.count||0)-((target===x.id||Object.values(s.equipped).includes(x.id))?1:0))}))];
}


function enhancementPlan(s,target,selection){
  const t=enhancementTarget(s,target);if(t.level>=t.cap)throw Error(t.kind==='character'?'Достигнут предел: пора возвысить героиню':'Достигнут предел усиления в демо');
  if(!selection||typeof selection!=='object'||Array.isArray(selection))throw Error('Выбери материалы');
  const options=materialOptions(s,target);let xp=0;const used=[];
  for(const [id,count] of Object.entries(selection)){if(!Number.isInteger(count)||count<0||count>999)throw Error('Количество материалов должно быть целым от 0 до 999');if(!count)continue;const option=options.find(x=>x.id===id);if(!option||count>option.count)throw Error('Выбранных материалов недостаточно');xp+=count*option.xp;used.push({...option,count});}
  if(!xp)throw Error('Выбери хотя бы один материал');
  const remaining=(t.cap-t.level)*t.step-t.xp;if(xp>remaining)throw Error('Опыт превышает предел. Уменьши количество материалов — лишний опыт не тратится.');
  const coins=Math.ceil(xp*(t.kind==='character'?.2:.8));if(s.gold<coins)throw Error(`Нужно ${coins} монет для усиления`);
  const afterLevel=t.level+Math.floor((t.xp+xp)/t.step),afterXp=(t.xp+xp)%t.step;
  const copy={...s,inventory:{...s.inventory}};
  if(t.kind==='character'){copy.level=afterLevel;copy.characterXp=afterXp;}else copy.inventory[target]={...s.inventory[target],level:afterLevel,xp:afterXp};
  return {target:t,xp,coins,used,before:{level:t.level,xp:t.xp,power:power(s),itemPower:t.kind==='character'?power(s):itemPower(s,target)},after:{level:afterLevel,xp:afterXp,power:power(copy),itemPower:t.kind==='character'?power(copy):itemPower(copy,target)}};
}


function applyEnhancement(s,target,selection){
  const p=enhancementPlan(s,target,selection);
  for(const material of p.used){if(material.id==='books')s.books-=material.count;else if(material.id.startsWith('fodder:')){const id=material.id.slice(7);s.inventory[id].count-=material.count;if(!s.inventory[id].count)delete s.inventory[id];}else s.materials[material.id]-=material.count;}
  s.gold-=p.coins;if(p.target.kind==='character'){s.level=p.after.level;s.characterXp=p.after.xp;}else {s.inventory[target].level=p.after.level;s.inventory[target].xp=p.after.xp;}
  return {message:`${p.target.name}: ${p.target.kind==='artifact'?'+':'уровень '}${p.before.level+p.target.offset} → ${p.target.kind==='artifact'?'+':''}${p.after.level+p.target.offset}. Потрачено ${p.coins} монет.`,enhancement:p};
}


function claimKey(task,day){return (config.recurringTasks||[]).includes(task)?task+':'+day:task;}

const lessonBaseReward=rewardGroups.find(g=>g.id===config.legacyPrimaryGroupId)?.reward||0;

const qualityCap=task=>config.qualityCaps?.[task]??10;

function canStudyGate(s,id){
 const gate=config.gates?.[id];if(!gate)return true;
 const allClaims=(gate.allClaims||[]).every(key=>s.claims[key]);
 const any=[...(gate.anyClaims||[]).map(key=>s.claims[key]),...(gate.anyCredits||[]).map(key=>s.courseCredits?.[key])];
 return allClaims&&(!any.length||any.some(Boolean));
}
function canStudyAlgorithms(s){return canStudyGate(s,config.legacyPrimaryGroupId);}

function claimQuality(s,task,review,proof,rubric){
 if(!Object.hasOwn(config.qualityCaps||{},task)||!s.claims[task]||!rubric.approved||review.rubricVersion!==rubric.version||!proof?.allPassed||proof.codeHash!==review.codeHash||review.mode!=='review')return {gems:0,message:'Бонус доступен после успешных тестов и ревью этой версии кода.'};
 const criteria=['correctness','readability','efficiency'].map(key=>review.criteria?.[key]?.score);
 if(criteria.some(n=>!Number.isInteger(n)||n<1||n>10))return {gems:0,message:'Нужны три оценки качества от 1 до 10.'};
 const cap=qualityCap(task),target=Math.round(cap*criteria.reduce((sum,n)=>sum+n,0)/30),paid=s.qualityClaims?.[task]?.gems||0,delta=Math.max(0,target-paid);
 if(!delta)return {gems:0,total:paid,cap,message:'Лучший бонус сохранён. Можно продолжать улучшать решение.'};
 s.qualityClaims??={};s.qualityClaims[task]={codeHash:review.codeHash,criteria:review.criteria,rubricVersion:rubric.version,gems:paid+delta};s.currency+=delta;
 return {gems:delta,total:paid+delta,cap,message:paid?'За улучшение качества: +'+delta+' примогемов. Всего '+(paid+delta)+' / '+cap+'.':'Бонус за качество: +'+delta+' примогемов из '+cap+'.'};
}

// Supplies are paid alongside a first successful check, using the same claim key.
// Course history and repeated/current-version checks never replay this payment.
function studySupplies(rule,group,lessonComplete){
  const legacy={gold:rule.exam?400:100,books:rule.exam?4:1,materials:{ore:2,cloth:2,notes:2}};
  const pack=config.resourceRewards?.[rule.exam?'exam':'task']||legacy;
  return {gold:pack.gold||0,books:pack.books||0,crystals:(pack.crystals||0)+(rule.crystals||0),petals:(pack.petals||0)+(rule.petals||0)+(lessonComplete&&group?.kind==='repair'?1:0),materials:{...(pack.materials||{})}};
}
function grantSupplies(s,resources){
  for(const id of ['gold','books','crystals','petals'])s[id]=(s[id]||0)+resources[id];
  for(const [id,count] of Object.entries(resources.materials))s.materials[id]=(s.materials[id]||0)+count;
}
function suppliesMessage(resources){
  const names={gold:'монет',books:'книг опыта',crystals:'кристаллов ясности',petals:'лепестков памяти',notes:'заметок',ore:'руды',cloth:'ткани',dust:'пыли реликвий',tomes:'томов мудрости',crystal:'звёздных кристаллов',silk:'звёздного шёлка'};
  const entries=[...Object.entries(resources).filter(([id])=>id!=='materials'),...Object.entries(resources.materials)];
  return ' Ресурсы: '+entries.filter(([,n])=>n>0).map(([id,n])=>'+'+n+' '+(names[id]||id)).join(', ')+'.';
}


function claim(s,task,day,options={}){
  normalizeState(s);const previousAchievements=new Set(earnedAchievements(s).map(a=>a.id));
  const rule=config.taskRules?.[task]||{},group=rewardGroups.find(g=>g.taskIds.includes(task));
  if(rule.coveredBy&&s.claims[rule.coveredBy]){s.claims[task]=true;return {gems:0,already:true,message:'Награда за эту тему уже учтена прошлым экзаменом. Текущая практика зачтена без повторной выплаты.'};}
  const key=claimKey(task,day),completion=options.completionClaims||s.claims;
  if(s.claims[key]){
    if(options.completionClaims&&group&&!s.lessonClaims[group.id]&&group.taskIds.every(id=>id===task||completion[id])){
      const gems=Math.max(0,group.reward-(group.legacyMigration?s[group.legacyMigration.creditField]||0:0));
      s.lessonClaims[group.id]=group.kind==='repair'?{gems}:{gems,base:group.reward};s.currency+=gems;
      s.completedTopics=Array.from(new Set([...s.completedTopics,...(group.completedTopics||[])]));s.visited=Array.from(new Set([...s.visited,...(group.visitedPoints||[])]));
      return {gems,lessonComplete:true,message:'Актуальная версия всех задач проверена. +'+gems+' примогемов за завершение урока.'};
    }
    return {message:group?.kind==='lesson'?'Задача уже зачтена. Можно улучшать решение и получать доплату за качество.':'Эта награда уже получена. Можно продолжать тренироваться.',already:true};
  }
  if(!Object.hasOwn(taskRewards,task))throw Error('Неизвестное поручение');
  if(!(rule.requiresClaims||[]).every(id=>s.claims[claimKey(id,day)]))throw Error(rule.requiresMessage||'Сначала заверши предыдущие задания');
  if(rule.gate&&!canStudyGate(s,rule.gate))throw Error(config.gates?.[rule.gate]?.message||'Сначала заверши предыдущую главу');
  s.claims[key]=true;let gems=group?0:taskRewards[task];
  const lessonComplete=!!group&&group.taskIds.every(id=>id===task||completion[id]);
  if(lessonComplete&&!s.lessonClaims[group.id]){
    gems=Math.max(0,group.reward-(group.legacyMigration?s[group.legacyMigration.creditField]||0:0));
    s.lessonClaims[group.id]=group.kind==='repair'?{gems}:{gems,base:group.reward};
  }
  if(lessonComplete){
    s.completedTopics=Array.from(new Set([...s.completedTopics,...(group.completedTopics||[])]));
    s.visited=Array.from(new Set([...s.visited,...(group.visitedPoints||[])]));
  }
  s.currency+=gems;
  const resources=studySupplies(rule,group,lessonComplete);grantSupplies(s,resources);
  for(const [id,item] of Object.entries(rule.grantsInventory||{}))s.inventory[id]??=clone(item);
  for(const point of courseMap.points)if(point.kind==='statue'&&point.task===task&&!s.statues.includes(point.id))s.statues.push(point.id);
  const linkedPoints=courseMap.points.filter(p=>p.kind==='teleport'&&p.task===task&&(!p.requires||s.claims[p.requires]));
  s.visited=Array.from(new Set([...s.visited,...linkedPoints.map(p=>p.id)]));
  const newAchievements=earnedAchievements(s).filter(a=>!previousAchievements.has(a.id));
  if(group?.kind==='repair')return {gems,resources,lessonComplete,message:(lessonComplete?'Работа над ошибками пройдена. +'+gems+' примогемов.':'Задача пройдена. Готово '+group.taskIds.filter(id=>s.claims[id]).length+' / '+group.taskIds.length+'. '+group.reward+' примогемов после всей работы.')+suppliesMessage(resources)};
  if(group)return {gems,resources,lessonComplete,message:(lessonComplete?'Все задания урока пройдены. +'+gems+' примогемов за урок.':'Задача пройдена. Готово '+group.taskIds.filter(id=>s.claims[id]).length+' / '+group.taskIds.length+'. Награда за весь урок — '+group.reward+' примогемов.')+suppliesMessage(resources)};
  return {message:`Проверено. +${gems} примогемов.${suppliesMessage(resources)}${newAchievements.length?' Открыто достижений: '+newAchievements.length+'.':''}`,gems,resources,newAchievements};
}

function wish(s,banner,rng=Math.random){
  if(!banners.some(x=>x.id===banner))throw Error('Выбери баннер');if(s.currency<160)throw Error('Нужно 160 примогемов. Получи их за учебное поручение.');
  const featured=activeBanner(s,banner);if(!featured)throw Error('Все легендарные вещи этой коллекции собраны. Выбери другой баннер.');
  const pool=catalog.filter(x=>x.kind===banner&&x.wishable!==false&&!(config.wishExcludedItems||[]).includes(x.id));
  const pity=s.pity[banner]+1,four=(s.pityFour?.[banner]||0)+1;const roll=rng();const rarity=(pity>=20||roll<.10)?5:(four>=5||roll<.35)?4:3;
  const choices=pool.filter(x=>x.rarity===rarity);const item=rarity===5?featured:choices[Math.min(choices.length-1,Math.floor(rng()*choices.length))];
  if(!item)throw Error('В баннере нет подходящей награды');
  s.pityFour??={};s.currency-=160;s.pity[banner]=rarity===5?0:pity;s.pityFour[banner]=rarity>=4?0:four;
  const duplicate=!!s.inventory[item.id];let converted=false;
  if(duplicate&&item.kind!=='artifact'){s.gold+=60;converted=true;}else if(duplicate)s.inventory[item.id].count+=1;else s.inventory[item.id]={count:1,level:0};
  const result={id:item.id,name:item.name,rarity:item.rarity,duplicate,converted,banner};s.history.unshift(result);s.history=s.history.slice(0,12);return result;
}


function act(s,action,day,rng=Math.random){
  normalizeState(s);
  if(action.type==='achievement'){
    const slot=action.slot;if(!Number.isInteger(slot)||slot<0||slot>4)throw Error('Выбери один из пяти слотов достижений');
    if(action.id===null){s.achievementSlots[slot]=null;return {message:'Слот витрины освобождён.'};}
    const achievement=earnedAchievements(s).find(a=>a.id===action.id);if(!achievement)throw Error('Сначала полностью закрой тему, чтобы получить это достижение');
    const oldSlot=s.achievementSlots.indexOf(action.id),oldValue=s.achievementSlots[slot];
    if(oldSlot>=0)s.achievementSlots[oldSlot]=oldValue;
    s.achievementSlots[slot]=action.id;return {message:`В витрине: ${achievement.name}.`};
  }
  if(action.type==='enhance')return applyEnhancement(s,action.target,action.materials);
  if(action.type==='activate-statue'){
    const point=courseMap.points.find(p=>p.id===action.id&&p.kind==='statue');if(!point)throw Error('Статуя не найдена');
    if(!s.claims[point.task])throw Error('Сначала пройди экзамен этой статуи. Нажатие не закрывает тему.');
    return {message:'Экзамен пройден, статуя уже открыта.'};
  }
  if(action.type==='teleport'){
    const point=courseMap.points.find(x=>x.id===action.id&&x.kind==='teleport');if(!point)throw Error('Телепорт не найден');
    if(!learnedPoints(s).includes(point.id))throw Error('Телепорт откроется после прохождения соответствующей темы. Сначала реши её задания.');
    return {message:`Знакомая тема: ${point.name}. Можно повторить материал.`};
  }
  if(action.type==='wish'){
    const count=action.count??1;
    if(![1,10].includes(count))throw Error('Выбери одну или десять молитв');
    if(!banners.some(x=>x.id===action.banner))throw Error('Выбери баннер');
    if(s.currency<count*160)throw Error(`Нужно ${count*160} примогемов. Получи их за учебные поручения.`);
    if(count===1)return {drop:wish(s,action.banner,rng)};
    if(!activeBanner(s,action.banner))throw Error('Все легендарные вещи этой коллекции собраны');
    const drops=[];for(let i=0;i<count&&activeBanner(s,action.banner);i++)drops.push(wish(s,action.banner,rng));
    return {drops,message:`Совершено молитв: ${drops.length}. Все находки добавлены в коллекцию.${drops.length<count?' Коллекция собрана; неиспользованные молитвы не оплачены.':''}`};
  }
  if(action.type==='profile'){s.name=String(action.name||(config.initialState?.name||'Исследователь')).trim().slice(0,24)||(config.initialState?.name||'Исследователь');if(['chestnut','dark','silver'].includes(action.hair))s.hair=action.hair;if(['warm','light','deep'].includes(action.skin))s.skin=action.skin;return {message:'Героиня готова к приключению.'};}
  if(action.type==='equip'){const item=itemById(action.id);if(!item||!s.inventory[item.id])throw Error('Вещи пока нет в коллекции');s.equipped[item.kind==='artifact'?item.slot:item.kind]=item.id;return {message:`Экипировано: ${item.name}`};}
  if(action.type==='level')return applyEnhancement(s,'character',{books:1});
  if(action.type==='ascend'){if(s.stage)throw Error('В демо доступно первое возвышение');if(s.level<20||s.crystals<1||s.petals<2||s.gold<300)throw Error('Нужны уровень 20, 1 кристалл, 2 лепестка памяти и 300 монет');s.stage=1;s.crystals--;s.petals-=2;s.gold-=300;return {message:'Первое возвышение! Предел уровня 40. Открыта аура звёздного архива.'};}
  if(action.type==='upgrade'){const target=itemById(action.id);if(!target||target.kind!=='artifact'||!s.inventory[target.id])throw Error('Выбери свой артефакт');const material=materialOptions(s,action.id).find(m=>m.id.startsWith('fodder:')&&m.count>0);if(!material)throw Error('Нужен свободный обычный артефакт. Экипированные вещи и выбранный артефакт сохраняются.');return applyEnhancement(s,action.id,{[material.id]:1});}
  if(action.type==='world'){if(s.world)throw Error('Обсерватория уже восстановлена');if(!(config.worldRequirement?.claims||[]).every(id=>s.claims[id]))throw Error(config.worldRequirement?.message||'Сначала заверши необходимые задания');if(power(s)<(config.worldRequirement?.power||45))throw Error('Для восстановления нужен резонанс 45. Подними уровень или экипируй артефакт.');s.world=1;return {message:'Обсерватория ожила: твоё знание открыло печать, а резонанс восстановил свет. Доступна новая локация.'};}
  throw Error('Неизвестное действие');
}

return {config,catalog,banners,courseMap,courseHistory,achievements,taskRewards,itemById,activeBanner,importCourseHistory,earnedAchievements,normalizeState,initialState,itemPower,power,learnedPoints,pointAvailable,visiblePoints,discoveredZones,pointRevealed,explorationPercent,enhancementTarget,materialOptions,enhancementPlan,applyEnhancement,claimKey,lessonBaseReward,qualityCap,canStudyAlgorithms,claimQuality,claim,wish,act,canStudyGate};
}
