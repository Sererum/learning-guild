import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createBrowserState} from '../browser-state.mjs';

const source=fs.readFileSync(new URL('../public/storage.js',import.meta.url),'utf8');
const scope='course:learner';
const prefix=id=>'learning-guild:'+encodeURIComponent(id)+':';
const drafts=code=>({'drafts-v1':JSON.stringify({task:code})});
function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-browser-mirror-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const store=createBrowserState(directory,scope);const server={scope,store,posts:[],fail:false};return {directory,server,store};}
function client(server,{entries={},marker,selectedScope=scope,nativeData=new Map()}={}){
 for(const [id,value] of Object.entries(entries))nativeData.set(prefix(selectedScope)+id,value);
 if(marker!==undefined)nativeData.set(prefix(selectedScope)+'browser-mirror-v1',String(marker));
 const native={get length(){return nativeData.size;},key:i=>[...nativeData.keys()][i]??null,getItem:k=>nativeData.get(k)??null,setItem:(k,v)=>nativeData.set(k,String(v)),removeItem:k=>nativeData.delete(k)};
 const timers=new Map();let timerId=0;
 const snapshot=()=>({course:{storageScope:server.scope},browserState:server.store.snapshot()});
 const save=async input=>{server.posts.push(structuredClone(input));if(server.fail)throw Error('Сеть недоступна');server.beforeSave?.();server.store.save(input);return snapshot();};
 const window={localStorage:native,setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),dispatchEvent:()=>{},guildTransport:{saveBrowserState:save,settingsAction:save,load:async()=>snapshot()}};
 vm.runInNewContext(source,{window,Date,JSON,Set,CustomEvent:class{} });
 return {storage:window.guildStorage,nativeData,timers,configure:()=>window.guildStorage.configure(snapshot()),code:()=>JSON.parse(window.guildStorage.getItem('drafts-v1')||'{}').task};
}
function seed(store,code){return store.save({scope,revision:store.snapshot().revision,values:drafts(code)});}

test('Reload before the debounce preserves an unsent edit and subsequently saves it with the right scope',async t=>{
 const {server,store}=fixture(t);seed(store,'saved old');
 const local=client(server,{entries:drafts('new unsent'),marker:1});local.configure();
 assert.equal(local.code(),'new unsent');assert.equal(JSON.parse(store.snapshot().values['drafts-v1']).task,'saved old');
 await local.storage.flush();assert.equal(JSON.parse(store.snapshot().values['drafts-v1']).task,'new unsent');assert.equal(server.posts[0].scope,scope);assert.equal(store.snapshot().revision,2);
});

test('A failed network save followed by reload never rolls the editor back to the old server copy',async t=>{
 const {server,store}=fixture(t);seed(store,'saved old');const first=client(server,{entries:drafts('saved old'),marker:1});first.configure();first.storage.setItem('drafts-v1',drafts('new after disconnect')['drafts-v1']);server.fail=true;
 await assert.rejects(first.storage.flush(),/Сеть/);assert.equal(first.code(),'new after disconnect');
 server.fail=false;const reloaded=client(server,{nativeData:first.nativeData});reloaded.configure();assert.equal(reloaded.code(),'new after disconnect');await reloaded.storage.flush();assert.equal(JSON.parse(store.snapshot().values['drafts-v1']).task,'new after disconnect');
});

test('A newer remote revision blocks automatic writes; explicit local choice archives the remote code',async t=>{
 const {server,store}=fixture(t);seed(store,'server before');seed(store,'server newer');
 const local=client(server,{entries:drafts('local unsent'),marker:1});local.configure();assert.equal(local.storage.syncStatus().status,'error');assert.equal(local.storage.syncStatus().conflict.serverRevision,2);assert.equal(local.timers.size,0);
 await assert.rejects(local.storage.flush(),/разные версии/);assert.equal(server.posts.length,0);local.storage.setItem('drafts-v1',drafts('local improved')['drafts-v1']);assert.equal(local.timers.size,0);
 await local.storage.resolveBrowserConflict('local');assert.equal(local.code(),'local improved');assert.equal(JSON.parse(store.snapshot().values['drafts-v1']).task,'local improved');assert.equal(local.storage.syncStatus().conflict,null);assert.ok(local.storage.archivedDrafts('task').some(entry=>entry.code==='server newer'));assert.equal(server.posts[0].revision,2);
});

test('Explicit server choice fetches the latest revision, preserves a visible local draft archive and touches only its namespace',async t=>{
 const {server,store}=fixture(t);seed(store,'server first');seed(store,'server second');
 const local=client(server,{entries:{...drafts('local unsent'),'reading-v1':'stale'},marker:1});local.nativeData.set(prefix('another:profile')+'drafts-v1','untouched');local.configure();
 seed(store,'server latest');await local.storage.resolveBrowserConflict('server');
 assert.equal(local.code(),'server latest');assert.equal(local.storage.getItem('reading-v1'),null);assert.equal(local.nativeData.get(prefix('another:profile')+'drafts-v1'),'untouched');
 const archived=local.storage.archivedDrafts('task').find(entry=>entry.code==='local unsent');assert.ok(archived);local.storage.restoreArchivedDraft('task',archived.version);assert.equal(local.code(),'local unsent');
});

test('A second writer racing explicit resolution is rejected by CAS and leaves the conflict unresolved',async t=>{
 const {server,store}=fixture(t);seed(store,'server first');seed(store,'server second');const local=client(server,{entries:drafts('local unsent'),marker:1});local.configure();
 server.beforeSave=()=>{server.beforeSave=null;seed(store,'server raced');};
 await assert.rejects(local.storage.resolveBrowserConflict('local'),/другой вкладке/);assert.equal(local.code(),'local unsent');assert.equal(JSON.parse(store.snapshot().values['drafts-v1']).task,'server raced');assert.ok(local.storage.syncStatus().conflict);assert.equal(local.timers.size,0);await assert.rejects(local.storage.flush(),/разные версии/);
});

test('Server restart on another profile cannot replay a client draft after session-token renewal',async t=>{
 const {server,store,directory}=fixture(t);seed(store,'profile A saved');const local=client(server,{entries:drafts('profile A unsent'),marker:1});local.configure();
 const otherDirectory=path.join(directory,'profile-B');server.scope='course:other';server.store=createBrowserState(otherDirectory,server.scope);
 await assert.rejects(local.storage.flush(),/другому профилю/);assert.equal(local.code(),'profile A unsent');assert.equal(fs.existsSync(path.join(otherDirectory,'browser-state.json')),false);assert.equal(JSON.parse(store.snapshot().values['drafts-v1']).task,'profile A saved');
});

test('Only a genuinely empty new browser automatically restores the server copy',t=>{
 const {server,store}=fixture(t);seed(store,'server chosen');const fresh=client(server);fresh.configure();assert.equal(fresh.code(),'server chosen');
});

test('An older pre-mirror browser migrates its existing unsent drafts to an empty server without replacing them',async t=>{
 const {server,store}=fixture(t);const oldLocal=client(server,{entries:drafts('legacy unsent')});oldLocal.configure();assert.equal(oldLocal.code(),'legacy unsent');assert.equal(oldLocal.storage.syncStatus().conflict,null);assert.deepEqual(Object.keys(store.snapshot().values),[]);
 await oldLocal.storage.flush();assert.equal(JSON.parse(store.snapshot().values['drafts-v1']).task,'legacy unsent');assert.equal(server.posts[0].revision,0);
});

test('An older browser with no mirror marker conflicts explicitly with a nonempty server and can recover either code',async t=>{
 const {server,store}=fixture(t);seed(store,'server chosen');const oldLocal=client(server,{entries:drafts('legacy unsent')});oldLocal.configure();assert.equal(oldLocal.code(),'legacy unsent');assert.ok(oldLocal.storage.syncStatus().conflict);assert.equal(oldLocal.timers.size,0);await assert.rejects(oldLocal.storage.flush(),/разные версии/);assert.equal(server.posts.length,0);
 await oldLocal.storage.resolveBrowserConflict('server');assert.equal(oldLocal.code(),'server chosen');assert.ok(oldLocal.storage.archivedDrafts('task').some(entry=>entry.code==='legacy unsent'));
});

test('Resolution refuses a different profile snapshot and cannot silently replace local content',async t=>{
 const {server,store,directory}=fixture(t);seed(store,'server first');seed(store,'server newer');const local=client(server,{entries:drafts('local unsent'),marker:1});local.configure();
 server.scope='course:other';server.store=createBrowserState(path.join(directory,'other'),server.scope);
 for(const choice of ['local','server'])await assert.rejects(local.storage.resolveBrowserConflict(choice),/другой профиль/);
 assert.equal(local.code(),'local unsent');assert.ok(local.storage.syncStatus().conflict);assert.equal(server.posts.length,0);
});
