import test from 'node:test';
import assert from 'node:assert/strict';
import {saveTaskFeedback} from '../feedback.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createGuildServer} from '../server.mjs';

const task={id:'sample-task',name:'Понятное название'},lesson={id:'sample-lesson'},proof={codeHash:'checked-code'},checked={ok:false,tests:[{label:'Граница',ok:false}],error:null};
const answer={difficulty:4,hardPart:'statement',hardDetails:'Непонятно, что сравнить.',hintSource:'none',hintDetails:''};

test('Skipped feedback can be filled manually and revisions keep history without changing learning rewards',()=>{
 const state={currency:123,claims:{accepted:true},testProofs:{'sample-task':proof}};
 const saved=saveTaskFeedback(state,task,lesson,proof,checked,{skipped:true}).feedback;
 assert.equal(saved.skipped,true);
 assert.equal(saveTaskFeedback(state,task,lesson,proof,checked,answer).already,true,'automatic requests never replace skip');
 const revised=saveTaskFeedback(state,task,lesson,proof,checked,{...answer,edit:true});
 assert.equal(revised.updated,true);assert.equal(revised.feedback.revision,2);assert.equal(revised.feedback.source,'manual');
 assert.equal(revised.feedback.createdAt,saved.savedAt);assert.equal(revised.feedback.codeHash,'checked-code');
 assert.equal(state.taskFeedback['sample-task'].length,1);assert.deepEqual(state.taskFeedbackHistory['sample-task'],[saved]);
 assert.equal(state.taskFeedback['sample-task'][0].skipped,undefined);
 const newer=saveTaskFeedback(state,task,lesson,{codeHash:'new-check'},{ok:true,tests:[{label:'Граница',ok:true}]},{...answer,difficulty:2,hardPart:'none',edit:true});
 assert.equal(newer.feedback.revision,3);assert.equal(newer.feedback.allPassed,true);assert.equal(newer.feedback.createdAt,saved.savedAt);
 assert.deepEqual(state.taskFeedbackHistory['sample-task'],[saved,revised.feedback]);
 assert.equal(state.currency,123);assert.deepEqual(state.claims,{accepted:true});assert.deepEqual(state.testProofs,{'sample-task':proof});
 assert.equal(saveTaskFeedback(state,task,lesson,proof,checked,answer).already,true,'navigation does not reopen/revise manually saved feedback');
});

test('Invalid edits preserve the current feedback and its audit history',()=>{
 const state={};const record=saveTaskFeedback(state,task,lesson,proof,checked,answer).feedback,before=structuredClone(state);
 for(const invalid of [{difficulty:6},{hardPart:'other',hardDetails:''},{hintSource:'ai',hintDetails:''},{skipped:true}]){
  assert.throws(()=>saveTaskFeedback(state,task,lesson,proof,checked,{...answer,...invalid,edit:true}));assert.deepEqual(state,before);
 }
 assert.deepEqual(state.taskFeedback[task.id][0],record);
});

test('Manual feedback API uses latest verified proof without requiring the current editor draft',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-feedback-edit-api-')),server=createGuildServer({stateFile:path.join(directory,'progress.json'),reviewProvider:'off'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,html=await(await fetch(origin)).text(),headers={Origin:origin,'Content-Type':'application/json','X-Guild-Token':html.match(/name="guild-token" content="([^"]+)"/)[1]};
 const post=async(route,input)=>{const response=await fetch(origin+route,{method:'POST',headers,body:JSON.stringify(input)});return{status:response.status,body:await response.json()};};
 const input={...answer,task:'algo-max-1',lesson:'algorithms',edit:true};
 try{
  assert.equal((await post('/api/task-feedback',input)).status,400,'manual add still needs actual test execution');
  const checked=await post('/api/check',{task:input.task,code:'best_sale = 0\nprint(best_sale)'});assert.equal(checked.body.result.ok,false);
  const skipped=await post('/api/task-feedback',{task:input.task,lesson:input.lesson,code:'best_sale = 0\nprint(best_sale)',skipped:true});assert.equal(skipped.status,200);
  const currency=skipped.body.state.currency,response=await post('/api/task-feedback',input);assert.equal(response.status,200);assert.equal(response.body.result.updated,true);assert.equal(response.body.state.currency,currency);
  assert.equal(response.body.result.feedback.codeHash,checked.body.state.testProofs[input.task].codeHash);
  assert.equal(response.body.result.feedback.allPassed,false);assert.equal(response.body.state.taskFeedbackHistory[input.task][0].skipped,true);
  assert.equal((await post('/api/task-feedback',{...input,edit:false})).status,400,'automatic save still requires exact checked code');
  assert.equal((await post('/api/task-feedback',{...input,lesson:'other-lesson'})).status,400);
  const cacheFile=path.join(directory,'checks',input.task+'.json'),cache=JSON.parse(fs.readFileSync(cacheFile,'utf8'));cache.codeHash='outdated';fs.writeFileSync(cacheFile,JSON.stringify(cache));
  assert.equal((await post('/api/task-feedback',input)).status,400,'mismatched disk cache cannot forge result provenance');
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
});
