// One portal opens one complete course lesson. Selection is scoped per profile.
const storage=()=>typeof window==='undefined'?{getItem:()=>null,setItem(){}}:window.guildStorage;
const query=()=>new URLSearchParams(typeof location==='undefined'?'':location.search);
const selectionKey='python-guild-app:lesson-selection:v2';let selection=null,scope;
function loadSelection(data){const next=data.course?.storageScope||data.course?.id||'default';if(scope===next&&selection)return;scope=next;try{selection=JSON.parse(storage().getItem(selectionKey)||'null');}catch{selection=null;}const q=query(),target=q.get('lesson');if(target){const lesson=data.lessons?.find(l=>l.id===target);selection={task:lesson?.taskIds?.includes(q.get('task'))?q.get('task'):target,point:(data.courseMap?.points||[]).find(p=>p.lessonId===target)?.id||null};}}
export function selectLesson(taskId,pointId,data){if(data)loadSelection(data);selection={task:taskId,point:pointId};try{storage().setItem(selectionKey,JSON.stringify(selection));}catch{}
 let lesson=data?.lessons?.find(l=>l.id===taskId||l.taskIds?.includes(taskId));
 if(lesson?.repairWorkbookId){lesson=data.lessons.find(l=>l.id===lesson.repairWorkbookId);selection.task=lesson.id;}
 if(lesson&&typeof location!=='undefined'&&typeof history!=='undefined'){
  const address=new URL(location.href);address.searchParams.set('lesson',lesson.id);address.searchParams.set('task',lesson.taskIds.includes(taskId)?taskId:lesson.taskIds[0]);history.replaceState(history.state,'',address);
 }
}
export function renderLesson(ctx){
 const {data,esc}=ctx;loadSelection(data);const registry=data.lessons||[];
 let lesson=registry.find(l=>l.id===selection?.task||l.taskIds?.includes(selection?.task));
 if(lesson?.repairWorkbookId)lesson=registry.find(l=>l.id===lesson.repairWorkbookId)||lesson;
 const legacy=data.presentation?.legacyLessonId;
 if(!lesson||lesson.id===legacy&&query().get('lesson')!==legacy){lesson=registry.find(l=>l.id===data.presentation?.currentLessonId)||data.activeLesson||registry[0];if(!lesson)return '<p>В этом курсе пока нет опубликованных уроков.</p>';selection={task:lesson.taskIds[0],point:data.presentation?.currentPointId||(data.courseMap?.points||[]).find(p=>p.lessonId===lesson.id)?.id};}
 const task=lesson.taskIds.includes(selection.task)?selection.task:lesson.taskIds[0];
 return `<section class="integrated-lesson"><iframe class="lesson-workbench-frame" title="${esc(lesson.title)}: теория, задания, Python и проверки" src="/lesson-workbench/index.html?lesson=${encodeURIComponent(lesson.id)}&task=${encodeURIComponent(task)}&point=${encodeURIComponent(selection.point||'')}#practice" style="height:1000px" loading="eager"></iframe></section>`;
}
const bindings=new WeakMap();
export function bindLesson(root,ctx){
 bindings.get(root)?.abort();const controller=new AbortController();bindings.set(root,controller);const {signal}=controller,frame=root.querySelector('iframe');
 let restored=false,timer,reading;const readingKey='python-guild-app:lesson-reading:v2';try{reading=JSON.parse(storage().getItem(readingKey)||'null');}catch{}
 const saveReading=()=>{if(root.isConnected)try{storage().setItem(readingKey,JSON.stringify({task:selection.task,y:window.scrollY}));}catch{}};
 window.addEventListener('scroll',()=>{clearTimeout(timer);timer=setTimeout(saveReading,120);},{signal,passive:true});window.addEventListener('pagehide',saveReading,{signal});
 if(frame)window.addEventListener('message',event=>{
  if(!frame.isConnected){controller.abort();return;}if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.source!=='guild-lesson')return;
  if(event.data.type==='height'&&Number.isFinite(event.data.height)){frame.style.height=Math.max(400,Math.min(100000,event.data.height))+'px';if(event.data.ready&&!restored){restored=true;if(reading?.task===selection.task&&Number.isFinite(reading.y)&&reading.y>=0)window.scrollTo({top:reading.y,behavior:'instant'});}}
  if(event.data.type==='state'&&event.data.snapshot?.state)ctx.syncLesson(event.data.snapshot);
  if(event.data.type==='scroll-review'&&ctx.data.tasks.some(t=>t.id===event.data.task))requestAnimationFrame(()=>{
   if(!frame.isConnected||!frame.contentDocument?.getElementById('guild-adventure'))return;
   const target=[...frame.contentDocument.querySelectorAll('[data-ai-review]')].find(el=>el.dataset.aiReview===event.data.task);if(!target)return;
   frame.style.height=Math.max(400,Math.min(100000,Math.ceil(frame.contentDocument.getElementById('guild-adventure').getBoundingClientRect().height)+2))+'px';
   window.scrollTo({top:Math.max(0,window.scrollY+frame.getBoundingClientRect().top+target.getBoundingClientRect().top-20),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  });
  if(event.data.type==='selection'&&ctx.data.tasks.some(t=>t.id===event.data.task)){selection.task=event.data.task;try{storage().setItem(selectionKey,JSON.stringify(selection));}catch{}}
 },{signal});
}
