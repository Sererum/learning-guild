import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createGuildServer} from '../server.mjs';import {algorithmSolutions} from './algorithm-solutions.mjs';
import {algorithmTasks} from '../algorithm-lesson.mjs';
test('Feedback requires real tests, follows the 1–5 template, saves once per task and does not change rewards',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-task-feedback-')),file=path.join(dir,'state.json');let server=createGuildServer({stateFile:file,reviewProvider:'off'});
 const start=async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,html=await(await fetch(origin)).text();return{origin,headers:{Origin:origin,'Content-Type':'application/json','X-Guild-Token':html.match(/name="guild-token" content="([^"]+)"/)[1]}};};
 let connection=await start();const post=async(route,input,headers=connection.headers)=>{const response=await fetch(connection.origin+route,{method:'POST',headers,body:JSON.stringify(input)});return{status:response.status,data:await response.json()};};
 const state=async()=>(await(await fetch(connection.origin+'/api/state')).json()).state;
 const code='best_sale = 0\nfor sale in sales:\n    if sale > best_sale:\n        best_sale = sale\nprint(best_sale)';
 const feedback={task:'algo-max-1',lesson:'algorithms',code,difficulty:4,hardPart:'boundaries',hardDetails:'Начало с нуля на отрицательных днях',hintSource:'ai',hintDetails:'Подсказка предложила проверить только отрицательные дни.'};
 try{
  assert.equal((await post('/api/task-feedback',feedback)).status,400);assert.equal((await state()).taskFeedback,undefined);
  assert.equal((await post('/api/check',{task:feedback.task,code})).data.result.ok,false);
  for(const invalid of [{difficulty:0},{difficulty:6},{difficulty:'3'},{hardPart:'fake'},{hintSource:'fake'},{hintDetails:''},{lesson:'foundations-final'},{code:'best_sale = 5'}]){
   assert.equal((await post('/api/task-feedback',{...feedback,...invalid})).status,400,JSON.stringify(invalid));assert.equal((await state()).taskFeedback,undefined);
  }
  assert.equal((await post('/api/task-feedback',feedback,{...connection.headers,Origin:'https://example.org'})).status,403);
  const before=await state(),saved=await post('/api/task-feedback',feedback);assert.equal(saved.status,200);assert.equal(saved.data.result.already,false);
  const record=saved.data.state.taskFeedback[feedback.task][0];assert.equal(record.testComparison,undefined,'feedback saves without the removed comparison field');assert.equal(record.difficulty,4);assert.equal(record.allPassed,false);assert.equal(record.lessonId,'algorithms');assert.equal(record.tests.length,algorithmTasks.find(t=>t.id===feedback.task).tests.length);assert.ok(record.tests.some(t=>!t.ok));assert.equal(record.templateVersion,'task-reflection-v2');
  const withoutFeedback=structuredClone(saved.data.state);delete withoutFeedback.taskFeedback;assert.deepEqual(withoutFeedback,before,'self-assessment cannot alter claims, inventory, currency or test results');
  assert.ok(!JSON.stringify(record).includes('"inputs"'));assert.ok(!JSON.stringify(record).includes('"expected"'));
  const repeat=await post('/api/task-feedback',feedback);assert.equal(repeat.data.result.already,true);assert.equal(repeat.data.state.taskFeedback[feedback.task].length,1);
  const passed=await post('/api/check',{task:feedback.task,code:algorithmSolutions[feedback.task]});assert.equal(passed.data.result.ok,true);
  assert.equal((await post('/api/task-feedback',feedback)).status,400,'old checked code cannot describe the new attempt');
  const accepted=await post('/api/task-feedback',{...feedback,code:algorithmSolutions[feedback.task],difficulty:2,hintSource:'none',hintDetails:'',hardPart:'none'});assert.equal(accepted.status,200);assert.equal(accepted.data.result.already,true);assert.equal(accepted.data.state.taskFeedback[feedback.task].length,1);assert.deepEqual(accepted.data.result.feedback,record,'new checked code does not replace or request the saved response');
  const skip={task:'algo-max-2',lesson:'algorithms',code:algorithmSolutions['algo-max-2'],skipped:true};
  assert.equal((await post('/api/task-feedback',skip)).status,400,'skip also requires an actual checked attempt');
  await post('/api/check',{task:skip.task,code:skip.code});const beforeSkip=await state(),skipped=await post('/api/task-feedback',skip);
  assert.equal(skipped.status,200);assert.equal(skipped.data.result.feedback.skipped,true);assert.equal(skipped.data.result.feedback.difficulty,undefined);assert.equal(skipped.data.result.feedback.testComparison,undefined);
  const afterSkip=structuredClone(skipped.data.state);delete afterSkip.taskFeedback[skip.task];assert.deepEqual(afterSkip,beforeSkip,'skip cannot change currency or mastery');
  assert.equal((await post('/api/task-feedback',skip)).data.result.already,true);
  const preserve=await post('/api/task-feedback',{task:feedback.task,lesson:feedback.lesson,code:algorithmSolutions[feedback.task],skipped:true});assert.deepEqual(preserve.data.result.feedback,record,'skip cannot replace an existing answer');
  const expected=await state();await new Promise(r=>server.close(r));server=createGuildServer({stateFile:file,reviewProvider:'off'});connection=await start();assert.deepEqual(await state(),expected);assert.equal((await state()).currency,0);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
