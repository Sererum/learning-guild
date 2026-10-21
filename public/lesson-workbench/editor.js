(()=>{
 const root=document.getElementById('guild-adventure');if(!root)return;
 const selector='textarea[data-cell-code],textarea#guild-code';
 const keywords=new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'.split(' '));
 const builtins=new Set('abs all any bool dict enumerate float input int isinstance len list max min open print range reversed round set sorted str sum tuple type zip'.split(' '));
 const methods='append clear copy count extend get index insert items join keys lower pop remove replace reverse setdefault sort split startswith endswith strip upper values'.split(' ');
 const escape=text=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 // Lexical colouring only: incomplete Python remains editable. Strings (including
 // f-strings) are one token; this is intentionally not a Python parser/type checker.
 function tokenize(code){
  const tokens=[];let i=0;
  while(i<code.length){
   const start=i,rest=code.slice(i);let kind='',match;
   if(rest[0]==='#'){i=code.indexOf('\n',i);if(i<0)i=code.length;kind='comment';}
   else if((match=rest.match(/^(?:[rRuUbBfF]{0,2})("""|'''|"|')/))){
    const quote=match[1],triple=quote.length===3;i+=match[0].length;let closed=false;
    while(i<code.length){if(code[i]==='\\'){i=Math.min(code.length,i+2);continue;}if(code.startsWith(quote,i)){i+=quote.length;closed=true;break;}if(!triple&&code[i]==='\n')break;i++;}
    tokens.push({start,end:i,text:code.slice(start,i),kind:'string',closed});continue;
   }else if((match=rest.match(/^(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?[jJ]?)/))){i+=match[0].length;kind='number';}
   else if((match=rest.match(/^[\p{L}_][\p{L}\p{N}_]*/u))){i+=match[0].length;kind=keywords.has(match[0])?'keyword':builtins.has(match[0])?'builtin':'name';}
   else if((match=rest.match(/^[+\-*/%=<>!&|^~:@]+/))){i+=match[0].length;kind='operator';}
   else{i++;}
   tokens.push({start,end:i,text:code.slice(start,i),kind});
  }
  return tokens;
 }
 const highlighted=(code,diagnostics=[])=>tokenize(code).map(token=>{
  const cuts=[...new Set([token.start,token.end,...diagnostics.flatMap(item=>[Math.max(token.start,Math.min(token.end,item.start)),Math.max(token.start,Math.min(token.end,item.end))])])].sort((a,b)=>a-b);
  return cuts.slice(0,-1).map((start,index)=>{const end=cuts[index+1],error=diagnostics.some(item=>start<item.end&&end>item.start),classes=[token.kind?'py-'+token.kind:'',error?'py-diagnostic':''].filter(Boolean).join(' '),text=escape(code.slice(start,end));return classes?'<span class="'+classes+'">'+text+'</span>':text;}).join('');
 }).join('');
 const states=new WeakMap();let active=null,editing=false,composing=false,serial=0,diagnosticQueue=Promise.resolve();
 const enabled=()=>{try{return window.guildStorage?.getItem('editor-completion-v1')!=='off';}catch{return true;}};
 function resize(field){field.style.height='auto';field.style.height=Math.max(100,field.scrollHeight+2)+'px';}
 function paint(field){const state=states.get(field);if(state)state.layer.innerHTML=highlighted(field.value,state.diagnostics)+'\n';resize(field);}
 function queueDiagnostics(field){
  const state=states.get(field);if(!state)return;clearTimeout(state.diagnosticTimer);const revision=++state.diagnosticRevision;
  state.diagnostics=[];state.problems.hidden=true;paint(field);
  state.diagnosticTimer=setTimeout(()=>{diagnosticQueue=diagnosticQueue.then(async()=>{
   if(!field.isConnected||state.diagnosticRevision!==revision||composing||!window.guildTransport?.diagnostics)return;
   const source=field.value;if(!source.trim())return;
   try{
    const response=await window.guildTransport.diagnostics(source);
    if(!field.isConnected||state.diagnosticRevision!==revision||field.value!==source)return;
    state.diagnostics=(response.diagnostics||[]).filter(item=>Number.isInteger(item.start)&&Number.isInteger(item.end)&&item.start>=0&&item.end>item.start&&item.start<source.length).map(item=>({...item,end:Math.min(source.length,item.end)}));
    state.problems.hidden=!response.unavailable&&!state.diagnostics.length;
    state.problems.innerHTML=response.unavailable?'<p>Проверка записи недоступна. Ошибки можно посмотреть при запуске кода.</p>':state.diagnostics.length?'<summary>Проверка записи: '+state.diagnostics.length+' · код не запускался</summary><ul>'+state.diagnostics.map(item=>'<li><button type="button" data-diagnostic-start="'+item.start+'" data-diagnostic-end="'+item.end+'">Строка '+Number(item.line)+': '+escape(item.message)+'</button></li>').join('')+'</ul>':'';paint(field);
   }catch{
    if(!field.isConnected||state.diagnosticRevision!==revision)return;
    state.problems.hidden=false;state.problems.innerHTML='<summary>Проверка записи временно недоступна</summary><p>Код сохранён. Проверь подключение к локальному серверу; следующая правка повторит проверку.</p>';
   }
  });},650);
 }
 function close(){if(!active)return;active.popup.hidden=true;active.field.setAttribute('aria-expanded','false');active.field.removeAttribute('aria-activedescendant');active=null;}
 function setup(field){
  if(states.has(field)){paint(field);return;}
  const surface=document.createElement('div');surface.className='guild-code-surface';field.before(surface);surface.append(field);
  const layer=document.createElement('pre');layer.className='guild-code-colors';layer.setAttribute('aria-hidden','true');surface.prepend(layer);
  const popup=document.createElement('div');popup.className='guild-completions';popup.id='guild-completions-'+(++serial);popup.setAttribute('role','listbox');popup.setAttribute('aria-label','Дополнение Python');popup.hidden=true;surface.append(popup);
  const controls=document.createElement('div');controls.className='guild-editor-tools';controls.innerHTML='<span>Python · 4 пробела</span><label title="Tab — первое дополнение; ↓ — другое; Ctrl+Space — открыть; Esc — закрыть."><input type="checkbox" data-editor-completion> Дополнение слов</label>';
  controls.querySelector('input').checked=enabled();surface.after(controls);
  field.setAttribute('aria-autocomplete','list');field.setAttribute('aria-controls',popup.id);field.setAttribute('aria-expanded','false');field.setAttribute('wrap','soft');
  const problems=document.createElement('details');problems.className='guild-code-problems';problems.hidden=true;controls.after(problems);
  const state={field,surface,layer,popup,problems,diagnostics:[],diagnosticRevision:0,items:[],selected:-1};states.set(field,state);paint(field);queueDiagnostics(field);
  problems.addEventListener('click',event=>{const button=event.target.closest('[data-diagnostic-start]');if(!button)return;field.focus({preventScroll:true});field.setSelectionRange(Number(button.dataset.diagnosticStart),Number(button.dataset.diagnosticEnd));field.scrollIntoView({block:'nearest',behavior:'smooth'});});
  field.addEventListener('scroll',()=>{layer.scrollTop=field.scrollTop;layer.scrollLeft=field.scrollLeft;});
  controls.querySelector('input').addEventListener('change',event=>{try{window.guildStorage?.setItem('editor-completion-v1',event.target.checked?'on':'off');}catch{}root.querySelectorAll('[data-editor-completion]').forEach(input=>input.checked=event.target.checked);close();});
  popup.addEventListener('pointerdown',event=>{const option=event.target.closest('[data-completion-index]');if(!option)return;event.preventDefault();state.selected=Number(option.dataset.completionIndex);accept(state);});
 }
 function candidates(field,manual=false){
  const at=field.selectionStart;if(at!==field.selectionEnd)return null;
  const tokens=tokenize(field.value),inside=tokens.find(token=>token.start<at&&(at<token.end||(at===token.end&&(token.kind==='comment'||token.kind==='string'&&!token.closed))));
  if(inside&&['comment','string'].includes(inside.kind))return null;
  const before=field.value.slice(0,at),match=before.match(/[\p{L}_][\p{L}\p{N}_]*$/u),prefix=match?.[0]||'',start=at-prefix.length,method=before[start-1]==='.';
  if(!manual&&!method&&prefix.length<2)return null;
  if(!manual&&method&&!prefix&&/\d\.$/.test(before))return null;
  const own=new Set([...tokens,...tokenize(field.dataset.editorStarter||'')].filter(token=>token.kind==='name').map(token=>token.text));
  const pool=method?methods.map(word=>({word,kind:'метод'})):[...[...own].map(word=>({word,kind:'имя в задаче'})),...[...builtins].map(word=>({word,kind:'функция Python'})),...[...keywords].map(word=>({word,kind:'Python'}))];
  const seen=new Set(),items=pool.filter(item=>item.word.startsWith(prefix)&&item.word!==prefix&&!seen.has(item.word)&&seen.add(item.word)).sort((a,b)=>(a.kind==='имя в задаче'?0:1)-(b.kind==='имя в задаче'?0:1)||a.word.localeCompare(b.word)).slice(0,8);
  const suffix=field.value.slice(at).match(/^[\p{L}\p{N}_]*/u)?.[0]||'';
  return items.length?{items,start,end:at+suffix.length,caret:at}:null;
 }
 function show(field,manual=false){
  close();if(!enabled()||composing||document.activeElement!==field)return;
  const choices=candidates(field,manual),state=states.get(field);if(!choices||!state)return;
  Object.assign(state,choices,{selected:manual?0:-1});active=state;draw(state);
  // The mirror uses the exact textarea metrics and soft wrapping. Position the
  // menu at the caret, clamped to the editor width for narrow/mobile screens.
  const mirror=document.createElement('pre');mirror.className='guild-code-colors guild-caret-mirror';mirror.textContent=field.value.slice(0,field.selectionStart);
  const marker=document.createElement('span');marker.textContent='\u200b';mirror.append(marker);state.surface.append(mirror);
  const box=state.surface.getBoundingClientRect(),caret=marker.getBoundingClientRect();state.popup.style.left=Math.max(0,Math.min(caret.left-box.left,state.surface.clientWidth-300))+'px';state.popup.style.top=(caret.top-box.top+parseFloat(getComputedStyle(field).lineHeight))+'px';mirror.remove();
 }
 function draw(state){
  state.popup.innerHTML=state.items.map((item,index)=>'<div role="option" id="'+state.popup.id+'-'+index+'" aria-selected="'+(index===Math.max(0,state.selected))+'" data-completion-index="'+index+'"><code>'+escape(item.word)+'</code><small>'+item.kind+'</small></div>').join('')+'<p aria-hidden="true">Tab вставить · ↓ другой вариант · Esc закрыть</p>';
  state.popup.hidden=false;state.field.setAttribute('aria-expanded','true');
  state.field.setAttribute('aria-activedescendant',state.popup.id+'-'+Math.max(0,state.selected));
 }
 function edit(field,text,start,end,selection='end'){
  close();editing=true;field.setSelectionRange(start,end);
  // Native insertText retains the browser undo history. setRangeText is the
  // fallback for engines without that editing command.
  let inserted=false;try{inserted=document.execCommand('insertText',false,text);}catch{}
  if(!inserted){field.setRangeText(text,start,end,'end');field.dispatchEvent(new Event('input',{bubbles:true}));}
  if(selection==='select')field.setSelectionRange(start,start+text.length);else if(selection==='start')field.setSelectionRange(start,start);
  editing=false;paint(field);
 }
 function accept(state){const choice=state.items[state.selected];if(!choice)return;edit(state.field,choice.word,state.start,state.end);state.field.focus({preventScroll:true});}
 root.addEventListener('compositionstart',event=>{if(event.target.matches(selector)){composing=true;close();}});
 root.addEventListener('compositionend',event=>{if(event.target.matches(selector)){composing=false;queueDiagnostics(event.target);}});
 root.addEventListener('input',event=>{const field=event.target;if(!field.matches(selector))return;queueDiagnostics(field);if(!editing&&!composing&&!event.isComposing&&event.inputType==='insertText')show(field);else close();});
 root.addEventListener('focusout',event=>{if(event.target.matches(selector))close();});
 root.addEventListener('pointerdown',event=>{if(!event.target.closest('.guild-completions'))close();});
 root.addEventListener('keydown',event=>{
  const field=event.target;if(!field.matches(selector)||event.isComposing||event.keyCode===229||composing)return;
  if(event.ctrlKey&&event.code==='Space'){event.preventDefault();show(field,true);return;}
  if(active?.field===field){
   if(event.key==='Escape'){event.preventDefault();close();return;}
   if(['ArrowDown','ArrowUp'].includes(event.key)&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey){event.preventDefault();active.selected=active.selected<0?(event.key==='ArrowDown'?1%active.items.length:active.items.length-1):(active.selected+(event.key==='ArrowDown'?1:-1)+active.items.length)%active.items.length;draw(active);return;}
   if((event.key==='Tab'||event.key==='Enter'&&active.selected>=0)&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();if(active.selected<0)active.selected=0;accept(active);return;}
   if(event.key!=='Shift')close();
  }
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  const start=field.selectionStart,end=field.selectionEnd,lineStart=field.value.lastIndexOf('\n',start-1)+1,prefix=field.value.slice(lineStart,start);
  if(event.key==='Backspace'&&start===end&&/^[ \t]+$/.test(prefix)){
   event.preventDefault();const amount=prefix.endsWith('\t')?1:Math.min(prefix.match(/ +$/)[0].length,(prefix.length%4)||4);edit(field,'',start-amount,end);return;
  }
  if(event.key==='Delete'&&start===end&&/^[ \t]*$/.test(prefix)&&field.value[start]===' '){
   event.preventDefault();const spaces=field.value.slice(start).match(/^ +/)[0].length,amount=Math.min(spaces,4-prefix.length%4);edit(field,'',start,start+amount,'start');return;
  }
  if(event.key==='Enter'){
   event.preventDefault();const indent=prefix.match(/^[ \t]*/)[0].replace(/\t/g,'    '),body=tokenize(prefix).filter(token=>token.kind!=='comment').map(token=>token.kind==='string'?'_':token.text).join('').trimEnd();edit(field,'\n'+indent+(body.endsWith(':')?'    ':''),start,end);return;
  }
  if(event.key==='Tab'){
   event.preventDefault();if(start===end&&!event.shiftKey)edit(field,'    ',start,end);
   else{const stop=end>start&&field.value[end-1]==='\n'?end-1:end,text=field.value.slice(lineStart,stop),replacement=text.split('\n').map(line=>event.shiftKey?line.replace(/^( {1,4}|\t)/,''):'    '+line).join('\n');edit(field,replacement,lineStart,stop,'select');}
  }
 });
 document.addEventListener('selectionchange',()=>{if(active&&(active.field.selectionStart!==active.caret||active.field.selectionEnd!==active.caret))close();});
 let viewportWidth=window.innerWidth;
 window.addEventListener('resize',()=>{if(window.innerWidth===viewportWidth)return;viewportWidth=window.innerWidth;close();root.querySelectorAll(selector).forEach(paint);});
 window.guildEditor={refresh(){close();root.querySelectorAll(selector).forEach(setup);},tokenize};
})();
