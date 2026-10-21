import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {aiRoles,defaultAiEfforts,aiEffortPreset,effortForTask,normalizeAiEfforts} from '../ai-policy.mjs';
import {createProfileGovernance} from '../profile-governance.mjs';
import {createReviewBridge} from '../review.mjs';
import {createLearningService} from '../adaptation/service.mjs';
import {createSharedStandards} from '../shared-standards.mjs';
import {createGenerationControl} from '../generation-control.mjs';
import {createGuildServer} from '../server.mjs';
import {sourceCourse,adaptationFixtureProvider,code,hash} from './adaptation-fixtures.mjs';
import {learningCourseFixture} from './learning-course-fixture.mjs';
import {findPython312} from '../local-config.mjs';
import {startCodexReview} from '../codex-reviewer.mjs';
const temp=t=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-effort-settings-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;};

test('Defaults are read-only, seven roles persist per profile, partial updates and presets preserve unrelated data',t=>{
 const directory=temp(t),options={directory,courseId:'synthetic',profileId:'synthetic'},governance=createProfileGovernance(options),file=path.join(directory,'settings.json');
 assert.deepEqual(governance.settings().aiEfforts,defaultAiEfforts);assert.equal(fs.existsSync(file),false);
 governance.act({action:'update-about',about:{interests:'Synthetic music'}});const old=JSON.parse(fs.readFileSync(file));old.unknown={keep:true};fs.writeFileSync(file,JSON.stringify(old));
 governance.act({action:'set-ai-efforts',preset:'medium'});assert.deepEqual(governance.settings().aiEfforts,aiEffortPreset('medium'));
 governance.act({action:'set-ai-efforts',efforts:{tutorHint:'low',tutorReview:'xhigh'}});
 const restarted=createProfileGovernance(options).settings();assert.equal(restarted.aiEfforts.tutorHint,'low');assert.equal(restarted.aiEfforts.tutorReview,'xhigh');assert.equal(restarted.aiEfforts.lessonReview,'medium');assert.equal(restarted.about.interests,'Synthetic music');assert.deepEqual(restarted.unknown,{keep:true});
 const before=fs.readFileSync(file);for(const input of [{efforts:{program:'ultra'}},{efforts:{unknown:'medium'}},{efforts:null},{preset:'automatic'},{efforts:{lessonReview:null}},{efforts:{tutorHint:['low']}},{preset:'medium',efforts:{program:'ultra'}}])assert.throws(()=>governance.act({action:'set-ai-efforts',...input}));assert.deepEqual(fs.readFileSync(file),before);
 assert.throws(()=>normalizeAiEfforts([]));assert.throws(()=>effortForTask('missing'));
 governance.act({action:'set-ai-efforts',preset:'xhigh'});assert.ok(Object.values(governance.settings().aiEfforts).every(value=>value==='xhigh'));
 governance.act({action:'set-ai-efforts',preset:'defaults'});assert.deepEqual(governance.settings().aiEfforts,defaultAiEfforts);
});

test('Tutor help and review resolve independent live defaults and keep distinct cache keys',t=>{
 const directory=temp(t);let efforts={tutorHint:'low',tutorReview:'xhigh'};const bridge=createReviewBridge(directory,{provider:'file',readAiEfforts:()=>efforts}),task={id:'synthetic',name:'Synthetic task',description:'Explain a number'};t.after(()=>bridge.close());
 const help=bridge.enqueue(task,'pass','',{ok:false,tests:[]}),review=bridge.enqueue(task,'pass','',{ok:true,tests:[]});assert.equal(help.effort,'low');assert.equal(review.effort,'xhigh');efforts=aiEffortPreset('medium');const changed=bridge.enqueue(task,'pass','',{ok:true,tests:[]});assert.equal(changed.effort,'medium');assert.notEqual(changed.id,review.id);assert.equal(bridge.defaultEffort,'medium');assert.equal(bridge.helpDefaultEffort,'medium');
});

for(const program of [false,true])test(`All Medium preserves ${program?'program':'lesson'} validation pipeline and resumes provider limit without regenerating completed stages`,async t=>{
 const directory=temp(t),course=sourceCourse(),governance=createProfileGovernance({directory,courseId:course.id}),calls=[],state={testProofs:Object.fromEntries(course.tasks.map(task=>[task.id,{codeHash:hash,allPassed:true}]))};let blocked=true;
 governance.act({action:'set-ai-efforts',preset:'medium'});
 const service=createLearningService({directory,course,readState:()=>state,readChecked:()=>({code,codeHash:hash,result:{ok:true,tests:[]}}),python:findPython312(),provider:'file',governance,fixtureProvider:async input=>{calls.push([input.stage,input.role,input.effort]);if(input.stage==='personalize')return {summary:'No changes',preferences:[],sharedProposals:[]};if(input.stage==='review'&&blocked)throw Object.assign(Error('Synthetic account limit'),{code:'GUILD_PROVIDER_LIMIT'});return adaptationFixtureProvider(input);}});t.after(async()=>{service.close();await service.whenIdle();});
 const before=JSON.stringify(state),job=program?await service.requestProgram({lessonId:'source-lesson',message:'Please make a smaller example',kind:'repair'}):await service.submit({lessonId:'source-lesson'});await service.whenIdle();let status=service.getStatus(job.id);assert.equal(status.status,'failed');assert.equal(status.providerBlocked,true);assert.equal(status.canRetry,true);const attempt=status.attempt;
 assert.equal(service.loadOverlay().lessons.length,0);blocked=false;await service.manage({action:'resume-job',jobId:job.id});await service.whenIdle();status=service.getStatus(job.id);assert.equal(status.status,'ready',status.error);assert.equal(status.attempt,attempt);assert.deepEqual(calls.map(call=>call[0]),['personalize','generate','review','review']);assert.ok(calls.every(call=>call[2]==='medium'));assert.deepEqual(calls.map(call=>call[1]),program?['program','program','program','program']:['personalization','lessonGeneration','lessonReview','lessonReview']);assert.equal(service.loadOverlay().lessons.length,1);assert.equal(JSON.stringify(state),before);
 const published=JSON.parse(fs.readFileSync(path.join(directory,'adaptive','published',job.id+'.json')));assert.ok(published.audits.author);assert.ok(published.audits.independent);
});

test('Shared rule reviewer receives the selected effort without relaxing exact-preview acceptance',async t=>{
 const directory=temp(t),efforts=aiEffortPreset('medium'),control=createGenerationControl(directory,{readAiEfforts:()=>efforts});let seen;
 const service=createSharedStandards({directory:path.join(directory,'shared'),readAiEfforts:()=>efforts,readProposals:()=>[{text:'Explain one concept with a small example.'}],resolveLocalOwner:()=>({id:'owner',role:'local-owner'}),provider:'file',generationControl:control,reviewFixture:async input=>{seen=input.effort;return {candidateHash:input.candidate.candidateHash,approved:true,summary:'Checked',examples:[{domain:'Python',input:'List',application:'Explain indexing'},{domain:'SQL',input:'Table',application:'Explain filtering'}]};}});t.after(()=>service.close());const item=service.snapshot().proposals[0];await service.act({action:'review',proposalId:item.id});assert.equal(seen,'medium');assert.equal(service.activeRules().length,0);assert.equal(control.management().usage.calls,1);
});

test('Settings API survives server restart, rejects invalid values and remains profile-local',async t=>{
 const directory=temp(t),course=learningCourseFixture(),options={course,stateFile:path.join(directory,'progress.json'),importHistory:false,reviewProvider:'file',learningProvider:'off'};let server,origin,headers;
 async function start(){server=createGuildServer(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;const html=await(await fetch(origin)).text();headers={Origin:origin,'Content-Type':'application/json','X-Guild-Token':html.match(/name="guild-token" content="([^"]+)"/)[1]};}
 const stop=()=>new Promise(resolve=>server.close(resolve));const post=input=>fetch(origin+'/api/settings',{method:'POST',headers,body:JSON.stringify({area:'profile',action:'set-ai-efforts',...input})});await start();t.after(stop);
 assert.equal((await post({preset:'medium'})).status,200);assert.equal((await post({efforts:{tutorHint:'low',tutorReview:'high'}})).status,200);assert.equal((await post({efforts:{lessonGeneration:'unlimited'}})).status,400);await stop();await start();const state=await(await fetch(origin+'/api/state')).json();assert.equal(state.reviewer.defaultEffort,'high');assert.equal(state.reviewer.helpDefaultEffort,'low');assert.equal(state.settings.generation.modelPolicy.lessonEffort,'medium');assert.equal(state.settings.ai.roles.length,7);assert.equal(state.settings.profile.settings.aiEfforts.sharedRuleReview,'medium');
});

test('Provider limit event and unsupported effort stderr become safe retryable messages without raw details',async t=>{
 const directory=temp(t);fs.writeFileSync(path.join(directory,'package.json'),' {"type":"module"}');
 for(const [source,expected]of [["process.stdout.write(JSON.stringify({type:'turn.failed',error:{message:'usage_limit_reached PRIVATE_TOKEN'}})+'\\n');",'GUILD_PROVIDER_LIMIT'],["process.stderr.write('Unsupported reasoning effort PRIVATE_TOKEN');",'GUILD_UNSUPPORTED_EFFORT']]){
  fs.writeFileSync(path.join(directory,'exec'),source+'process.exitCode=1;process.stdin.resume();');const statusFile=path.join(directory,'status.json');const child=startCodexReview({executable:process.execPath,prompt:'Synthetic',effort:'medium',schema:{type:'object'},schemaFile:path.join(directory,'schema.json'),resultFile:path.join(directory,'result.json'),statusFile,cwd:directory,jsonEvents:true,timeoutMs:4000});await new Promise(resolve=>child.once('close',resolve));const status=JSON.parse(fs.readFileSync(statusFile));assert.equal(status.code,expected);assert.equal(status.status,'failed');assert.ok(!JSON.stringify(status).includes('PRIVATE_TOKEN'));assert.match(status.error,/сохранены/);
 }
});
