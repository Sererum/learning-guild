import {journeyPoints,describePoint,isTaskClaimed} from '../journey.js';

const names={gems:'Примогемы',gold:'Мора',books:'Книги опыта',notes:'Заметки странницы',ore:'Руда усиления',cloth:'Лунная ткань',dust:'Пыль реликвий',crystals:'Кристаллы ясности',petals:'Лепестки памяти',tomes:'Тома мудрости',crystal:'Звёздные кристаллы',silk:'Звёздный шёлк'};
const uses={gold:'Оплата повышения уровня и усиления вещей.',books:'Опыт персонажа.',notes:'Опыт персонажа небольшими порциями.',ore:'Опыт оружия.',cloth:'Опыт нарядов.',dust:'Опыт артефактов.',crystals:'Первое возвышение персонажа.',petals:'Первое возвышение персонажа.'};
function config(ctx){return ctx.data.gameRules||ctx.rules.config||{};}
function packText(pack,esc){return Object.entries({...pack,...pack.materials}).filter(([id,value])=>id!=='materials'&&Number(value)>0).map(([id,value])=>`${esc(names[id]||id)}: <b>+${Number(value)}</b>`).join(' · ')||'Не предусмотрены правилами курса';}
function sources(ctx,id){
 const c=config(ctx),tasks=ctx.data.tasks||[];
 const availableLessons=new Set(journeyPoints(ctx).map(p=>describePoint(ctx,p)).filter(d=>d.available).map(d=>d.lessonId));
 const availableTasks=new Set((ctx.data.lessons||[]).filter(l=>availableLessons.has(l.id)).flatMap(l=>l.taskIds||[]));
 return tasks.filter(task=>Number(c.taskRules?.[task.id]?.[id])>0).map(task=>({task,amount:Number(c.taskRules[task.id][id]),claimed:isTaskClaimed(ctx,task.id),available:availableTasks.has(task.id)}));
}
function specialText(ctx,id){const {esc}=ctx,c=config(ctx),entries=sources(ctx,id),available=entries.filter(x=>!x.claimed&&x.available),shown=(available.length?available:entries.filter(x=>!x.claimed)).slice(0,3);let text=shown.map(({task,amount})=>`${esc(task.name)}: +${amount}`).join('; ');
 if(text&&!available.length)text='Когда откроются соответствующие задания: '+text;
 if(entries.length>shown.length)text+=' и другие задания с такой наградой';
 if(id==='petals'&&(c.rewardGroups||[]).some(group=>group.kind==='repair'))text+=(text?'. ':'')+'Ещё +1 за завершение каждой работы над ошибками';
 return text||'Сейчас нет заданий с такой наградой.';
}
export function renderResourceGuide(ctx){
 const {data,esc}=ctx,c=config(ctx),s=data.state;
 const next=journeyPoints(ctx).map(p=>({p,d:describePoint(ctx,p)})).filter(({d})=>d.available&&!d.completed&&d.lessonId);
 const options=[next.find(({p})=>!['daily','repair'].includes(p.kind)),next.find(({p})=>p.kind==='repair')].filter(Boolean);
 const common=['gold','books','notes','ore','cloth','dust'];
 return `<header><h2>Где взять ресурсы</h2><p>Решай задания и нажимай «Проверить на тестах». При первом успешном прохождении ресурсы начисляются автоматически.</p></header>
 <div class="resource-guide-actions">${options.map(({p,d})=>`<button type="button" class="button" data-resource-lesson="${esc(d.lessonId)}">${p.kind==='daily'?'Дэйлик':p.kind==='repair'?'Работа над ошибками':'Продолжить урок'}</button>`).join('')}<button type="button" class="button" data-resource-page="daily">Дэйлик дня →</button><button type="button" class="button" data-resource-book>Все поручения →</button></div>
 <div class="resource-guide-packs">${data.daily?.today?`<section><h3>За сегодняшний дэйлик</h3><p>${packText(data.daily.today.reward,esc)}</p></section>`:''}<section><h3>За одну новую задачу</h3><p>${packText(c.resourceRewards?.task||{gold:100,books:1,materials:{ore:2,cloth:2,notes:2}},esc)}</p></section><section><h3>За итоговое испытание</h3><p>${packText(c.resourceRewards?.exam||{gold:400,books:4,materials:{ore:2,cloth:2,notes:2}},esc)}</p></section></div>
 <p class="resource-guide-note">Материалы приходят за каждую задачу. Примогемы за урок — после всех его задач; за качество кода можно получить дополнительный бонус. Повторная проверка уже зачтённой задачи не выдаёт ресурсы заново. У дэйлика отдельная награда: после успешной проверки нажми «Забрать награду» до 00:00. Затем задание обновится, неполученная награда сгорит.</p>
 <p class="resource-guide-note">Ошибки и подсказки не уменьшают награду. Ревью ИИ необязательно: оно может добавить бонус за качество, а уже полученный бонус сохраняется.</p>
 <div class="resource-guide-spend"><a class="button" href="#hero" data-resource-page="hero">Мора и материалы → прокачать персонажа</a><a class="button" href="#wishes" data-resource-page="wishes">Примогемы → получить новые вещи</a></div>
 <table class="resource-guide-table"><thead><tr><th>Ресурс</th><th>У тебя</th><th>Для чего</th></tr></thead><tbody>${common.map(id=>`<tr><th>${esc(names[id])}</th><td>${Number(id==='gold'||id==='books'?s[id]||0:s.materials?.[id]||0)}</td><td>${esc(uses[id])}</td></tr>`).join('')}</tbody></table>
 <h3>Для первого возвышения</h3><p>Сначала повысь персонажа до уровня 20. Затем нужны <b>300 моры, 1 кристалл ясности и 2 лепестка памяти</b>. После возвышения предел станет 40.</p>
 <div class="resource-guide-special">${['crystals','petals'].map(id=>`<section><h4>${names[id]} · у тебя ${Number(s[id]||0)}</h4><p>${specialText(ctx,id)}</p></section>`).join('')}</div>
 <details><summary>Редкие материалы и повторные вещи</summary><p>Тома мудрости, звёздные кристаллы для оружия и звёздный шёлк — более ёмкие материалы опыта. Если их нет в наградах курса, искать их не нужно: вместо них подходят заметки и книги, руда и ткань. Кристалл ясности для возвышения — отдельный ресурс, он не расходуется на оружие.</p><p>Лишний обычный артефакт можно использовать для усиления; надетые вещи защищены. Повтор оружия, наряда или украшения в молитвах даёт 60 моры.</p></details>
 <footer><button type="button" class="button" data-resource-close>Понятно</button></footer>`;
}
export function openResourceGuide(ctx){
 document.querySelector('.resource-guide-dialog')?.close();
 const dialog=document.createElement('dialog');dialog.className='resource-guide-dialog';dialog.setAttribute('aria-label','Где взять ресурсы');dialog.innerHTML=`<button type="button" class="resource-guide-close" data-resource-close aria-label="Закрыть">×</button>${renderResourceGuide(ctx)}`;document.body.append(dialog);
 dialog.querySelectorAll('[data-resource-close]').forEach(button=>button.onclick=()=>dialog.close());dialog.querySelector('[data-resource-book]').onclick=()=>{dialog.close();ctx.navigate('book');};
 dialog.querySelectorAll('[data-resource-lesson]').forEach(button=>button.onclick=()=>{dialog.close();ctx.openLesson(button.dataset.resourceLesson);});
 dialog.querySelectorAll('[data-resource-page]').forEach(link=>link.onclick=event=>{event.preventDefault();dialog.close();ctx.navigate(link.dataset.resourcePage);});
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.addEventListener('click',event=>{if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)dialog.close();}});dialog.showModal();
}
export function bindResourceGuide(root,ctx){root.querySelectorAll('[data-resource-guide]').forEach(button=>{button.onclick=()=>openResourceGuide(ctx);});}
