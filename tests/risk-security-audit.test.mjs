import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createSharedStandards} from '../shared-standards.mjs';
import {createProfileGovernance} from '../profile-governance.mjs';
import {createContentVersions} from '../content-versions.mjs';
import {createGuildServer} from '../server.mjs';
import {learningCourseFixture} from './learning-course-fixture.mjs';

function temporary(t,prefix='guild-security-audit-') {const directory=fs.mkdtempSync(path.join(os.tmpdir(),prefix));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;}
const proposals=()=>[{text:'Показывать конкретный вход, выражение и результат операции.',evidenceIds:['private-evidence'],status:'needs-independent-review'}];
const review=({candidate})=>({candidateHash:candidate.candidateHash,approved:true,summary:'Применимо к разным курсам.',examples:[{domain:'Python',input:'Строка',application:'Результат метода'},{domain:'ML',input:'Признак',application:'Результат преобразования'}]});
const accept=preview=>({action:'accept',proposalId:preview.id,confirm:true,shownTargets:true,previewToken:preview.previewToken,revisionHash:preview.revisionHash});

// Local teacher roles are explicit user selections, not authenticated accounts.
// This test checks consent binding even when two profiles reuse the default ID.
test('Adversarial: common-rule approval cannot reuse another profile preview with the same teacher ID',async t=>{
 const directory=temporary(t),make=profileScope=>createSharedStandards({directory,profileScope,readProposals:proposals,resolveAuthor:()=>({id:'teacher',role:'teacher'}),provider:'file',reviewFixture:review});
 const first=make('course:alice'),second=make('course:teacher');t.after(()=>{first.close();second.close();});
 const id=first.snapshot().proposals[0].id,{preview}=await first.act({action:'review',proposalId:id});
 await assert.rejects(second.act(accept(preview)),/предпросмотр|профил|подтверд/);
 assert.equal(second.activeRules().length,0);
 await first.act(accept(preview));assert.equal(second.activeRules().length,1,'the accepted teaching rule itself is intentionally shared');
 await assert.rejects(first.act(accept(preview)),/предпросмотр|провер/,'a consumed consent token cannot be replayed');
});

test('Adversarial: public shared views strip source metadata and consent tokens; reviewer text is redacted',async t=>{
 const directory=temporary(t),names=['ТестоваяУченица'],raw=proposals();raw[0].source='PRIVATE-SOURCE';raw[0].referenceCode='PRIVATE-REFERENCE';raw[0].feedback='PRIVATE-FEEDBACK';
 const service=createSharedStandards({directory,profileScope:'c:p',readProposals:()=>raw,resolveAuthor:()=>({id:'teacher',role:'teacher'}),provider:'file',personalNames:names,reviewFixture:input=>({...review(input),summary:'ТестоваяУченица test@example.invalid +7 (999) 111-22-33 /Users/private/demo'})});t.after(()=>service.close());
 const id=service.snapshot().proposals[0].id,{preview}=await service.act({action:'review',proposalId:id});
 const published=JSON.stringify(service.snapshot());
 for(const marker of ['PRIVATE-SOURCE','PRIVATE-REFERENCE','PRIVATE-FEEDBACK','private-evidence',preview.previewToken,'test@example.invalid','ТестоваяУченица','/Users/private'])assert.ok(!published.includes(marker),marker);
 await service.act({action:'edit',proposalId:id,text:'Объяснять операции маленькими проверяемыми примерами.',confirm:true});
 await assert.rejects(service.act(accept(preview)),/предпросмотр|провер/);assert.equal(service.activeRules().length,0);
});

test('Adversarial: role matching is exact and request payload cannot promote a learner',async t=>{
 const directory=temporary(t);let author={id:'teacher',role:'learner'};
 const service=createSharedStandards({directory,profileScope:'c:p',readProposals:proposals,resolveAuthor:()=>author,provider:'file',reviewFixture:review});t.after(()=>service.close());
 const id=service.snapshot().proposals[0].id;
 for(const role of ['learner','Teacher','TEACHER','teacher ']){author={id:'teacher',role};await assert.rejects(service.act({action:'preview',proposalId:id,authorId:'teacher',role:'teacher'}),/владельцу/);}
 assert.equal(service.activeRules().length,0);
});

test('Adversarial: a manually disabled preference stays disabled through unresolved conflicts and later repeated feedback',t=>{
 const directory=temporary(t),governance=createProfileGovernance({directory,courseId:'c',profileId:'p'}),at=new Date().toISOString();
 const profile={schemaVersion:1,version:1,observations:[{id:'one',kind:'task',taskId:'one',text:'Сначала пример',savedAt:at,author:{id:'learner',role:'learner'}},{id:'two',kind:'task',taskId:'two',text:'Сначала схема',savedAt:at,author:{id:'teacher',role:'teacher'}}],rules:[{id:'example',text:'Сначала пример',status:'superseded',supersededBy:'scheme',source:'explicit-feedback',evidenceIds:['one']},{id:'scheme',text:'Сначала схема',status:'active',source:'explicit-feedback',evidenceIds:['two']}],history:[],sharedProposals:[]};
 fs.writeFileSync(path.join(directory,'personalization.json'),JSON.stringify(profile));governance.act({action:'disable-rule',ruleId:'example'});
 let rule=governance.snapshot().personalization.preferences.find(item=>item.id==='example');assert.equal(rule.status,'disabled');assert.match(rule.reviewReason,/вручную/);
 profile.observations.push({...profile.observations[0],id:'three',taskId:'three'});profile.rules[0].evidenceIds.push('three');profile.rules[0].status='active';delete profile.rules[0].supersededBy;fs.writeFileSync(path.join(directory,'personalization.json'),JSON.stringify(profile));
 rule=governance.snapshot().personalization.preferences.find(item=>item.id==='example');assert.equal(rule.status,'disabled');
});

test('Adversarial: solution archives expose the student solution but omit definition and private validator extras',t=>{
 const directory=temporary(t),task={id:'task',name:'Example',description:'Сохрани value.',starter:'value = 1',tests:[{inputs:{value:1},expected:{answer:1}}],referenceCode:'PRIVATE-REFERENCE',wrongVariants:[{code:'PRIVATE-WRONG'}],audit:{shortcutAnalysis:'PRIVATE-AUDIT'}};
 const course={tasks:[task],lessons:[],engineConfig:{}},state={testProofs:{task:{codeHash:'hash',allPassed:true}},taskFeedback:{},claims:{}},versions=createContentVersions({directory,readCourse:()=>course,readState:()=>state,readChecked:()=>({code:'answer = value',codeHash:'hash',referenceCode:'PRIVATE-CHECK-REFERENCE',result:{referenceCode:'PRIVATE-RESULT'}})});
 versions.reconcile();task.description='Сохрани удвоенный value.';versions.reconcile();const archive=JSON.stringify(versions.archive('task'));assert.ok(archive.includes('answer = value'));
 for(const marker of ['PRIVATE-REFERENCE','PRIVATE-WRONG','PRIVATE-AUDIT','PRIVATE-CHECK-REFERENCE','PRIVATE-RESULT'])assert.ok(!archive.includes(marker));
});

async function start(directory,profileId) {
 const course=learningCourseFixture(),server=createGuildServer({course,profileId,stateFile:path.join(directory,profileId,'progress.json'),importHistory:false,learningProvider:'off',reviewProvider:'off',sharedDirectory:path.join(directory,'shared')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,html=await(await fetch(origin)).text(),token=html.match(/name="guild-token" content="([^"]+)"/)[1];
 return{origin,close:()=>new Promise(resolve=>server.close(resolve)),get:async route=>{const response=await fetch(origin+route);return {status:response.status,data:await response.json()};},post:async(input,overrides={})=>{const response=await fetch(origin+'/api/settings',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Guild-Token':token,...overrides},body:JSON.stringify(input)});return{status:response.status,data:await response.json()};}};
}

test('Adversarial: settings cannot override a profile path, cross the session boundary or read arbitrary archives',async t=>{
 const directory=temporary(t),first=await start(directory,'first'),second=await start(directory,'second');t.after(async()=>{await first.close();await second.close();});
 const outside=path.join(directory,'should-not-exist');
 const input={area:'generation',action:'set-limits',dailyCalls:7,profileId:'second',courseId:'foreign',directory:outside,stateFile:path.join(outside,'progress.json'),settingsFile:path.join(directory,'second','generation-settings.json')};
 const changed=await first.post(input);assert.equal(changed.status,200);assert.equal(changed.data.course.profileId,'first');
 assert.equal((await second.get('/api/settings')).data.settings.generation.settings.dailyCalls,12);assert.equal(fs.existsSync(outside),false);
 assert.equal((await first.post(input,{Origin:second.origin})).status,403);assert.equal((await first.post(input,{'X-Guild-Token':'forged'})).status,403);
 for(const id of ['../generation-settings','constructor','__proto__','../../second/progress'])assert.equal((await first.get('/api/content-archive?task='+encodeURIComponent(id))).status,400);
 const before=Object.prototype.polluted;await first.post(JSON.parse('{"area":"generation","action":"set-limits","dailyCalls":8,"__proto__":{"polluted":true}}'));assert.equal(Object.prototype.polluted,before);
});

test('Adversarial: stale common-store writes are rejected instead of losing another profile update',async t=>{
 const directory=temporary(t),raw=[...proposals(),{text:'Пояснять границы на отдельном коротком примере.'}];let trigger=false,second,pending;
 const first=createSharedStandards({directory,profileScope:'c:a',readProposals:()=>{if(trigger){trigger=false;pending=second.act({action:'preview',proposalId:second.snapshot().proposals[1].id});}return raw;},resolveAuthor:()=>({id:'teacher',role:'teacher'}),provider:'off'});
 const id=first.snapshot().proposals[0].id;await first.act({action:'preview',proposalId:id});
 second=createSharedStandards({directory,profileScope:'c:b',readProposals:()=>raw,resolveAuthor:()=>({id:'teacher',role:'teacher'}),provider:'off'});t.after(()=>{first.close();second.close();});
 trigger=true;await assert.rejects(first.act({action:'preview',proposalId:id}),/другом профиле|изменены/);await pending;
 const saved=JSON.parse(fs.readFileSync(path.join(directory,'standards.json')));assert.ok(saved.proposals[1].preview,'the concurrent update survives');assert.equal(saved.proposals.length,2);
});

test('Adversarial: separate profile processes cannot overwrite a shared-store transaction while its lock is held',async t=>{
 const {spawn}=await import('node:child_process'),directory=temporary(t),releaseFile=path.join(directory,'release'),captureFile=path.join(directory,'child-result.json'),moduleUrl=new URL('../shared-standards.mjs',import.meta.url).href;
 const raw=[...proposals(),{text:'Пояснять границы на отдельном коротком примере.'}],service=createSharedStandards({directory,profileScope:'parent',readProposals:()=>raw,resolveAuthor:()=>({id:'teacher',role:'teacher'}),provider:'off'});t.after(()=>service.close());
 const ids=service.snapshot().proposals.map(item=>item.id);await service.act({action:'preview',proposalId:ids[0]});
 const source=`import fs from 'node:fs';import {createSharedStandards} from ${JSON.stringify(moduleUrl)};const directory=${JSON.stringify(directory)},release=${JSON.stringify(releaseFile)};const rename=fs.renameSync;fs.renameSync=function(from,to){if(to===directory+'/standards.json'){process.stdout.write('LOCK-HELD\\n');const deadline=Date.now()+5000;while(!fs.existsSync(release)){if(Date.now()>deadline)throw Error('Parent did not release test lock');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}}return rename(from,to);};const service=createSharedStandards({directory,profileScope:'child',resolveAuthor:()=>({id:'teacher',role:'teacher'}),provider:'off'});try{await service.act({action:'preview',proposalId:${JSON.stringify(ids[0])}});fs.writeFileSync(${JSON.stringify(captureFile)},'ok');}finally{service.close();}`;
 const child=spawn(process.execPath,['--input-type=module','-e',source],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',part=>stdout+=part);child.stderr.on('data',part=>stderr+=part);const finished=new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Child did not acquire test lock: '+stderr)),5000),interval=setInterval(()=>{if(stdout.includes('LOCK-HELD')){clearTimeout(timer);clearInterval(interval);resolve();}else if(child.exitCode!==null){clearTimeout(timer);clearInterval(interval);reject(Error(stderr||'Child exited early'));}},10);});
  await assert.rejects(service.act({action:'preview',proposalId:ids[1]}),/сохраняет|заблокир/);
 }finally{fs.writeFileSync(releaseFile,'release');}
 const result=await finished;assert.equal(result.code,0,stderr);assert.equal(fs.readFileSync(captureFile,'utf8'),'ok');
 await service.act({action:'preview',proposalId:ids[1]});const saved=JSON.parse(fs.readFileSync(path.join(directory,'standards.json')));assert.ok(saved.proposals[0].preview);assert.ok(saved.proposals[1].preview);assert.equal(fs.existsSync(path.join(directory,'standards.json.lock')),false);
});

test('Adversarial: opening another profile preserves a live independent review and rejects duplicate launches',async t=>{
 const directory=temporary(t);let release;const gate=new Promise(resolve=>release=resolve),first=createSharedStandards({directory,profileScope:'first',readProposals:proposals,resolveAuthor:()=>({id:'teacher',role:'teacher'}),provider:'file',reviewFixture:async input=>{await gate;return review(input);}});let second;t.after(()=>{release();first.close();second?.close();});
 const id=first.snapshot().proposals[0].id,pending=first.act({action:'review',proposalId:id});pending.catch(()=>{});
 second=createSharedStandards({directory,profileScope:'second',readProposals:proposals,resolveAuthor:()=>({id:'teacher',role:'teacher'}),provider:'file',reviewFixture:review});
 assert.equal(second.snapshot().proposals[0].status,'reviewing','another live profile must not label the review interrupted');assert.equal(second.snapshot().proposals[0].reviewOwner,undefined,'review-owner coordination remains private');
 await assert.rejects(second.act({action:'review',proposalId:id}),/уже проверяется/);release();const result=await pending;assert.equal(result.preview.status,'approved');assert.equal(second.snapshot().proposals[0].status,'approved');
});

test('Adversarial: a late answer from a rejected review cannot approve a newer review owned by another profile',async t=>{
 const directory=temporary(t);let releaseFirst,releaseSecond;const firstGate=new Promise(resolve=>releaseFirst=resolve),secondGate=new Promise(resolve=>releaseSecond=resolve);
 const first=createSharedStandards({directory,profileScope:'first',readProposals:proposals,resolveAuthor:()=>({id:'teacher',role:'teacher'}),provider:'file',reviewFixture:async input=>{await firstGate;return review(input);}}),id=first.snapshot().proposals[0].id;
 const oldReview=first.act({action:'review',proposalId:id});oldReview.catch(()=>{});
 const second=createSharedStandards({directory,profileScope:'second',readProposals:proposals,resolveAuthor:()=>({id:'teacher',role:'teacher'}),provider:'file',reviewFixture:async input=>{await secondGate;return {...review(input),approved:false,summary:'Новая независимая проверка отклоняет правило.'};}});let newReview;
 try{await second.act({action:'reject',proposalId:id});newReview=second.act({action:'review',proposalId:id});newReview.catch(()=>{});releaseFirst();await oldReview;
  assert.equal(second.snapshot().proposals[0].status,'reviewing','the obsolete answer must not replace a newer review');releaseSecond();await newReview;
  assert.equal(second.snapshot().proposals[0].status,'needs-changes');assert.equal(second.activeRules().length,0);
 }finally{releaseFirst();releaseSecond();await Promise.allSettled([oldReview,newReview].filter(Boolean));first.close();second.close();}
});

test('Adversarial: an obsolete reviewer failure cannot fail a newer review owned by another profile',async t=>{
 const directory=temporary(t);let releaseFirst,releaseSecond;const firstGate=new Promise(resolve=>releaseFirst=resolve),secondGate=new Promise(resolve=>releaseSecond=resolve);
 const first=createSharedStandards({directory,profileScope:'first',readProposals:proposals,resolveAuthor:()=>({id:'teacher',role:'teacher'}),provider:'file',reviewFixture:async()=>{await firstGate;throw Error('Original reviewer failed');}}),id=first.snapshot().proposals[0].id;
 const oldReview=first.act({action:'review',proposalId:id});oldReview.catch(()=>{});
 const second=createSharedStandards({directory,profileScope:'second',readProposals:proposals,resolveAuthor:()=>({id:'teacher',role:'teacher'}),provider:'file',reviewFixture:async input=>{await secondGate;return review(input);}});let newReview;
 try{await second.act({action:'reject',proposalId:id});newReview=second.act({action:'review',proposalId:id});newReview.catch(()=>{});releaseFirst();await assert.rejects(oldReview,/Original reviewer failed/);
  assert.equal(second.snapshot().proposals[0].status,'reviewing','an obsolete failure belongs to its original request');releaseSecond();await newReview;
  assert.equal(second.snapshot().proposals[0].status,'approved');assert.equal(second.activeRules().length,0,'review approval still does not accept the rule');
 }finally{releaseFirst();releaseSecond();await Promise.allSettled([oldReview,newReview].filter(Boolean));first.close();second.close();}
});

test('Adversarial: expired review recovery works without restarting, preserves live owners and fails closed on a busy store',async t=>{
 const directory=temporary(t),raw=[...proposals(),{text:'Пояснять границы на отдельном коротком примере.'}];let calls=0;
 const service=createSharedStandards({directory,profileScope:'existing-profile',readProposals:()=>raw,resolveAuthor:()=>({id:'teacher',role:'teacher'}),provider:'file',reviewFixture:input=>{calls++;return review(input);}});t.after(()=>service.close());
 const ids=service.snapshot().proposals.map(item=>item.id);await service.act({action:'preview',proposalId:ids[0]});
 const file=path.join(directory,'standards.json'),stored=JSON.parse(fs.readFileSync(file));
 stored.proposals[0].status='reviewing';stored.proposals[0].reviewOwner={pid:process.pid,token:'expired-owner',deadline:Date.now()-1};
 stored.proposals[1].status='reviewing';stored.proposals[1].reviewOwner={pid:process.pid,token:'live-owner',deadline:Date.now()+60000};stored.revision++;
 fs.writeFileSync(file,JSON.stringify(stored));const before=fs.readFileSync(file,'utf8'),lock=file+'.lock';fs.writeFileSync(lock,JSON.stringify({pid:process.pid}));
 try{await assert.rejects(service.act({action:'review',proposalId:ids[0]}),/Другой профиль сейчас сохраняет/);assert.equal(fs.readFileSync(file,'utf8'),before);assert.equal(calls,0,'lock contention must not start a model call');}finally{fs.unlinkSync(lock);}
 const result=await service.act({action:'review',proposalId:ids[0]});assert.equal(result.preview.status,'approved');assert.equal(calls,1);
 const after=JSON.parse(fs.readFileSync(file));assert.equal(after.proposals[1].status,'reviewing');assert.equal(after.proposals[1].reviewOwner.token,'live-owner');assert.equal(service.activeRules().length,0,'recovery/review never accepts a teaching rule');
});

test('Adversarial: an ownerless interrupted review becomes retryable from an already running profile',async t=>{
 const directory=temporary(t),service=createSharedStandards({directory,profileScope:'existing-profile',readProposals:proposals,resolveAuthor:()=>({id:'teacher',role:'teacher'}),provider:'off'});t.after(()=>service.close());
 const id=service.snapshot().proposals[0].id;await service.act({action:'preview',proposalId:id});const file=path.join(directory,'standards.json'),stored=JSON.parse(fs.readFileSync(file));stored.proposals[0].status='reviewing';delete stored.proposals[0].reviewOwner;stored.revision++;fs.writeFileSync(file,JSON.stringify(stored));
 const result=await service.act({action:'preview',proposalId:id});assert.equal(result.preview.status,'failed');assert.equal(service.snapshot().proposals[0].canAccept,false);assert.match(result.preview.error,/прервана/);
});
