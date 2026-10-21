(()=>{
 const transport=window.guildTransport;let latestTask=null;
 const send=(type,payload)=>{if(parent!==window)parent.postMessage({source:'guild-lesson',type,...payload},location.origin);};
 const load=transport.load;
 transport.load=async()=>{
  const data=await load(),storage=window.guildStorage;storage.configure(data);
  // Only the designated legacy profile may read the old per-task draft keys.
  if(data.course?.legacyStorageMigration===true)try{
   const marker='legacy-task-drafts-migrated-v1';
   if(!storage.getItem(marker)){
    const drafts=JSON.parse(storage.getItem('drafts-v1')||'{}');
    for(const task of data.tasks){const old=window.localStorage.getItem('python-guild-app:draft:v1:'+task.id);if(drafts[task.id]===undefined&&old!==null)drafts[task.id]=old;}
    storage.setItem('drafts-v1',JSON.stringify(drafts));storage.setItem(marker,'1');
   }
  }catch{}
  return data;
 };
 for(const key of ['check','review','act','run','feedback','submitLesson','learningJob','settingsAction']){const original=transport[key];transport[key]=async(...args)=>{const response=await original(...args);send('state',{snapshot:response});return response;};}
 const report=()=>{send('height',{ready:!!document.querySelector('.workbench'),height:Math.ceil(document.getElementById('guild-adventure').getBoundingClientRect().height)+2});const selected=document.querySelector('[data-cell-code]')?.dataset.cellCode;if(selected&&selected!==latestTask){latestTask=selected;send('selection',{task:selected});}};
 new ResizeObserver(report).observe(document.getElementById('guild-adventure'));new MutationObserver(report).observe(document.getElementById('guild-adventure'),{childList:true,subtree:true});window.addEventListener('load',report);
})();
