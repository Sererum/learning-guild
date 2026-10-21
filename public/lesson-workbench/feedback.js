(()=>{
 let active=null;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function close(){if(!active)return;active.dialog.close();active.dialog.remove();active=null;}
 window.addEventListener('pagehide',close);
 window.guildLessonFeedback={open({task,checked,template,draftKey,legacyDraftKey,theme,onSave,initial,manual=false}){
  if(active){active.dialog.focus();return;}
  // Mount in the containing page so a tall lesson iframe cannot hide the modal.
  const host=parent!==window&&parent.location.origin===location.origin?parent.document:document;
  const dialog=host.createElement('dialog');dialog.className='guild-task-feedback';dialog.dataset.theme=theme;dialog.setAttribute('aria-labelledby','guild-feedback-title');
  let draft=initial&&!initial.skipped?{...initial}:{};try{draft={...draft,...JSON.parse(window.guildStorage.getItem(draftKey)||(legacyDraftKey&&window.guildStorage.getItem(legacyDraftKey))||'{}')};}catch{}
  const select=(name,label)=>`<label>${label}<select name="${name}" required><option value="" disabled ${draft[name]?'':'selected'}>Выбери…</option>${template[name].map(option=>`<option value="${escape(option.value)}" ${String(draft[name])===option.value?'selected':''}>${escape(option.label)}</option>`).join('')}</select></label>`;
  const tests=(checked.tests||[]).map(test=>`<li><span aria-hidden="true">${test.ok?'✓':'×'}</span> ${escape(test.label)} — ${test.ok?'пройден':'есть расхождение'}</li>`).join('');
  dialog.innerHTML=`<style>
  .guild-task-feedback{--f-bg:#fffef9;--f-code:#f3f6ed;--f-ink:#323d35;--f-muted:#697367;--f-line:#dcdfd4;--f-green:#466c45;--f-soft:#e5eedc;box-sizing:border-box;position:fixed;inset:0;margin:auto;width:min(560px,calc(100vw - 28px));max-height:calc(100dvh - 32px);overflow:auto;padding:0;border:1px solid var(--f-line);border-radius:12px;background:var(--f-bg);color:var(--f-ink);font:14px/1.5 system-ui,sans-serif;box-shadow:0 16px 64px #172a3b33}
  .guild-task-feedback[data-theme="dark"]{--f-bg:#242527;--f-code:#1e2022;--f-ink:#e8e9e8;--f-muted:#a3aaa6;--f-line:#393c3e;--f-green:#9cc9a1;--f-soft:#283d30}
  .guild-task-feedback::backdrop{background:#172a3b70}.guild-task-feedback *{box-sizing:border-box}.guild-task-feedback header{padding:18px 20px 0}.guild-task-feedback h2{font:650 20px/1.3 system-ui,sans-serif;margin:0 0 6px}.guild-task-feedback header p{font-size:12px;color:var(--f-muted);margin:0}
  .guild-task-feedback form{padding:16px 20px 20px}.guild-task-feedback label{display:block;margin:0 0 14px;font-weight:500}.guild-task-feedback select,.guild-task-feedback textarea{display:block;min-height:40px;max-width:100%;width:100%;padding:9px 10px;margin:6px 0 0;border:1px solid var(--f-line);border-radius:6px;background:var(--f-code);color:var(--f-ink);font:14px/1.5 system-ui,sans-serif}.guild-task-feedback textarea{resize:vertical}.guild-task-feedback [hidden]{display:none!important}
  .guild-task-feedback details{margin:0 0 12px;color:var(--f-muted);font-size:12px}.guild-task-feedback ul{padding-left:18px}.guild-task-feedback .feedback-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.guild-task-feedback button{padding:10px 13px;min-height:40px;border:1px solid var(--f-line);border-radius:7px;background:var(--f-code);color:var(--f-ink);font:14px system-ui,sans-serif;cursor:pointer}.guild-task-feedback button[type="submit"]{background:var(--f-soft);color:var(--f-green)}.guild-task-feedback [data-feedback-skip]{background:#b83e3e;border-color:#b83e3e;color:#fff}.guild-task-feedback [data-feedback-skip]:hover:not(:disabled){background:#9e3030;border-color:#9e3030}.guild-task-feedback button:disabled{opacity:.6;cursor:wait}.guild-task-feedback :focus-visible{outline:2px solid #7c91a4;outline-offset:2px}.guild-task-feedback [role="alert"]{color:var(--f-ink);border-left:3px solid #c4a05b;padding-left:10px}
  </style><header><h2 id="guild-feedback-title">Обратная связь</h2><p>${escape(window.guildWorkspace.displayTitle(task.name,{id:task.id,practice:true}))}</p></header><form data-task-feedback-form>
   <details open><summary>Последняя проверка: ${checked.ok?'все тесты пройдены':(checked.tests?.length?(checked.tests||[]).filter(test=>test.ok).length+' из '+(task.cases||[]).length+' тестов пройдено':'есть непрошедшие тесты')}</summary>${tests?`<ul>${tests}</ul>`:''}${checked.error?`<p>${escape(checked.error)}</p>`:''}</details>
   ${select('difficulty','Сложность от 1 до 5')}${select('hardPart','Где пришлось подумать?')}
   <label>Что именно было сложным? <span>(необязательно)</span><textarea name="hardDetails" rows="2" maxlength="1200">${escape(draft.hardDetails)}</textarea></label>
   ${select('hintSource','Какая подсказка понадобилась?')}
   <label data-hint-details hidden>Какая именно подсказка помогла?<textarea name="hintDetails" rows="2" maxlength="1200">${escape(draft.hintDetails)}</textarea></label>
   <p role="alert" hidden></p><div class="feedback-actions"><button type="submit">${manual?'Сохранить отзыв':'Сохранить и продолжить'}</button><button type="button" data-feedback-cancel>${manual?'Отмена':'Вернуться к задаче'}</button><button type="button" data-feedback-skip ${manual?'hidden':''}>Пропустить</button></div>
  </form>`;
  host.body.append(dialog);active={dialog};const form=dialog.querySelector('form'),submit=form.querySelector('[type="submit"]'),cancel=form.querySelector('[data-feedback-cancel]'),skip=form.querySelector('[data-feedback-skip]'),error=form.querySelector('[role="alert"]');let saving=false;
  const values=()=>Object.fromEntries(new FormData(form));
  const persist=()=>{const value=values();try{window.guildStorage.setItem(draftKey,JSON.stringify(value));}catch{}
   const needsHint=!!value.hintSource&&value.hintSource!=='none';form.querySelector('[data-hint-details]').hidden=!needsHint;form.elements.hintDetails.required=needsHint;form.elements.hardDetails.required=value.hardPart==='other';
  };
  const cancelDialog=()=>{if(saving)return;persist();close();};
  form.addEventListener('input',persist);form.addEventListener('change',persist);cancel.addEventListener('click',cancelDialog);dialog.addEventListener('cancel',event=>{event.preventDefault();cancelDialog();});
  const save=async skipped=>{if(saving)return;if(!skipped&&!form.reportValidity())return;saving=true;submit.disabled=true;cancel.disabled=true;skip.disabled=true;const pending=skipped?skip:submit;pending.textContent=skipped?'Пропускаем…':'Сохраняем…';error.hidden=true;
   try{const value=values();await onSave(skipped?{skipped:true}:{...value,difficulty:Number(value.difficulty)});try{window.guildStorage.removeItem(draftKey);if(legacyDraftKey)window.guildStorage.removeItem(legacyDraftKey);}catch{}close();}
   catch(e){error.textContent=e.message;error.hidden=false;saving=false;submit.disabled=false;cancel.disabled=false;skip.disabled=false;submit.textContent=manual?'Сохранить отзыв':'Сохранить и продолжить';skip.textContent='Пропустить';}
  };
  form.addEventListener('submit',event=>{event.preventDefault();save(false);});skip.addEventListener('click',()=>save(true));persist();dialog.showModal();form.elements.difficulty.focus({preventScroll:true});
 }};
})();
