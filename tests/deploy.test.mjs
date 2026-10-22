import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
import {autostartPlan, validateDeployment, validateDeploymentBinding, parseOptions, assertPortFree, deploymentSelection, assertNoLegacyAutostarts, main} from '../tools/deploy.mjs';

const config = {version:2, mode:'accounts', applicationRoot:'/test/Learning Guild', port:4327, node:'/test/Node & Apps/node', python:'/test/Python 3.12/python', codex:'/test/Codex/codex', path:'/test/bin:/usr/bin:/bin'};
const temporary=t=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-deploy-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;};

test('deployment validates installation-wide runtime and rejects profile-bound or legacy launch',()=>{
 assert.equal(validateDeployment(config),config);
 for(const port of [0,80,65536,4327.5,'4327'])assert.throws(()=>validateDeployment({...config,port}),/Порт/);
 assert.throws(()=>validateDeployment({...config,python:'python'}),/полный путь/);
 assert.throws(()=>validateDeployment({...config,applicationRoot:'relative'}),/полный путь/);
 assert.throws(()=>validateDeployment({...config,profileId:'one'}),/одного профиля/);
 assert.throws(()=>validateDeployment({...config,courseId:'specific'}),/одного профиля/);
 assert.throws(()=>validateDeployment({...config,version:1}),/прежнего сервера.*резервную копию/);
});

test('setup selects all local courses and never creates or rewrites saved data',t=>{
 const appRoot=temporary(t);
 assert.deepEqual(deploymentSelection({}, {appRoot}),{mode:'accounts',applicationRoot:appRoot});
 assert.deepEqual(fs.readdirSync(appRoot),[]);
 for(const options of [{profileId:'old'},{stateFile:'/old/progress.json'}])assert.throws(()=>deploymentSelection(options,{appRoot}),/migrate-local-courses/);
 assert.deepEqual(fs.readdirSync(appRoot),[]);
});

test('legacy binding validation can inspect any course for migration without changing files',t=>{
 const appRoot=temporary(t),folder=path.join(appRoot,'imported');fs.mkdirSync(folder);
 const stateFile=path.join(folder,'progress.json'),identity={courseId:'sample-course',profileId:'student'};
 const originals={'progress.json':JSON.stringify({version:1,currency:123,unknown:{preserve:true}}),'profile.json':JSON.stringify({version:1,...identity}),'course-state.json':JSON.stringify({schemaVersion:1,...identity,history:[]})};
 for(const [name,text]of Object.entries(originals))fs.writeFileSync(path.join(folder,name),text);
 const input={...identity,stateFile};assert.equal(validateDeploymentBinding(input),input);
 assert.throws(()=>validateDeploymentBinding({...input,courseId:'other'}),/ID профиля/);
 assert.throws(()=>validateDeploymentBinding({...input,profileId:'other'}),/ID профиля/);
 for(const [name,text]of Object.entries(originals))assert.equal(fs.readFileSync(path.join(folder,name),'utf8'),text);
});

test('legacy migration validation refuses incomplete and mismatched saved data',t=>{
 const folder=temporary(t),stateFile=path.join(folder,'progress.json'),input={courseId:'course',profileId:'student',stateFile};
 fs.writeFileSync(stateFile,'{"version":1}');assert.throws(()=>validateDeploymentBinding(input),/нет profile.json/);
 const binding=path.join(folder,'profile.json');fs.writeFileSync(binding,JSON.stringify({version:1,courseId:'course',profileId:'student'}));
 fs.writeFileSync(path.join(folder,'course-state.json'),JSON.stringify({schemaVersion:1,courseId:'course',profileId:'different'}));
 assert.throws(()=>validateDeploymentBinding(input),/course-state.json/);
 fs.rmSync(path.join(folder,'course-state.json'));fs.rmSync(binding);fs.symlinkSync(stateFile,binding);
 assert.throws(()=>validateDeploymentBinding(input),/обычным JSON/);
});

test('options retain path boundaries and old profile flags fail with migration guidance',async()=>{
 assert.deepEqual(parseOptions(['--python','/Python 3.12/python','--port','4901','--dry-run']),{python:'/Python 3.12/python',port:'4901',dryRun:true});
 for(const args of [['--host','0.0.0.0'],['--python'],['--python','--port'],['--profile','one','--profile','two']])assert.throws(()=>parseOptions(args));
 await assert.rejects(main(['start','--profile','other']),/Параметры не поддерживаются/);
 await assert.rejects(main(['setup','--profile','other']),/migrate-local-courses/);
 await assert.rejects(main(['setup','--state-file','/old/progress.json']),/migrate-local-courses/);
});

test('one user LaunchAgent serves all courses; plan escapes XML without writing files',()=>{
 const home=path.join(os.tmpdir(),'guild-plan-'+process.pid),appRoot='/test/Learning & Guild',plan=autostartPlan(config,{home,appRoot,platform:'darwin'});
 assert.equal(fs.existsSync(home),false);assert.equal(plan.label,'local.learning-guild');assert.equal(plan.file,path.join(home,'Library','LaunchAgents','local.learning-guild.plist'));
 assert.match(plan.content,/Node &amp; Apps/);assert.match(plan.content,/Learning &amp; Guild/);assert.match(plan.content,/<key>RunAtLoad<\/key><true\/>/);assert.match(plan.content,/<key>KeepAlive<\/key><false\/>/);assert.match(plan.content,/<string>start<\/string>/);
 assert.doesNotMatch(plan.content,/filipov|sudo|trusted-local|0\.0\.0\.0|--profile|--state-file/);
 if(process.platform==='darwin'){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-plist-test-'));try{const file=path.join(directory,'launch.plist');fs.writeFileSync(file,plan.content);const result=spawnSync('/usr/bin/plutil',['-lint',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr||result.stdout);}finally{fs.rmSync(directory,{recursive:true,force:true});}}
});

test('old profile autostart blocks second service without editing any LaunchAgent',t=>{
 const home=temporary(t),folder=path.join(home,'Library','LaunchAgents');fs.mkdirSync(folder,{recursive:true});
 assertNoLegacyAutostarts({home});const file=path.join(folder,'local.learning-guild.student.plist');fs.writeFileSync(file,'old');
 assert.throws(()=>assertNoLegacyAutostarts({home}),/прежний автозапуск/);assert.equal(fs.readFileSync(file,'utf8'),'old');
 fs.rmSync(file);fs.writeFileSync(path.join(folder,'com.example.other.plist'),'unrelated');assertNoLegacyAutostarts({home});
});

test('unsupported platform never produces an autostart plan',()=>{for(const platform of ['win32','linux'])assert.throws(()=>autostartPlan(config,{platform}),/только в macOS/);});

test('occupied loopback port is rejected without touching its listener',async()=>{
 const server=net.createServer(socket=>socket.end('owned test server'));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 try{await assert.rejects(assertPortFree(port),/занят/);assert.equal(server.listening,true);}finally{await new Promise(resolve=>server.close(resolve));}await assertPortFree(port);
});
