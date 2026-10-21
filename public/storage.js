// Every course/profile has its own browser drafts; server progress stays authoritative.
(()=>{
 const native=window.localStorage;let scope='unconfigured',versions={tasks:{},lessons:{}};
 const legacyKeys=['alice-guild-workspace-v1','alice-guild-drafts-v1','alice-guild-notebook-v1','alice-guild-reading-v1','python-guild-app:lesson-selection:v2','python-guild-app:lesson-reading:v2'];
 const name=key=>key.replace(/^alice-guild-/, '').replace(/^python-guild-app:/,'');
 const key=raw=>'learning-guild:'+encodeURIComponent(scope)+':'+name(raw);
 const read=raw=>{try{return JSON.parse(native.getItem(key(raw))||'{}');}catch{return {};}};
 let mirror=null;
 function browserValues(){const values={},prefix=key('');for(let i=0;i<native.length;i++){const id=native.key(i);if(id?.startsWith(prefix)){const raw=id.slice(prefix.length);if(raw!=='browser-mirror-v1')values[raw]=native.getItem(id);}}return values;}
 const sameValues=(a,b)=>Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(id=>a[id]===b[id]);
 const parseValues=value=>{try{const parsed=JSON.parse(value||'{}');return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}catch{return {};}};
 function archiveDisplaced(displaced,chosen,label){
  const archive=Object.create(null),merge=source=>{for(const[id,entries]of Object.entries(parseValues(source['content-drafts-archive-v1'])))if(Array.isArray(entries)){archive[id]??=[];for(const entry of entries)if(entry&&typeof entry.code==='string'&&!archive[id].some(old=>old.version===entry.version&&old.code===entry.code))archive[id].push(entry);}};
  merge(displaced);merge(chosen);const keep=parseValues(chosen['drafts-v1']),savedAt=new Date().toISOString();
  for(const[id,code]of Object.entries(parseValues(displaced['drafts-v1'])))if(typeof code==='string'&&keep[id]!==code){archive[id]??=[];if(!archive[id].some(old=>old.code===code))archive[id].push({version:'browser-sync-'+label+'-'+savedAt,code,savedAt});}
  return Object.keys(archive).length?JSON.stringify(archive):null;
 }
 function replaceBrowserValues(values){const prefix=key(''),existing=[];for(let i=0;i<native.length;i++){const id=native.key(i);if(id?.startsWith(prefix))existing.push(id);}for(const id of existing)native.removeItem(id);for(const[id,value]of Object.entries(values))native.setItem(key(id),value);}
 function mirrorStatus(status,message=''){if(!mirror)return;mirror.status=status;mirror.message=message;window.dispatchEvent?.(new CustomEvent('guild-draft-sync',{detail:{status,message}}));}
 function markConflict(current,serverRevision){if(mirror!==current)return;current.conflict={localRevision:current.revision,serverRevision};window.clearTimeout(current.timer);mirrorStatus('error','Есть разные версии черновиков. Выбери, какие оставить, в настройках. Обе версии кода можно сохранить.');}
 async function flushBrowser(){
  if(!mirror)return;if(mirror.inFlight){await mirror.inFlight;return flushBrowser();}
  if(mirror.conflict)throw Error(mirror.message);
  window.clearTimeout(mirror.timer);const current=mirror,values=browserValues(),serialized=JSON.stringify(values);
  if(serialized===current.saved)return;
  mirrorStatus('saving');
  current.inFlight=(window.guildTransport.saveBrowserState||window.guildTransport.settingsAction)({area:'browser-state',action:'save',scope:current.scope,revision:current.revision,values}).then(next=>{
   if(next.browserState?.scope!==current.scope)throw Error('Сервер открыл другой профиль. Черновик остаётся в этом браузере.');
   if(mirror!==current)return;current.revision=next.browserState.revision;current.saved=serialized;native.setItem(key('browser-mirror-v1'),String(current.revision));mirrorStatus('saved');
  }).catch(error=>{if(mirror===current){if(/другой вкладке/.test(error.message))markConflict(current,null);else mirrorStatus('error',error.message);}throw error;}).finally(()=>{current.inFlight=null;if(mirror===current&&current.status!=='error'&&JSON.stringify(browserValues())!==current.saved)scheduleBrowser();});
  await current.inFlight;if(mirror===current&&JSON.stringify(browserValues())!==current.saved)return flushBrowser();
 }
 function scheduleBrowser(){if(!mirror||mirror.conflict)return;window.clearTimeout(mirror.timer);mirror.timer=window.setTimeout(()=>flushBrowser().catch(()=>{}),400);}
 function restoreBrowser(snapshot){
  const remote=snapshot.browserState;
  if(!remote||remote.schemaVersion!==1||remote.scope!==scope||!window.guildTransport?.settingsAction||typeof window.setTimeout!=='function'||mirror?.scope===scope)return;
  const local=browserValues(),marker=native.getItem(key('browser-mirror-v1')),localRevision=marker!==null&&/^\d+$/.test(marker)?Number(marker):null,remoteValues=remote.values||{};
  mirror={scope,revision:remote.revision||0,saved:JSON.stringify(remoteValues),status:'saved',conflict:null};
  if(localRevision!==null&&localRevision!==mirror.revision&&!sameValues(local,remoteValues)){mirror.revision=localRevision;markConflict(mirror,remote.revision||0);return;}
  if(localRevision===null&&Object.keys(local).length&&Object.keys(remoteValues).length&&!sameValues(local,remoteValues)){mirror.revision=0;markConflict(mirror,remote.revision||0);return;}
  if(localRevision===null&&!Object.keys(local).length)replaceBrowserValues(remoteValues);
  // The marker is the last acknowledged server revision. With the same revision,
  // differing local values are unsent edits and must survive reload or network loss.
  native.setItem(key('browser-mirror-v1'),String(mirror.revision));
 }
 async function resolveBrowserConflict(choice){
  if(!['local','server'].includes(choice))throw Error('Выбери черновики браузера или профиля.');
  const current=mirror;if(!current?.conflict)throw Error('Нет конфликта черновиков.');
  const snapshot=await window.guildTransport.load(),remote=snapshot.browserState;
  if(mirror!==current||remote?.scope!==current.scope||snapshot.course?.storageScope!==current.scope)throw Error('Сервер открыл другой профиль. Черновики не изменены.');
  const local=browserValues(),remoteValues=remote.values||{},archive=choice==='server'?archiveDisplaced(local,remoteValues,'local'):archiveDisplaced(remoteValues,local,'server');
  if(choice==='server')replaceBrowserValues(remoteValues);
  if(archive)native.setItem(key('content-drafts-archive-v1'),archive);
  reconcileVersions(snapshot);
  current.revision=remote.revision||0;current.saved=JSON.stringify(remoteValues);current.conflict=null;mirrorStatus('saved');
  if(sameValues(browserValues(),remoteValues))native.setItem(key('browser-mirror-v1'),String(current.revision));
  await flushBrowser();return window.guildStorage.syncStatus();
 }
 function reconcileVersions(snapshot){
  const supplied=snapshot.contentVersions;if(!supplied)return;
  const next={tasks:supplied.taskVersions||{},lessons:supplied.lessonVersions||{}},previous=read('content-browser-versions-v1'),drafts=read('drafts-v1'),notebook=read('notebook-v1'),workspace=read('workspace-v1'),archive=read('content-drafts-archive-v1');
  let draftChanges=false,notebookChanges=false,workspaceChanges=false;
  const changed=new Set((supplied.changed||[]).map(item=>item.taskId));
  for(const[id,version]of Object.entries(next.tasks)){
   const before=previous.tasks?.[id],mismatch=before?before!==version:changed.has(id);
   if(!mismatch)continue;
   const oldVersion=before||'legacy-before-current-content';
   if(typeof drafts[id]==='string'&&!archive[id]?.some(item=>item.version===oldVersion&&item.code===drafts[id])){archive[id]??=[];archive[id].push({version:oldVersion,code:drafts[id],savedAt:new Date().toISOString()});draftChanges=true;}
   for(const field of ['checks','executions','explanations','tabs'])if(notebook[field]?.[id]!==undefined){delete notebook[field][id];notebookChanges=true;}
  }
  const lessonsChanged=new Set((supplied.lessonsChanged||[]).map(item=>item.lessonId));
  for(const[id,version]of Object.entries(next.lessons))if(previous.lessons?.[id]?previous.lessons[id]!==version:lessonsChanged.has(id)){
   if(workspace.lessons?.[id]){workspace.lessons[id].viewedTheory={};workspaceChanges=true;}
   if(workspace.lesson===id){workspace.viewedTheory={};workspaceChanges=true;}
  }
  if(draftChanges)native.setItem(key('content-drafts-archive-v1'),JSON.stringify(archive));
  if(notebookChanges)native.setItem(key('notebook-v1'),JSON.stringify(notebook));
  if(workspaceChanges)native.setItem(key('workspace-v1'),JSON.stringify(workspace));
  versions=next;native.setItem(key('content-browser-versions-v1'),JSON.stringify(next));
 }
 window.guildStorage={configure(snapshot){
  scope=snapshot.course?.storageScope||((snapshot.course?.id||'default')+':'+(snapshot.profile?.id||'default'));
  restoreBrowser(snapshot);
  if(snapshot.course?.legacyStorageMigration!==true){reconcileVersions(snapshot);scheduleBrowser();return;}
  const marker=key('legacy-migrated-v1');if(native.getItem(marker)){reconcileVersions(snapshot);scheduleBrowser();return;}
  const keys=[...legacyKeys];for(let i=0;i<native.length;i++){const old=native.key(i);if(old?.startsWith('alice-guild-task-feedback:'))keys.push(old);}
  for(const old of keys){const value=native.getItem(old);if(value!==null&&native.getItem(key(old))===null)native.setItem(key(old),value);}
  native.setItem(marker,'1');reconcileVersions(snapshot);scheduleBrowser();
 },key,getItem(raw){return native.getItem(key(raw));},setItem(raw,value){native.setItem(key(raw),value);scheduleBrowser();},removeItem(raw){native.removeItem(key(raw));scheduleBrowser();},flush:flushBrowser,resolveBrowserConflict,syncStatus(){return mirror?{status:mirror.status,message:mirror.message,conflict:mirror.conflict?{...mirror.conflict}:null}:{status:'local'};},
 archivedDrafts(taskId){return read('content-drafts-archive-v1')[taskId]||[];},
 restoreArchivedDraft(taskId,version){const entry=this.archivedDrafts(taskId).find(item=>item.version===version);if(!entry)throw Error('Черновик этой версии не найден');const drafts=read('drafts-v1');drafts[taskId]=entry.code;native.setItem(key('drafts-v1'),JSON.stringify(drafts));const notebook=read('notebook-v1');for(const field of ['checks','executions','explanations','tabs'])if(notebook[field])delete notebook[field][taskId];native.setItem(key('notebook-v1'),JSON.stringify(notebook));scheduleBrowser();return entry.code;},
 contentVersion(taskId){return versions.tasks[taskId]||null;}};
})();
