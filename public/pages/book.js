import {isTaskClaimed,journeyPoints,visibleRegions,describePoint,journeyRoutes} from '../journey.js';
const bookUI = {section:'lessons', status:'all', query:''};
let chosenSlot = 0;
const tabs = [['lessons','Уроки'],['daily','Ежедневные'],['repair','Работы над ошибками'],['history','История']];
const points = ctx => journeyPoints(ctx);
const done = isTaskClaimed;
function routeOrder(ctx) {
  const order=new Map(); let id=ctx.data.courseMap?.start?.id;
  while(id&&!order.has(id)){order.set(id,order.size);id=journeyRoutes(ctx).find(r=>r.from===id&&!r.side)?.to;}
  return order;
}
const learned = ctx => ctx.rules.learnedPoints(ctx.data.state);
const available = (ctx,p) => ctx.rules.pointAvailable(ctx.data.state,p);
function lockedTask(ctx,id) {
  const linked = points(ctx).filter(p=>p.task===id);
  return linked.length ? !linked.some(p=>available(ctx,p)) : false;
}
function entries(ctx) {
  if(bookUI.section==='history') return (ctx.rules.courseHistory||[]).filter(x=>ctx.data.state.courseCredits?.[x.id]).map(t=>({...t,completed:true,history:true,available:false,status:'Архив · временно недоступно',note:'История и награда сохранены. Прошлые уроки временно недоступны.',tag:t.kind==='repair'?'Разбор':'Урок',description:'Работа сохранена в истории курса.',rewardInfo:{amount:Number(ctx.data.state.courseCredits[t.id].reward??t.reward)||0,earned:true,label:'Уже начислено за прошлую работу'}}));
  const regions=new Set(visibleRegions(ctx).map(r=>r.id)),order=routeOrder(ctx);
  const list=points(ctx).filter(p=>regions.has(p.region)).filter(p=>bookUI.section==='daily'?p.kind==='daily':bookUI.section==='repair'?p.kind==='repair':!['daily','repair'].includes(p.kind));
  return list.sort((a,b)=>Number(describePoint(ctx,b).current)-Number(describePoint(ctx,a).current)||Number(describePoint(ctx,b).available)-Number(describePoint(ctx,a).available)||(order.get(a.id)??999)-(order.get(b.id)??999)).map(p=>{
    const info=describePoint(ctx,p),task=(ctx.data.tasks||[]).find(t=>t.id===info.taskId),region=visibleRegions(ctx).find(r=>r.id===p.region);
    return {...p,...info,rewardInfo:info.reward,tag:p.kind==='statue'?'Экзамен':p.kind==='daily'?'Дэйлик':p.kind==='repair'?'Работа над ошибками':'Тема',practiceName:info.current?ctx.data.lessons?.find(l=>l.id===info.lessonId)?.title:task?.name||ctx.data.lessons?.find(l=>l.id===info.lessonId)?.title,regionName:region?.name};
  });
}
function openButton(ctx,t) {
  const e=ctx.esc;
  if(t.history)return `<button class="button" data-book-history="${e(t.id)}" disabled>Архив · недоступно</button>`;
  return `<button class="button ${t.available?'primary':''}" data-book-open-point="${e(t.id)}" ${t.available?'':'disabled'}>${e(t.actionLabel||'Временно недоступно')}</button>`;
}
function renderCard(ctx,t) {
  const e=ctx.esc,reward=t.rewardInfo;
  const missing=(t.requirements||[]).filter(r=>!r.completed);
  return `<article class="book-card ${t.completed?'book-complete':''}" data-book-point="${e(t.id)}"><div class="book-card-top"><span class="book-seal" aria-hidden="true">${t.completed?'✓':t.kind==='statue'?'♜':t.kind==='repair'?'↻':'✦'}</span><div><span class="eyebrow">${e(t.tag)}${t.regionName?` · ${e(t.regionName)}`:''}</span><h3>${e(t.name)}</h3></div></div>${t.practiceName&&t.practiceName!==t.name?`<p class="book-practice-name">Практика: ${e(t.practiceName)}</p>`:''}<p class="muted">${e(t.description)}</p>${!t.history?`<p class="book-status">${e(t.status)}</p>`:''}<div class="book-card-bottom"><div><strong>${reward.amount===null?'Награда не назначена':`Награда · <img class="primogem-icon" src="/assets/primogem.svg" width="24" height="24" alt="" aria-hidden="true"> ${reward.amount}`}</strong><small>${e(reward.label)}</small></div>${openButton(ctx,t)}</div>${missing.length?`<p class="book-lock-note">Для открытия: ${missing.map(r=>e(r.name)).join(' · ')}.</p>`:''}${t.unlocks?.length?`<p class="book-lock-note">Открывает путь: ${t.unlocks.map(r=>e(r.name)).join(' · ')}.</p>`:''}</article>`;
}
export function renderBook(ctx) {
  const e=ctx.esc, all=entries(ctx), query=bookUI.query.trim().toLocaleLowerCase('ru');
  const list=all.filter(t=>(bookUI.status==='all'||(bookUI.status==='done' ? t.completed : !t.completed))&&(!query||`${t.name} ${t.tag||''}`.toLocaleLowerCase('ru').includes(query)));
  return `<header class="book-heading"><div><span class="eyebrow">Архив лунного сада</span><h1>Книга поручений</h1><p class="muted">Те же темы, что на карте: выбери урок, повторение или разбор.</p></div><span class="book-emblem" aria-hidden="true">♧</span></header>
  <nav class="book-tabs" aria-label="Разделы книги">${tabs.map(([id,label])=>`<button class="book-tab" data-book-section="${id}" aria-pressed="${bookUI.section===id}">${label}</button>`).join('')}</nav>
  <section class="book-spread"><aside class="book-intro"><span class="eyebrow">${e(tabs.find(t=>t[0]===bookUI.section)[1])}</span><h2>${bookUI.section==='daily'?'Маленький шаг сегодня':bookUI.section==='repair'?'Можно разобраться спокойно':bookUI.section==='history'?'Твой пройденный путь':'Приключение начинается с вопроса'}</h2><div class="book-progress"><strong>${all.filter(t=>t.completed).length}<small> / ${all.length}</small></strong><span>${bookUI.section==='history'?'сохранённых работ':'выполнено в разделе'}</span></div><div class="book-ornament" aria-hidden="true">✦ ─── ❧ ─── ✦</div><p>${bookUI.section==='daily'?'Сегодняшнее повторение приносит 60 примогемов. Новый день начинается по московскому времени. Пропуски ничего не отнимают.':bookUI.section==='repair'?'Вернись к сложному месту с новыми силами. За проверенный разбор — 40 примогемов.':bookUI.section==='history'?'Здесь собраны работы, уже перенесённые в сохранение. Предыдущие уроки временно недоступны. История и начисленные награды сохранены.':'Полный урок приносит число микроблоков × 160 примогемов после всех тестов. Качество оценивается отдельно; улучшенное решение может принести доплату.'}</p><p class="muted">Сначала предскажи. Затем проверь. Сравни с ожиданием.</p><button class="button" data-book-map>Вернуться к карте</button></aside>
  <div class="book-pages"><div class="book-filters"><label>Поиск поручения<input data-book-search type="search" placeholder="Название или тема" value="${e(bookUI.query)}"></label><label>Показать<select data-book-status><option value="all" ${bookUI.status==='all'?'selected':''}>Все</option><option value="next" ${bookUI.status==='next'?'selected':''}>Впереди</option><option value="done" ${bookUI.status==='done'?'selected':''}>Выполненные</option></select></label></div>
  <div class="book-list">${list.map(t=>renderCard(ctx,t)).join('')||'<div class="book-empty"><span aria-hidden="true">❧</span><h3>Пока нет таких поручений</h3><p class="muted">Измени поиск или выбери другой раздел.</p></div>'}</div><footer class="book-page-footer"><span>Книга всегда помнит твои шаги</span><span>${e(ctx.data.day||'')}</span></footer></div></section>`;
}
export function bindBook(root,ctx) {
  const redraw=()=>{root.innerHTML=renderBook(ctx);bindBook(root,ctx);};
  root.querySelectorAll('[data-book-section]').forEach(b=>b.onclick=()=>{bookUI.section=b.dataset.bookSection;redraw();});
  root.querySelector('[data-book-status]')?.addEventListener('change',e=>{bookUI.status=e.target.value;redraw();});
  root.querySelector('[data-book-search]')?.addEventListener('input',e=>{const pos=e.target.selectionStart;bookUI.query=e.target.value;redraw();const input=root.querySelector('[data-book-search]');input.focus();input.setSelectionRange(pos,pos);});
  root.querySelector('[data-book-map]')?.addEventListener('click',()=>ctx.navigate('world'));
  root.querySelectorAll('[data-book-open-point]').forEach(b=>b.onclick=()=>{const p=points(ctx).find(p=>p.id===b.dataset.bookOpenPoint);if(p&&describePoint(ctx,p).available)ctx.openLesson(describePoint(ctx,p).taskId,p.id);});
  // Archived records are visible but cannot open a lesson during this rollout.
}
function treeNode(ctx,p) {
  const e=ctx.esc,info=describePoint(ctx,p),complete=info.completed,open=info.available;
  return `<article class="tree-node ${complete?'tree-complete':open?'tree-available':'tree-locked'}"><span class="tree-node-seal" aria-hidden="true">${complete?'✓':!open?'⌑':p.kind==='statue'?'♜':'◇'}</span><div class="tree-node-copy"><span class="eyebrow">${e(info.status)}</span><h3>${e(p.name)}</h3><p>${e(info.note)}</p></div><button class="button" data-tree-open="${e(p.id)}" ${open?'':'disabled'}>${e(info.actionLabel)}</button></article>`;
}
export function renderTree(ctx) {
  const e=ctx.esc,map=ctx.data.courseMap, list=points(ctx), learnt=learned(ctx),order=routeOrder(ctx);
  return `<header class="book-heading"><div><span class="eyebrow">Знания растут вместе с тобой</span><h1>Дерево пути</h1><p class="muted">Основная дорога ведёт вперёд. Боковые ветви помогают вернуться к знакомому.</p></div><div class="tree-counter"><strong>${learnt.length}</strong><span>из ${list.filter(p=>p.kind==='teleport').length} тем пройдено</span></div></header><div class="tree-legend"><span>✓ Пройдено</span><span>◇ Доступно</span><span>⌑ Откроется позже</span></div><div class="tree-regions">${(map?.regions||[]).map(r=>{const main=list.filter(p=>p.region===r.id&&!(map.routes||[]).some(x=>x.to===p.id&&x.side)).sort((a,b)=>(order.get(a.id)??999)-(order.get(b.id)??999));const side=list.filter(p=>p.region===r.id&&(map.routes||[]).some(x=>x.to===p.id&&x.side));return `<section class="panel tree-region"><div class="tree-region-heading"><span class="eyebrow">${e(r.subtitle||'Регион')}</span><h2>${e(r.name)}</h2></div><div class="tree-trunk">${main.map(p=>treeNode(ctx,p)).join('<div class="tree-arrow" aria-hidden="true">↓</div>')}</div>${side.length?`<details class="tree-side" open><summary>Боковые ветви · ${side.length}</summary><div>${side.map(p=>treeNode(ctx,p)).join('')}</div></details>`:''}</section>`;}).join('')}</div>`;
}
export function bindTree(root,ctx) {root.querySelectorAll('[data-tree-open]').forEach(b=>b.onclick=()=>{const p=points(ctx).find(x=>x.id===b.dataset.treeOpen);if(describePoint(ctx,p).available)ctx.openLesson(describePoint(ctx,p).taskId,p.id);});}
export function renderAchievements(ctx) {
  const e=ctx.esc, catalogue=ctx.rules.achievements||[], earned=ctx.rules.earnedAchievements(ctx.data.state),ids=new Set(earned.map(a=>a.id)),slots=ctx.data.state.achievementSlots||[];
  return `<header class="book-heading"><div><span class="eyebrow">Маленькие доказательства больших открытий</span><h1>Галерея достижений</h1><p class="muted">Полностью закрытая тема оставляет знак. Собери свою историю из пяти любимых.</p></div><div class="tree-counter"><strong>${earned.length}</strong><span>из ${catalogue.length} открыто</span></div></header><section class="panel achievement-showcase"><div class="achievement-showcase-heading"><h2>Твоя витрина</h2><span class="muted">Выбери место, затем достижение</span></div><div class="achievement-slots">${Array.from({length:5},(_,i)=>{const a=catalogue.find(x=>x.id===slots[i]);return `<button class="achievement-slot ${chosenSlot===i?'achievement-selected':''} ${a?'achievement-filled':''}" data-achievement-slot="${i}" aria-pressed="${chosenSlot===i}" aria-label="Место ${i+1}${a?`: ${e(a.name)}`:': пусто'}"><small>Место ${i+1}</small><span aria-hidden="true">${e(a?.symbol||'✧')}</span><strong>${e(a?.name||'Твоё открытие впереди')}</strong></button>`;}).join('')}</div><div class="achievement-toolbar"><p role="status">Выбрано место ${chosenSlot+1}${slots[chosenSlot]?` · ${e(catalogue.find(a=>a.id===slots[chosenSlot])?.name||'')}`:''}</p><button class="button" data-achievement-clear ${slots[chosenSlot]?'':'disabled'}>Освободить место</button></div></section><section class="achievement-catalogue" aria-label="Все достижения">${catalogue.map(a=>{const unlocked=ids.has(a.id),at=slots.indexOf(a.id);return `<article class="panel achievement-card ${unlocked?'achievement-earned':'achievement-locked'}"><div class="achievement-medal" aria-hidden="true">${e(a.symbol)}</div><span class="eyebrow">${unlocked?'Открыто':'Ещё впереди'}</span><h2>${e(a.name)}</h2><p class="achievement-topic">${e(a.topic)}</p><p class="muted">${e(a.description)}</p>${unlocked?`<button class="button" data-achievement-equip="${e(a.id)}">${at>=0?`Перенести из места ${at+1}`:`В место ${chosenSlot+1}`}</button>`:'<span class="achievement-condition">Откроется после завершения темы</span>'}</article>`;}).join('')}</section>`;
}
export function bindAchievements(root,ctx) {
  root.querySelectorAll('[data-achievement-slot]').forEach(b=>b.onclick=()=>{chosenSlot=Number(b.dataset.achievementSlot);root.innerHTML=renderAchievements(ctx);bindAchievements(root,ctx);});
  root.querySelector('[data-achievement-clear]')?.addEventListener('click',()=>ctx.api({type:'achievement',slot:chosenSlot,id:null}));
  root.querySelectorAll('[data-achievement-equip]').forEach(b=>b.onclick=()=>ctx.api({type:'achievement',slot:chosenSlot,id:b.dataset.achievementEquip}));
}
