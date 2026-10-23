import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {blankCourse} from '../shared/blank-course.mjs';import {createGuildServer} from '../server.mjs';
test('server rejects early final and next region, then unlocks both in order without minting blocked rewards',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-block-gate-')),course=blankCourse({id:'block-fixture'});let server;
 try{
  course.program.blocks=[{id:'one',title:'First',nodeIds:['learn','exam']},{id:'two',title:'Second',nodeIds:['next']}];
  for(const id of ['learn','exam','next']){
   const task='task-'+id,lesson='lesson-'+id,point='point-'+id;
   course.tasks.push({id:task,name:id,description:'Technical fixture',starter:'',tests:[{label:'Fixture',inputs:{},expected:{answer:1}}]});
   course.lessons.push({id:lesson,title:id,type:id==='exam'?'exam':'lesson',taskIds:[task],sections:[],reward:1});
   course.engineConfig.courseMap.points.push({id:point,name:id,kind:id==='exam'?'statue':'teleport',region:'learning-path',x:20,y:20,task,lessonId:lesson});
   course.engineConfig.taskRewards[task]=1;course.engineConfig.taskTopics[task]=[point];
   course.adaptation.roadmap.push({id,title:id,kind:id==='exam'?'exam':'lesson',lessonId:lesson,pointId:point,blockId:id==='next'?'two':'one',prerequisites:[],learningGoals:['Fixture']});
  }
  server=createGuildServer({course,stateFile:path.join(dir,'progress.json'),reviewProvider:'off',learningProvider:'off',importHistory:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+server.address().port,html=await(await fetch(base+'/')).text(),token=html.match(/name="guild-token" content="([^"]+)"/)[1];
  const state=async()=>await(await fetch(base+'/api/state')).json();
  const post=async task=>{const r=await fetch(base+'/api/check',{method:'POST',headers:{Origin:base,'Content-Type':'application/json','X-Guild-Token':token},body:JSON.stringify({task,code:'answer = 1\nprint(answer)'})});return {status:r.status,body:await r.json()};};
  const before=await state();assert.equal(before.program.nodes.find(n=>n.id==='exam').available,false);assert.equal(before.presentation.points['point-exam'].available,false);
  assert.equal((await post('task-exam')).status,400);assert.equal((await post('task-next')).status,400);
  const blocked=await state();assert.deepEqual(blocked.state.claims,before.state.claims);assert.equal(blocked.state.currency,before.state.currency);assert.ok(!blocked.state.testProofs?.['task-exam']);
  assert.equal((await post('task-learn')).body.result.ok,true);assert.equal((await state()).program.nodes.find(n=>n.id==='exam').available,true);
  assert.equal((await post('task-next')).status,400);
  assert.equal((await post('task-exam')).body.result.ok,true);assert.equal((await state()).program.nodes.find(n=>n.id==='next').available,true);
  assert.equal((await post('task-next')).body.result.ok,true);
 }finally{if(server)await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
