import {mapIcon} from '../map-icons.js';
const results=new Map(),bindings=new WeakMap();
const scope=ctx=>ctx.data.course?.storageScope||ctx.data.account?.id||ctx.data.course?.id||'';
const key=(ctx,id)=>scope(ctx)+':'+id;
function draft(ctx,today){try{return globalThis.window?.guildStorage?.getItem('daily-draft:'+today.id)??today.code??today.starter??'';}catch{return today.code||today.starter||'';}}
export function remainingSeconds(resetsAt,now=Date.now()){return Math.max(0,Math.ceil((Date.parse(resetsAt)-now)/1000))||0;}
export function countdown(seconds){return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');}
export function rewardText(reward={}){
 const names={gems:'примогемов',gold:'моры',books:'книг опыта',crystals:'кристаллов',petals:'лепестков',ore:'руды',cloth:'ткани',notes:'заметок'};
 return [...Object.entries(reward).filter(([id])=>id!=='materials'),...Object.entries(reward.materials||{})].filter(([,n])=>Number(n)>0).map(([id,n])=>`${n} ${names[id]||id}`).join(' · ');
}
function output(result,e){
 if(!result)return '';
 const tests=result.tests||[];
 return `<div class="daily-result" role="status">${result.message?`<p>${e(result.message)}</p>`:''}${tests.length?`<h3>${result.ok?'✓ Проверки пройдены':'Есть что поправить'}</h3><ul>${tests.map(t=>`<li>${t.ok?'✓':'!'} ${e(t.label||'Проверка')}${t.error?` — ${e(t.error)}`:''}${t.output?`<pre>${e(t.output)}</pre>`:''}</li>`).join('')}</ul>`:''}${result.output?`<pre>${e(result.output)}</pre>`:''}${result.error?`<p>${e(result.error)}</p>`:''}</div>`;
}
export function renderDaily(ctx){
 const e=ctx.esc,daily=ctx.data.daily||{},today=daily.today,claimed=today?.status==='claimed',complete=today?.status==='completed',expires=remainingSeconds(daily.resetsAt,Date.parse(daily.serverNow)||Date.now());
 const history=(daily.history||[]).filter(x=>x.id!==today?.id);
 return `<section class="daily-page"><header class="daily-heading"><div class="daily-symbol">${mapIcon('daily',{active:!claimed})}</div><div><p class="eyebrow">ЕЖЕДНЕВНОЕ ПОРУЧЕНИЕ</p><h1>Дэйлик дня</h1><p>Короткая практика по уже знакомой теме</p></div><button class="button secondary" data-daily-map>К карте →</button></header>${today?`<section class="daily-task panel"><div class="daily-task-top"><div><span class="eyebrow">${e(today.day||'Сегодня')}</span><h2>${e(today.title)}</h2></div><p class="daily-deadline">До обновления <strong data-daily-countdown>${countdown(expires)}</strong><small>00:00 · ${e(daily.timeZone||'Europe/Moscow')}</small></p></div><p class="daily-prompt">${e(today.prompt||'')}</p><div class="daily-reward"><strong>Награда</strong><span>${e(rewardText(today.reward))}</span></div>${claimed?'<p class="daily-state is-claimed">✓ Награда получена. Следующее поручение появится завтра.</p>':complete?'<p class="daily-state">✓ Задание выполнено. Забери награду до обновления.</p>':''}<label class="daily-code-label" for="daily-code">Твоё решение</label><textarea id="daily-code" class="daily-code" spellcheck="false" autocapitalize="off" autocomplete="off" maxlength="16000" aria-describedby="daily-code-help">${e(draft(ctx,today))}</textarea><p id="daily-code-help" class="muted">Черновик сохраняется в этом курсе. Tab добавляет отступ.</p><div class="daily-actions"><button class="button secondary" data-daily-action="run" ${expires?'':'disabled'}>▷ Запустить код</button><button class="button primary" data-daily-action="check" ${expires?'':'disabled'}>Проверить на тестах</button>${complete?`<button class="button daily-claim" data-daily-action="claim" ${expires?'':'disabled'}>Забрать награду</button>`:''}</div><p class="daily-expiry-note" data-daily-expiry-note>${claimed?'Полученные ресурсы сохранены.':'Неполученная награда сгорает в 00:00. Пропущенные дэйлики не накапливаются.'}</p><div data-daily-result>${output(results.get(key(ctx,today.id))||today.lastResult,e)}</div></section>`:`<section class="panel daily-empty"><h2>Сегодня пока нет дэйлика</h2><p>${e(daily.reason||'Для дэйликов нужны пройденные темы и подготовленные задания. Продолжи обучение — здесь появится короткая практика.')}</p><button class="button" data-daily-program>Моя программа →</button></section>`}${history.length?`<details class="daily-history panel"><summary>История дэйликов · ${history.length}</summary>${history.map(item=>`<article><p class="eyebrow">${e(item.day)}</p><h3>${e(item.title)}</h3><p>${item.status==='claimed'||item.claimedAt?'✓ Награда получена':item.completed||item.status==='completed'?'Выполнено · награда не получена вовремя':'Срок завершён'}</p>${typeof item.code==='string'?`<details><summary>Сохранённое решение</summary><pre>${e(item.code)}</pre></details>`:''}</article>`).join('')}</details>`:''}</section>`;
}
export function bindDaily(root,ctx){
 bindings.get(root)?.();
 const controller=new AbortController(),listen=(el,name,fn)=>el?.addEventListener(name,fn,{signal:controller.signal});
 listen(root.querySelector('[data-daily-map]'),'click',()=>ctx.navigate('world'));listen(root.querySelector('[data-daily-program]'),'click',()=>ctx.navigate('program'));
 const today=ctx.data.daily?.today,editor=root.querySelector('#daily-code');let timer;
 if(today&&editor){
  const save=()=>{try{window.guildStorage?.setItem('daily-draft:'+today.id,editor.value);}catch{ctx.toast('Не удалось сохранить черновик в браузере. Скопируй код перед выходом.');}};
  listen(editor,'input',save);listen(editor,'keydown',event=>{if(event.key==='Tab'){event.preventDefault();editor.setRangeText('    ',editor.selectionStart,editor.selectionEnd,'end');save();}});
  let busy=false;
  root.querySelectorAll('[data-daily-action]').forEach(button=>listen(button,'click',async()=>{
   if(busy)return;busy=true;save();const buttons=[...root.querySelectorAll('[data-daily-action]')];buttons.forEach(b=>b.disabled=true);
   const scroll={x:window.scrollX,y:window.scrollY};
   try{const response=await ctx.transport.daily({action:button.dataset.dailyAction,id:today.id,code:editor.value});results.set(key(ctx,today.id),response.result);ctx.syncLesson?.(response);await ctx.refresh(response);window.scrollTo(scroll.x,scroll.y);}catch(error){ctx.toast(error.message);const target=root.querySelector('[data-daily-result]');if(target)target.innerHTML=`<p role="alert">${ctx.esc(error.message)}</p>`;if(/срок|заверш|сегодня|обнов|ист[её]к|прошл/i.test(error.message)){await ctx.refresh().catch(()=>{});window.scrollTo(scroll.x,scroll.y);}}finally{busy=false;buttons.forEach(b=>b.disabled=false);tick();}
  }));
  const anchor=Date.now(),serverNow=Date.parse(ctx.data.daily.serverNow)||anchor;let refreshed=false;
  const tick=()=>{if(!root.isConnected){clearInterval(timer);return;}const left=remainingSeconds(ctx.data.daily.resetsAt,serverNow+Date.now()-anchor);const el=root.querySelector('[data-daily-countdown]');if(el)el.textContent=countdown(left);if(!left){root.querySelectorAll('[data-daily-action]').forEach(b=>b.disabled=true);const note=root.querySelector('[data-daily-expiry-note]');if(note)note.textContent='День завершился. Загружаем новое поручение…';if(!refreshed&&!busy){refreshed=true;ctx.refresh().catch(()=>{if(note)note.textContent='День завершился. Обнови страницу, когда сервер станет доступен.';});}}};
  timer=setInterval(tick,1000);tick();
 }
 bindings.set(root,()=>{controller.abort();clearInterval(timer);});
}
