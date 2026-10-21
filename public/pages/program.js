// Reconcile status updates without replacing the workspace, forms or scroll owners.
const identity=node=>node.nodeType!==1?'#'+node.nodeType:node.id?'id:'+node.id:[...node.attributes].find(a=>a.name.startsWith('data-'))?.name+':'+([...node.attributes].find(a=>a.name.startsWith('data-'))?.value||'')+':'+node.tagName+':'+node.classList[0];
const matches=(a,b)=>a.nodeType===b.nodeType&&(a.nodeType!==1||a.tagName===b.tagName&&identity(a)===identity(b));
function patchProgramNode(current,next){
 if(current.isEqualNode(next))return;
 if(current.nodeType!==1){if(current.nodeValue!==next.nodeValue)current.nodeValue=next.nodeValue;return;}
 const protectedAttribute=name=>current.tagName==='DETAILS'&&name==='open'||['INPUT','TEXTAREA','SELECT','OPTION'].includes(current.tagName)&&['value','checked','selected'].includes(name);
 for(const a of [...current.attributes])if(!next.hasAttribute(a.name)&&!protectedAttribute(a.name))current.removeAttribute(a.name);
 for(const a of next.attributes)if(!protectedAttribute(a.name)&&current.getAttribute(a.name)!==a.value)current.setAttribute(a.name,a.value);
 if(current.tagName==='TEXTAREA'||current.tagName==='INPUT')return;
 const selected=current.tagName==='SELECT'?current.value:null;
 let cursor=current.firstChild;
 for(const desired of [...next.childNodes]){
  let existing=cursor;
  if(!existing||!matches(existing,desired)){
   existing=[...current.childNodes].slice(cursor?[...current.childNodes].indexOf(cursor):current.childNodes.length).find(n=>matches(n,desired));
   if(existing)current.insertBefore(existing,cursor);else{existing=desired.cloneNode(true);current.insertBefore(existing,cursor);}
  }
  patchProgramNode(existing,desired);cursor=existing.nextSibling;
 }
 while(cursor){const nextSibling=cursor.nextSibling;cursor.remove();cursor=nextSibling;}
 if(selected!==null&&[...current.options].some(o=>o.value===selected))current.value=selected;
}

const liveBindings=new WeakMap();
import {renderProgram as renderPractice,bindProgram as bindPractice} from './program-practice.js';

let storageScope='',selection={kind:'program',id:'program'},drafts={},error='',notice='',sending=false;
const labels={done:'Пройдено',repair:'Нужен разбор',ready:'Материал готов',future:'В плане'};
const icons={done:'✓',repair:'!',ready:'◆',future:'◇'};
const key=()=>selection.kind+':'+selection.id;
// Keep excluded chapters in the data/history, but not on the active route.
const visibleBlocks=p=>p.blocks.filter(b=>p.nodes.some(n=>n.blockId===b.id&&!n.excluded));
function saveView(){try{window.guildStorage.setItem('program-console:v2',JSON.stringify({selection,drafts}));}catch{}}
function configure(data){
 if(storageScope!==data.course.storageScope){storageScope=data.course.storageScope;selection={kind:'program',id:'program'};drafts={};error='';notice='';try{const saved=JSON.parse(window.guildStorage.getItem('program-console:v2')||'null');if(saved){selection=saved.selection||selection;drafts=saved.drafts||{};}}catch{}}
 const p=data.program;
 if(selection.kind==='lesson'&&!p.nodes.some(n=>n.id===selection.id)||selection.kind==='topic'&&!visibleBlocks(p).some(b=>b.id===selection.id)||!['program','topic','lesson'].includes(selection.kind))selection={kind:'program',id:'program'};
}
function renderNode(n,e,{compact=false}={}){
 const active=selection.kind==='lesson'&&selection.id===n.id;
 return `<button class="route-node is-${n.status} ${active?'is-selected':''} ${compact?'is-compact':''}" data-route-node="${e(n.id)}" aria-pressed="${active}"><span class="route-dot" aria-label="${labels[n.status]}">${icons[n.status]}</span><span>${e(n.title)}${!n.main?'<small>Дополнительная ветка</small>':''}</span></button>`;
}
function renderBranches(parentId,p,e,seen=new Set()){
 if(seen.has(parentId))return '';const next=new Set(seen).add(parentId);
 return p.nodes.filter(n=>!n.main&&!n.excluded&&n.parentId===parentId).map(n=>`<div class="route-branch">${renderNode(n,e)}${renderBranches(n.id,p,e,next)}</div>`).join('');
}
function renderMaterials(n,e){
 const materials=n.materials||[];
 if(materials.length>1||n.materialState==='partial')return `<section class="route-materials"><h3>Материалы по теме</h3>${materials.map(m=>`<button class="button secondary" data-route-open="${e(m.lessonId)}" data-point="${e(m.pointId||'')}" ${m.available?'':'disabled'}>${e(m.title)}${m.available?' →':''}</button>`).join('')}</section>`;
 return n.lessonId&&n.available?`<button class="button primary" data-route-open="${e(n.lessonId)}" data-point="${e(n.pointId||'')}" >${n.completed?'Открыть пройденный урок':'Открыть урок →'}</button>`:'';
}
function renderRelations(title,ids,p,e){
 const nodes=ids.map(id=>p.nodes.find(n=>n.id===id)).filter(Boolean);
 return nodes.length?`<section class="route-relations"><h3>${title}</h3><div>${nodes.map(n=>renderNode(n,e,{compact:true})).join('')}</div></section>`:'';
}
function renderLessonPlan(plan,e,{preview=false}={}){
 if(!plan?.length)return '';
 const content='<ol class="route-lesson-plan">'+plan.map(item=>'<li>'+e(item)+'</li>').join('')+'</ol>';
 return preview?'<details class="route-plan-preview"><summary>План урока · '+plan.length+' пункта</summary>'+content+'</details>':'<section class="route-plan"><h3>Что будет в уроке</h3>'+content+'</section>';
}
function renderOperation(o,lookup,e){
 const label=({exclude:'Исключить',add_block:'Новый блок',move:'Перенести в блок'})[o.type]||'Добавить урок';
 return '<li>'+label+': <strong>'+e(o.title)+'</strong>'+(o.node?'<small>'+(o.node.main?'Основной этап':'Дополнительный урок')+(o.node.prerequisites.length?' · после '+o.node.prerequisites.map(lookup).map(e).join(', '):'')+'</small>'+renderLessonPlan(o.node.lessonPlan,e,{preview:true}):'')+'</li>';
}
function renderProposals(p,e){
 const lookup=id=>p.nodes.find(n=>n.id===id)?.title||p.proposals.flatMap(x=>x.operations||[]).find(o=>o.node?.id===id)?.node.title||id;
 const proposals=p.proposals.filter(x=>!['rejected','applied'].includes(x.status)&&x.scope.kind===selection.kind&&x.scope.id===selection.id);
 return `<section class="route-proposals" aria-label="Предложения к программе">${proposals.map(x=>`<article class="route-proposal" data-proposal-id="${e(x.id)}"><p class="route-eyebrow">${x.status==='pending'?'ОБДУМЫВАЕМ ЗАПРОС':x.status==='failed'?'ЗАПРОС НЕ ЗАВЕРШЁН':'ПРОВЕРЬ ПЕРЕД ПРИМЕНЕНИЕМ'}</p><h3>${x.status==='pending'?'Codex готовит предложение…':x.status==='failed'?'Не удалось подготовить предложение':'Предложение к маршруту'}</h3><p>${e(x.summary||x.message)}</p>${x.error?`<p class="program-error">${e(x.error)}</p>`:''}${x.operations?.length?`<ul>${x.operations.map(o=>renderOperation(o,lookup,e)).join('')}</ul><p class="program-note">Основных этапов: ${x.impact.before.total} → ${x.impact.after.total}. ${e(x.impact.rewards)}</p>`:''}${x.status==='proposed'&&x.baseRevision!==p.revision?'<p class="program-note">Маршрут уже изменился. Отправь запрос заново, чтобы получить актуальное предложение.</p>':''}<div class="program-actions">${x.status==='proposed'?`<button class="button primary" data-route-action="apply" data-proposal="${e(x.id)}" ${x.baseRevision!==p.revision?'disabled':''}>Применить эти изменения</button>`:''}${['proposed','advice'].includes(x.status)?`<button class="button secondary" data-route-action="reject" data-proposal="${e(x.id)}">Оставить как есть</button>`:''}</div></article>`).join('')}</section>`;
}
function renderLesson(n,p,e){
 const children=p.nodes.filter(x=>x.parentId===n.id&&!x.excluded),dependents=n.unlocks.filter(id=>p.nodes.some(x=>x.id===id&&!x.excluded));
 const canPrepare=n.canPrepare??(!n.completed&&!n.lessonId&&!n.excluded&&!n.requiresRuntime&&!n.jobId&&n.learningGoals.length>0);
 const missingReason=n.prepareReason||(n.completed&&!n.lessonId?'Тема уже пройдена. Отдельного урока в этом приложении нет; повторно создавать его не нужно.':n.requiresRuntime?'Этап есть в плане. Для подготовки сначала нужно подключить его учебные инструменты.':n.jobId&&!n.lessonId?'Материал уже готовится. Состояние подготовки показано ниже.':'');
 return `<div class="route-detail-heading"><p class="route-eyebrow">${n.main||!n.parentId?'УРОК':'ДОПОЛНИТЕЛЬНАЯ ПРАКТИКА'}</p><h2 tabindex="-1" data-route-heading>${e(n.title)}</h2></div><p class="route-state is-${n.status}">${icons[n.status]} ${labels[n.status]}${n.excluded?' · исключён из маршрута':''}</p>${n.lessonPlan?.length?renderLessonPlan(n.lessonPlan,e):n.learningGoals.length?`<ul class="route-goals">${n.learningGoals.map(g=>`<li>${e(g)}</li>`).join('')}</ul>`:''}<section class="route-study"><div class="program-actions">${n.lessonId||n.materials?.length?renderMaterials(n,e):canPrepare?`<button class="button primary" data-route-action="prepare" data-node="${e(n.id)}">Создать урок по этой теме</button>`:''}</div>${canPrepare?'<p class="program-note">Заданий ещё нет. Codex подготовит их и проверит перед добавлением.</p>':missingReason?`<p class="program-note">${e(missingReason)}</p>`:''}${n.lessonId&&!n.available&&!n.excluded?`<p class="program-note">${e(n.openReason||'Материал готов. Для перехода нужны предыдущие темы, отмеченные ниже.')}</p>`:''}</section>${children.length?renderRelations('Разборы и практика',children.map(x=>x.id),p,e):''}${n.parentId?renderRelations('Основная тема',[n.parentId],p,e):''}${renderRelations(n.completed?'Основа этого урока':'Предыдущие темы',n.prerequisites,p,e)}${renderRelations('Следующие темы',n.unlocks,p,e)}${n.main&&!n.excluded?`<section class="route-change"><h3>Что хочешь изменить?</h3><div class="route-intents">${!n.completed?'<button class="route-intent" data-route-intent="exam"><strong>Я это знаю</strong><span>Добавить экзамен и подтвердить знания.</span></button>':''}<button class="route-intent" data-route-intent="easier"><strong>${n.completed?'Хочу повторить':'Нужен простой вариант'}</strong><span>Добавить отдельную практику. Этот урок сохранится.</span></button>${!n.completed?`<button class="route-intent" ${dependents.length?'data-route-prompt="remove"':'data-route-intent="exclude"'}><strong>Хочу убрать эту тему</strong><span>${dependents.length?'Она нужна следующим темам. Сначала обсудим безопасный вариант.':'Посмотреть последствия исключения перед подтверждением.'}</span></button>`:''}</div></section>`:''}`;
}
function renderBlock(block,p,e){
 const nodes=p.nodes.filter(n=>!n.excluded&&n.blockId===block.id&&(n.main||!n.parentId)),done=nodes.filter(n=>n.completed).length;
 return `<div class="route-detail-heading"><p class="route-eyebrow">БЛОК ПРОГРАММЫ</p><h2 tabindex="-1" data-route-heading>${e(block.title)}</h2></div><p class="route-summary">${done} из ${nodes.length} уроков пройдено</p><p class="program-note">Это весь блок. Выбери урок, чтобы посмотреть его материал и доступные действия.</p><div class="route-block-lessons">${nodes.map(n=>renderNode(n,e,{compact:true})).join('')}</div><section class="route-change"><h3>Изменить этот блок</h3><div class="route-intents"><button class="route-intent" data-route-prompt="add"><strong>Добавить тему</strong><span>Расскажи, чего не хватает в этом блоке.</span></button><button class="route-intent" data-route-prompt="simplify"><strong>Сделать обучение проще</strong><span>Обсудить объём и подготовительную практику.</span></button></div></section>`;
}
function renderOverview(p,e){
 return `<div class="route-detail-heading"><p class="route-eyebrow">ВСЯ ПРОГРАММА</p><h2 tabindex="-1" data-route-heading>Управление своим обучением</h2></div><p class="route-summary">${p.progress.done} из ${p.progress.total} основных этапов пройдено</p><p>Выбери блок или урок на схеме. Здесь можно изменить путь, добавить тему или попросить более простую практику.</p><section class="route-goal"><h3>К чему идём</h3><p>${e(p.finish)}</p></section><div class="route-intents"><button class="route-intent" data-route-prompt="add"><strong>Добавить тему в программу</strong><span>Укажи, что хочешь изучить и зачем.</span></button><button class="route-intent" data-route-prompt="remove"><strong>Что-то больше не нужно</strong><span>Обсудить исключение темы с учётом зависимостей.</span></button><button class="route-intent" data-route-prompt="simplify"><strong>Изменить темп или сложность</strong><span>Подобрать более удобный путь обучения.</span></button></div>`;
}
export function renderProgram(ctx){
 const {data,esc:e}=ctx,p=data.program;if(!p)return renderPractice(ctx);configure(data);
 const n=selection.kind==='lesson'?p.nodes.find(n=>n.id===selection.id):null,block=selection.kind==='topic'?p.blocks.find(b=>b.id===selection.id):null;
 const contextTitle=n?.title||block?.title||'Вся программа',contextName=n?'урок':block?'блок':'программа';
 const selectedComments=p.comments.filter(c=>c.scope.kind===selection.kind&&c.scope.id===selection.id);
 const pending=p.proposals.filter(x=>['pending','proposed','advice','failed'].includes(x.status));
 return `<link rel="stylesheet" href="/pages/program.css"><section class="program-page roadmap-page"><header class="route-header"><div><p class="route-eyebrow">ТВОЙ ПУТЬ</p><h1>Моя программа</h1><p>Полный путь обучения. Выбирай тему, обсуждай правки и подтверждай подходящие.</p></div><div class="route-progress"><strong>${p.progress.done} / ${p.progress.total}</strong><span>основных этапов пройдено</span><progress value="${p.progress.done}" max="${p.progress.total||1}"></progress></div></header><div class="route-toolbar"><button class="button ${selection.kind==='program'?'primary':'secondary'}" data-route-overview>Вся программа</button><span>${e(p.title)}</span></div><div class="route-legend">${Object.entries(labels).map(([s,label])=>`<span class="is-${s}"><b class="route-dot">${icons[s]}</b> ${label}</span>`).join('')}</div><div class="route-layout"><section class="route-tree" aria-label="Полная программа"><div class="route-endpoint">✧ Начало пути</div>${visibleBlocks(p).map(b=>`<section class="route-block" data-route-block="${e(b.id)}"><button class="route-block-title ${selection.kind==='topic'&&selection.id===b.id?'is-selected':''}" data-route-topic="${e(b.id)}" aria-pressed="${selection.kind==='topic'&&selection.id===b.id}"><span>${e(b.title)}</span><small>${p.nodes.filter(n=>!n.excluded&&n.blockId===b.id&&(n.main||!n.parentId)&&n.completed).length} / ${p.nodes.filter(n=>!n.excluded&&n.blockId===b.id&&(n.main||!n.parentId)).length}</small></button><div class="route-grid">${p.nodes.filter(x=>x.main&&!x.excluded&&x.blockId===b.id).map(x=>`<div class="route-stage">${renderNode(x,e)}${x.id===p.nextId?`<span class="route-next">${x.available?'Можно продолжить здесь':'Следующий этап'}</span>`:''}${renderBranches(x.id,p,e)}</div>`).join('')}${p.nodes.filter(x=>!x.main&&!x.excluded&&x.blockId===b.id&&(!x.parentId||!p.nodes.some(parent=>parent.id===x.parentId&&!parent.excluded))).map(x=>renderNode(x,e)+renderBranches(x.id,p,e)).join('')}</div></section>`).join('')}<div class="route-endpoint route-finish">✧ Финиш<p>${e(p.finish)}</p></div>${p.afterFinish.length?`<details class="route-rules"><summary>После этого курса</summary><ul>${p.afterFinish.map(x=>`<li>${e(typeof x==='string'?x:x.title)}</li>`).join('')}</ul></details>`:''}${p.nodes.some(x=>x.excluded)?`<details class="route-rules"><summary>Исключённые этапы</summary>${p.nodes.filter(x=>x.excluded).map(x=>renderNode(x,e)).join('')}</details>`:''}<details class="route-rules route-log"><summary>Все комментарии и история · ${p.comments.length}</summary>${pending.length?`<div class="route-pending-list"><h3>Запросы, ожидающие внимания</h3>${pending.map(x=>`<button class="route-pending" data-route-request="${e(x.id)}"><strong>${e(x.message)}</strong><span>${x.status==='pending'?'Готовится ответ':x.status==='failed'?'Нужно повторить запрос':'Посмотреть предложение'} →</span></button>`).join('')}</div>`:''}${p.comments.slice().reverse().map(c=>`<article class="route-comment"><small>${e(c.scope.kind==='program'?'Вся программа':c.scope.kind==='topic'?p.blocks.find(b=>b.id===c.scope.id)?.title:p.nodes.find(n=>n.id===c.scope.id)?.title||'Этап')}</small><p>${e(c.message)}</p></article>`).join('')}${p.history.map(h=>`<p>${h.undone?'↶':'✓'} ${e(h.summary)}</p>`).join('')}${p.canUndo?'<button class="button secondary" data-route-action="undo">Отменить последнюю правку</button>':''}</details><details class="route-rules"><summary>Дополнительная практика по готовому уроку</summary><div data-route-legacy>${renderPractice(ctx)}</div></details></section><aside class="route-detail panel" aria-label="Управление выбранной областью"><div class="route-detail-content">${n?renderLesson(n,p,e):block?renderBlock(block,p,e):renderOverview(p,e)}${error?`<p class="program-error route-feedback" role="alert">${e(error)}</p>`:''}${notice?`<p class="route-feedback" role="status">${e(notice)}</p>`:''}${renderProposals(p,e)}<form data-route-form><h3>Обсудить изменения</h3><p class="route-context"><small>Область запроса</small><strong>${e(contextTitle)}</strong></p><label for="program-request-message">Что хотелось бы изменить или уточнить?</label><textarea id="program-request-message" name="message" rows="3" maxlength="3000" required placeholder="Например: хочу сначала разобрать эту тему на простых примерах…">${e(drafts[key()]||'')}</textarea><div class="program-actions"><button class="button primary" type="submit" value="ask" ${sending||p.busy||!p.enabled?'disabled':''}>${p.busy?'Codex обдумывает…':'Получить предложение'}</button><button class="button secondary" type="submit" value="comment" ${sending?'disabled':''}>Сохранить комментарий</button></div><p class="program-note">Codex предложит изменения. Ты увидишь, что изменится, и решишь, применять ли их.</p>${!p.enabled?'<p class="program-note">Codex сейчас недоступен. Комментарий можно сохранить и вернуться к нему позже.</p>':''}<small class="route-effort">${e(data.settings?.ai?.effortLabels?.[data.settings?.profile?.settings?.aiEfforts?.program]||'Extra high')} · Enter — получить предложение</small></form>${selectedComments.length?`<details class="route-rules"><summary>Комментарии к выбранной области · ${selectedComments.length}</summary>${selectedComments.slice().reverse().map(c=>`<article class="route-comment"><p>${e(c.message)}</p></article>`).join('')}</details>`:''}<div data-route-jobs></div><details class="route-rules"><summary>Правила изменения программы</summary><ul><li>Основа нужна для зависимых тем. Если её уже знаешь, можно подтвердить знания экзаменом.</li><li>Простой вариант и разбор — отдельные ветки. Основной прогресс от их добавления не уменьшается.</li><li>Сначала предложение, затем твоё подтверждение. Решения и полученные награды сохраняются.</li><li>Применённую правку можно отменить в истории.</li></ul></details></div></aside></div></section>`;
}
export function bindProgram(root,ctx){
 if(!ctx.data.program)return bindPractice(root,ctx);
 const binding={};liveBindings.set(root,binding);
 const current=()=>root.isConnected&&liveBindings.get(root)===binding;
 const p=ctx.data.program,legacy=root.querySelector('[data-route-legacy]');
 const jobs=legacy.querySelector('.program-history');if(jobs)root.querySelector('[data-route-jobs]').append(jobs);
 bindPractice(legacy,{...ctx,poll:false,jobsRoot:root.querySelector('[data-route-jobs]'),refresh:data=>refreshPreservingPosition(data)});
 const desktop=()=>matchMedia('(min-width:1001px)').matches;
 async function refreshPreservingPosition(data,{resetPanel=false}={}){
  const x=window.scrollX,y=window.scrollY,mainX=root.scrollLeft,mainY=root.scrollTop,
   panelTop=root.querySelector('.route-detail')?.scrollTop||0,active=document.activeElement,
   editing=active?.id==='program-request-message',caret=editing?[active.selectionStart,active.selectionEnd]:null;
  // On narrow screens the detail card is above the tree. Preserve a visible
  // row as well as the scroll offset when the card changes height.
  const anchor=!desktop()&&!editing?[...root.querySelectorAll('.route-tree [data-route-topic],.route-tree [data-route-node]')].find(el=>{const r=el.getBoundingClientRect();return r.top>=Math.max(0,root.getBoundingClientRect().top)&&r.top<innerHeight;}):null;
  const anchorSelector=anchor?(anchor.hasAttribute('data-route-topic')?'[data-route-topic="'+CSS.escape(anchor.dataset.routeTopic)+'"]':'.route-tree [data-route-node="'+CSS.escape(anchor.dataset.routeNode)+'"]'):null;
  const anchorTop=anchor?.getBoundingClientRect().top;
  // Update the current view in place, just like background status updates.
  // Replacing the app also reloads styles and visibly flashes the whole page.
  ctx.syncData(data);ctx={...ctx,data};
  const template=document.createElement('template');template.innerHTML=renderProgram(ctx);
  const replacement=template.content.querySelector('.roadmap-page'),newJobs=replacement.querySelector('[data-route-legacy] .program-history');
  if(newJobs)replacement.querySelector('[data-route-jobs]').append(newJobs);
  patchProgramNode(root.querySelector('.roadmap-page'),replacement);
  // The reconciler preserves editable fields. Explicit selections/actions must
  // restore this scope's draft (or clear it after a successful submission).
  const message=root.querySelector('#program-request-message'),draft=drafts[key()]||'';
  if(message.value!==draft)message.value=draft;
  const main=root,panel=main.querySelector('.route-detail');
  main?.scrollTo({left:mainX,top:mainY,behavior:'instant'});
  window.scrollTo({left:x,top:y,behavior:'instant'});
  if(panel)panel.scrollTop=resetPanel?0:panelTop;
  const restoredAnchor=anchorSelector&&main?.querySelector(anchorSelector);
  if(restoredAnchor){const delta=restoredAnchor.getBoundingClientRect().top-anchorTop;if(getComputedStyle(main).overflowY==='auto')main.scrollTop+=delta;else window.scrollBy({top:delta,behavior:'instant'});}
  if(editing&&!resetPanel){const input=document.getElementById('program-request-message');input?.focus({preventScroll:true});input?.setSelectionRange(...caret);}
  bindProgram(root,ctx);
 }
 async function select(next){selection=next;error='';notice='';saveView();await refreshPreservingPosition(ctx.data,{resetPanel:true});document.querySelector('[data-route-heading]')?.focus({preventScroll:true});}
 function revealProposal(){const panel=document.querySelector('.route-detail'),proposal=panel?.querySelector('.route-proposal');if(panel&&proposal){panel.scrollTo({top:panel.scrollTop+proposal.getBoundingClientRect().top-panel.getBoundingClientRect().top-16,behavior:'smooth'});}}
 async function run(input){if(sending)return;sending=true;error='';const requestKey=key();try{const next=await ctx.transport.programAction({scope:ctx.data.course.storageScope,...input});notice=next.result?.message||'';if(['comment','ask'].includes(input.action)){drafts[requestKey]='';saveView();}sending=false;await refreshPreservingPosition(next);}catch(cause){sending=false;error=cause.message;await refreshPreservingPosition(ctx.data);document.querySelector('.route-feedback')?.focus?.({preventScroll:true});}}
 root.querySelectorAll('[data-route-node]').forEach(b=>b.onclick=()=>select({kind:'lesson',id:b.dataset.routeNode}));
 root.querySelectorAll('[data-route-topic]').forEach(b=>b.onclick=()=>select({kind:'topic',id:b.dataset.routeTopic}));
 root.querySelector('[data-route-overview]').onclick=()=>select({kind:'program',id:'program'});
 root.querySelectorAll('[data-route-request]').forEach(b=>b.onclick=async()=>{const request=p.proposals.find(x=>x.id===b.dataset.routeRequest);if(request){await select(request.scope);revealProposal();}});
 const form=root.querySelector('[data-route-form]');form.oninput=()=>{drafts[key()]=form.elements.message.value;saveView();};form.onsubmit=event=>{event.preventDefault();drafts[key()]=form.elements.message.value;run({action:event.submitter?.value||'ask',message:drafts[key()],target:{...selection}});};form.elements.message.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&p.enabled&&!p.busy){event.preventDefault();form.requestSubmit(form.querySelector('[value="ask"]'));}};
 const prompts={add:'Хочу добавить тему: ',remove:'Хочу исключить тему: ',simplify:'Хочу сделать обучение проще. Сейчас трудно: '};
 root.querySelectorAll('[data-route-prompt]').forEach(b=>b.onclick=()=>{if(!form.elements.message.value.trim()){drafts[key()]=prompts[b.dataset.routePrompt];form.elements.message.value=drafts[key()];}saveView();form.elements.message.focus({preventScroll:true});const panel=root.querySelector('.route-detail');if(panel&&desktop())panel.scrollTo({top:panel.scrollTop+form.getBoundingClientRect().top-panel.getBoundingClientRect().top-16,behavior:'smooth'});});
 root.querySelectorAll('[data-route-intent]').forEach(b=>b.onclick=()=>run({action:'propose',intent:b.dataset.routeIntent,nodeId:selection.id}));
 root.querySelectorAll('[data-route-action]').forEach(b=>b.onclick=()=>run({action:b.dataset.routeAction,nodeId:b.dataset.node,proposalId:b.dataset.proposal,revision:p.revision}));
 root.querySelectorAll('[data-route-open]').forEach(b=>b.onclick=()=>ctx.openLesson(b.dataset.routeOpen,b.dataset.point||undefined));
 const working=p.busy||(ctx.data.learning?.jobs||[]).some(job=>job.programRequest&&['pending','running'].includes(job.status));
 if(working){
  const poll=async()=>{
   if(!current())return;
   try{
    const next=await ctx.transport.load();if(!current())return;
    // Capture at response time: the learner may have scrolled while fetching.
    const panel=root.querySelector('.route-detail'),position={x:scrollX,y:scrollY,mainX:root.scrollLeft,mainY:root.scrollTop,panel:panel.scrollTop};
    const anchor=!desktop()?[...root.querySelectorAll('.route-tree [data-route-node],.route-tree [data-route-topic]')].find(el=>{const r=el.getBoundingClientRect();return r.top>=Math.max(0,root.getBoundingClientRect().top)&&r.top<innerHeight;}):null,anchorTop=anchor?.getBoundingClientRect().top;
    ctx.syncData(next);ctx={...ctx,data:next};
    const template=document.createElement('template');template.innerHTML=renderProgram(ctx);
    const replacement=template.content.querySelector('.roadmap-page'),newJobs=replacement.querySelector('[data-route-legacy] .program-history');
    if(newJobs)replacement.querySelector('[data-route-jobs]').append(newJobs);
    patchProgramNode(root.querySelector('.roadmap-page'),replacement);
    root.scrollTo({left:position.mainX,top:position.mainY,behavior:'instant'});window.scrollTo({left:position.x,top:position.y,behavior:'instant'});panel.scrollTop=position.panel;
    if(anchor?.isConnected){const delta=anchor.getBoundingClientRect().top-anchorTop;if(getComputedStyle(root).overflowY==='auto')root.scrollTop+=delta;else window.scrollBy({top:delta,behavior:'instant'});}
    bindProgram(root,ctx);
   }catch{if(current())setTimeout(poll,5000);}
  };
  setTimeout(poll,1800);
 }

}
