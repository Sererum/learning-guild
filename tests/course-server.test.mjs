import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGuildServer} from '../server.mjs';
import {catalog,banners,gameInitialState} from '../shared/game-config.mjs';

const solution='answer = sample + 1\nprint(answer)';
const privateMarker='PRIVATE_REFERENCE_SOLUTION_DO_NOT_EXPOSE';
function course(id='data-course'){
 const tasks=[{id:'sample-reading',name:'Reading fixture',description:'Independent technical fixture',starter:'sample = 2\n',reward:160,solution:privateMarker,referenceSolution:privateMarker,solutions:[privateMarker],tests:[
  {label:'Shown case',inputs:{sample:2},expected:{answer:3}},
  {label:'Boundary case',hidden:true,inputs:{sample:987654321},expected:{answer:987654322}}
 ]}];
 const lessons=[{id:'reading-lesson',title:'Fixture lesson',name:'Fixture lesson',taskIds:['sample-reading'],sections:[],reward:160}];
 return {id,manifest:{schemaVersion:1,id,title:'Technical course fixture',runtime:'basic-python'},tasks,lessons,repairPoints:[],engineConfig:{
  catalog,banners,initialState:{...gameInitialState,name:'Test learner'},
  courseMap:{start:{id:'start',name:'Start',x:5,y:5},points:[{id:'readings',name:'Readings',kind:'teleport',x:20,y:20,task:'sample-reading',lessonId:'reading-lesson'}],regions:[],routes:[{from:'start',to:'readings'}]},
  taskRewards:{'sample-reading':160},taskRules:{'sample-reading':{}},taskTopics:{'sample-reading':['readings']},pointPrerequisites:{readings:null},courseHistory:[],achievements:[],rewardGroups:[],qualityCaps:{'sample-reading':10},recurringTasks:[]
 }};
}
async function start(options){
 const server=createGuildServer({reviewProvider:'off',python:process.env.GUILD_PYTHON||process.env.GUILD_TEST_PYTHON||path.join(os.homedir(),'.local/bin/python3.12'),...options});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const base='http://127.0.0.1:'+server.address().port;
 const html=await(await fetch(base+'/')).text();const token=html.match(/name="guild-token" content="([^"]+)"/)?.[1];assert.ok(token,'HTML must expose only the local session token');
 return {server,base,token,async get(route='/api/state'){return fetch(base+route);},async state(){return(await(await fetch(base+'/api/state')).json());},async post(route,payload,headers={}){return fetch(base+route,{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Guild-Token':token,...headers},body:JSON.stringify(payload)});},async close(){await new Promise(resolve=>server.close(resolve));}};
}
function tree(directory){return fs.readdirSync(directory,{recursive:true}).filter(name=>fs.statSync(path.join(directory,name)).isFile()).sort().map(name=>[name,fs.readFileSync(path.join(directory,name),'utf8')]);}

test('Different courses and profiles isolate API progress; a restart retains only the selected profile',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-course-server-'));let first,second,third,restarted;
 try{
  const aFile=path.join(directory,'course-a','one','progress.json'),bFile=path.join(directory,'course-b','one','progress.json'),anotherFile=path.join(directory,'course-a','two','progress.json');
  first=await start({course:course('course-a'),profileId:'one',stateFile:aFile});
  second=await start({course:course('course-b'),profileId:'one',stateFile:bFile});
  third=await start({course:course('course-a'),profileId:'two',stateFile:anotherFile});
  for(const app of [first,second,third])assert.equal((await app.state()).state.currency,0);
  const checked=await first.post('/api/check',{task:'sample-reading',code:solution});assert.equal(checked.status,200);const result=await checked.json();assert.equal(result.result.ok,true);assert.equal(result.result.reward.gems,160);assert.equal(result.state.currency,160);
  assert.equal((await second.state()).state.currency,0);assert.equal((await third.state()).state.currency,0);
  assert.equal((await first.state()).course.storageScope,'course-a:one');assert.equal((await third.state()).course.storageScope,'course-a:two');
  await first.close();first=null;const saved=fs.readFileSync(aFile,'utf8');
  restarted=await start({course:course('course-a'),profileId:'one',stateFile:aFile});assert.equal((await restarted.state()).state.currency,160);assert.equal(fs.readFileSync(aFile,'utf8'),saved);
  const repeated=await(await restarted.post('/api/check',{task:'sample-reading',code:solution})).json();assert.equal(repeated.result.reward.already,true);assert.equal(repeated.state.currency,160);
  assert.throws(()=>createGuildServer({course:course('course-b'),profileId:'one',stateFile:aFile,reviewProvider:'off'}),/другому курсу/);
  assert.throws(()=>createGuildServer({course:course('course-a'),profileId:'two',stateFile:aFile,reviewProvider:'off'}),/другому курсу или профилю/);
  assert.equal((await restarted.state()).state.currency,160);
 }finally{for(const app of [first,second,third,restarted])if(app)await app.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('Public snapshots, failed hidden tests, browser rules and static routes do not expose private fixtures or reference code',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-course-private-'));let app;
 try{
  app=await start({course:course(),stateFile:path.join(directory,'progress.json')});
  const snapshot=await app.state();const publicText=JSON.stringify(snapshot);
  assert.ok(!publicText.includes(privateMarker));assert.ok(!publicText.includes('987654321'));assert.ok(!publicText.includes('987654322'));
  assert.equal(snapshot.tasks[0].cases[1].hidden,true);assert.equal(snapshot.tasks[0].cases[1].inputs,undefined);assert.equal(snapshot.tasks[0].tests,undefined);
  const failed=await(await app.post('/api/check',{task:'sample-reading',code:'answer = 3\nprint(answer)'})).json();assert.equal(failed.result.ok,false);
  assert.equal(failed.result.tests[1].hidden,true);assert.equal(failed.result.tests[1].mismatches,undefined);assert.equal(failed.result.tests[1].actualValues,undefined);
  assert.ok(!JSON.stringify(failed).includes('987654321'));assert.ok(!JSON.stringify(failed).includes('987654322'));
  const rules=await(await app.get('/rules.js')).text();for(const marker of [privateMarker,'987654321','987654322'])assert.ok(!rules.includes(marker));
  for(const route of ['/courses/data-course/index.mjs','/courses/alice-python/rules.json','/tasks.mjs','/server.mjs','/runner.py','/profiles/progress.json','/data/progress.json','/../course-loader.mjs'])assert.equal((await app.get(route)).status,404,route);
  const exposed=await(await app.post('/api/reveal-test',{task:'sample-reading',index:1})).json();assert.equal(exposed.tasks[0].cases[1].hidden,false);assert.equal(exposed.tasks[0].cases[1].inputs.sample,987654321);
 }finally{if(app)await app.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('Invalid tasks, unsupported actions and rejected session requests leave persisted profile data unchanged',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-course-invalid-'));let app;
 try{
  app=await start({course:course(),stateFile:path.join(directory,'progress.json'),dailyClock:()=>new Date('2026-10-22T12:00:00Z')});const baseline=tree(directory),state=await app.state();
  for(const [route,input] of [
   ['/api/check',{task:'missing',code:solution}],['/api/run',{task:'missing',code:solution}],['/api/reveal-test',{task:'missing',index:0}],
   ['/api/ai-review',{task:'missing',code:solution}],['/api/task-feedback',{task:'missing',lesson:'reading-lesson',code:solution}],
   ['/api/review-result',{id:'../../outside'}],['/api/action',{type:'claim',task:'sample-reading'}]
  ]){assert.equal((await app.post(route,input)).status,400,route);assert.deepEqual(tree(directory),baseline,route);}
  assert.equal((await app.post('/api/check',{task:'sample-reading',code:solution},{Origin:'http://elsewhere.invalid'})).status,403);
  assert.equal((await app.post('/api/check',{task:'sample-reading',code:solution},{'X-Guild-Token':'wrong'})).status,403);
  assert.deepEqual(tree(directory),baseline);assert.deepEqual(await app.state(),state);
 }finally{if(app)await app.close();fs.rmSync(directory,{recursive:true,force:true});}
});
