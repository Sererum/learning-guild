(()=>{
 const meta=document.querySelector('meta[name="guild-token"]');let token=meta.content,refreshing=null;
 async function refreshSession(){
  if(!refreshing)refreshing=(async()=>{const response=await fetch('/',{cache:'no-store'});if(!response.ok)throw Error('Не удалось обновить подключение. Код сохранён; обнови страницу.');const html=new DOMParser().parseFromString(await response.text(),'text/html'),next=html.querySelector('meta[name="guild-token"]')?.content;if(!next)throw Error('Не удалось обновить подключение. Обнови страницу.');token=next;meta.content=next;})().finally(()=>{refreshing=null;});
  return refreshing;
 }
 async function call(url,input,retry=true){
  let response;try{response=await fetch(url,input?{method:'POST',headers:{'Content-Type':'application/json','X-Guild-Token':token},body:JSON.stringify(input)}:{});}catch{throw Error('Не удалось связаться с локальным сервером. Код сохранён. Проверь, запущено ли демо, и повтори действие.');}
  const data=await response.json();if(response.status===403&&input&&retry&&data.code==='SESSION_EXPIRED'){await refreshSession();return call(url,input,false);}
  if(!response.ok)throw Error(data.error||'Не удалось выполнить действие');window.guildSyncRules?.(data);return data;
 }
 window.guildTransport={diagnostics:code=>call('/api/diagnostics',{code}),saveBrowserState:input=>call('/api/settings',{...input,area:'browser-state',action:'save'}),settingsAction:input=>call('/api/settings',input),submitLesson:input=>call('/api/lesson-submit',input),learningJob:id=>call('/api/learning-job?id='+encodeURIComponent(id)),feedback:input=>call('/api/task-feedback',input),reveal:(task,index)=>call('/api/reveal-test',{task,index}),ai:(task,code,answer,effort,previousReviewId)=>call('/api/ai-review',{task,code,answer,effort,previousReviewId}),review:id=>call('/api/review-result',{id}),load:()=>call('/api/state'),act:input=>call('/api/action',input),run:(task,code)=>call('/api/run',{task,code}),execute:(task,code)=>call('/api/execute',{task,code}),check:(task,code,explanation)=>call('/api/check',{task,code,explanation})};
})();
