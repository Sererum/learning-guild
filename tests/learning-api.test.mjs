import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGuildServer} from '../server.mjs';
import {learningCourseFixture,adaptationFixtureProvider} from './learning-course-fixture.mjs';

async function harness(work){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-learning-api-')),course=learningCourseFixture(),original=JSON.stringify(course);
 const stateFile=path.join(dir,'progress.json'),calls=[];
 const options={course,stateFile,importHistory:false,reviewProvider:'off',learningProvider:'file',learningFixtureProvider:request=>{calls.push(request.stage);return adaptationFixtureProvider(request);}};
 let server,origin,token;
 const start=async()=>{server=createGuildServer(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;const html=await(await fetch(origin)).text();token=html.match(/name="guild-token" content="([^"]+)"/)[1];};
 await start();
 const restart=async()=>{await new Promise(r=>server.close(r));await start();};
 const post=async(route,body)=>{const response=await fetch(origin+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Guild-Token':token},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 const state=async()=>await(await fetch(origin+'/api/state')).json();
 const wait=async id=>{for(let i=0;i<100;i++){const data=await(await fetch(origin+'/api/learning-job?id='+id)).json();if(!['pending','running'].includes(data.result.job.status))return data;await new Promise(r=>setTimeout(r,70));}throw Error('Timed out');};
 try{await work({dir,course,post,state,wait,calls,origin,restart});assert.equal(JSON.stringify(course),original,'shared course data must remain unchanged');}finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
}
test('Explicit submission updates personalization first, publishes usable private lessons and preserves their rewards after restart',()=>harness(async({dir,course,post,state,wait,calls,restart})=>{
 assert.equal((await post('/api/lesson-submit',{lessonId:'source-lesson'})).status,400);
 for(const task of course.tasks)assert.equal((await post('/api/check',{task:task.id,code:'answer = value\nprint(answer)'})).data.result.ok,true);
 assert.equal((await state()).learning.jobs.length,0,'passing tests alone must not submit');
 const sent=await post('/api/lesson-submit',{lessonId:'source-lesson',requestId:'submission-one',feedback:{clarity:'clear',comment:'Хочу конкретный пример с входом и ответом.'}});assert.equal(sent.status,200);
 const pending=await wait(sent.data.result.job.id);assert.equal(pending.result.job.status,'awaiting-consent');assert.deepEqual(calls,['personalize']);assert.equal(pending.lessons.some(lesson=>lesson.adaptive),false,'no new lesson before the learner decides');
 const approved=await post('/api/settings',{area:'generation',action:'confirm-personalization',jobId:pending.result.job.id,acceptedIds:pending.result.job.personalizationProposal.changes.map(change=>change.id)});assert.equal(approved.status,200,JSON.stringify(approved.data));
 const done=await wait(sent.data.result.job.id);assert.equal(done.result.job.status,'ready',JSON.stringify(done.result.job));assert.deepEqual(calls,['personalize','generate','review']);
 assert.equal(done.result.job.branches.length,1);const branch=done.result.job.branches[0];
 assert.equal(branch.pointId,'future-point','the future exam placeholder is reused');
 assert.equal(done.courseMap.points.filter(point=>point.id===branch.pointId).length,1);
 const lesson=done.lessons.find(lesson=>lesson.id===branch.lessonId);assert.ok(lesson);assert.equal(lesson.type,'exam');
 const safe=JSON.stringify(done);for(const privateField of ['"referenceCode"','"independentReferenceCode"','"wrongVariants"','"evidenceIds"','"generate-result"'])assert.equal(safe.includes(privateField),false,privateField);
 assert.equal(fs.existsSync(path.join(dir,'personalization.json')),true);assert.ok(done.learning.personalization.preferences.length>0,'accepted preferences are active');
 const task=lesson.taskIds[0];const solved=await post('/api/check',{task,code:'total = sum(values)\nprint(total)'});assert.equal(solved.status,200,JSON.stringify(solved.data));assert.equal(solved.data.result.ok,true);assert.equal(solved.data.result.reward.gems,640);
 const repeated=await post('/api/check',{task,code:'total = sum(values)\nprint(total)'});assert.equal(repeated.data.state.currency,640);assert.equal(repeated.data.result.reward.already,true);
 await restart();const restored=await state();assert.equal(restored.state.currency,640);assert.ok(restored.lessons.some(item=>item.id===lesson.id));assert.equal(restored.learning.jobs[0].status,'ready');assert.equal(calls.length,3,'restart must not buy a generation');
 const again=await post('/api/lesson-submit',{lessonId:'source-lesson',requestId:'submission-one',feedback:{clarity:'clear',comment:'Хочу конкретный пример с входом и ответом.'}});assert.equal(again.data.result.job.id,sent.data.result.job.id);assert.equal(calls.length,3);
}));
test('A failed submission publishes repair while final exam waits for mastery of the source',()=>harness(async({course,post,state,wait})=>{
 const checked=await post('/api/check',{task:course.tasks[0].id,code:'answer = 0\nprint(answer)'});assert.equal(checked.data.result.ok,false);
 const sent=await post('/api/lesson-submit',{lessonId:'source-lesson',feedback:{difficulty:4,clarity:'unclear',comment:'Не понимаю, как меняется сумма.'}});
 const pending=await wait(sent.data.result.job.id);assert.equal(pending.result.job.status,'awaiting-consent');
 assert.equal((await post('/api/settings',{area:'generation',action:'confirm-personalization',jobId:pending.result.job.id,acceptedIds:[]})).status,200);
 const done=await wait(sent.data.result.job.id);assert.equal(done.result.job.status,'ready',JSON.stringify(done.result.job));assert.deepEqual(done.result.job.branches.map(branch=>branch.kind).sort(),['next','repair']);
 assert.equal(done.state.claims['source-1'],undefined);assert.equal(done.state.currency,0);
 for(const branch of done.result.job.branches){assert.equal(done.presentation.points[branch.pointId].available,branch.kind==='repair');assert.ok(done.courseMap.routes.some(route=>route.to===branch.pointId));}
 const repair=done.result.job.branches.find(branch=>branch.kind==='repair');assert.equal(done.courseMap.points.find(point=>point.id===repair.pointId).kind,'repair');
 assert.equal(done.presentation.currentPointId,repair.pointId);
 const repairLesson=done.lessons.find(lesson=>lesson.id===repair.lessonId);
 for(const task of repairLesson.taskIds){const checked=await post('/api/check',{task,code:'total = sum(values)\nprint(total)'});assert.equal(checked.data.result.ok,true,JSON.stringify(checked.data.result));}
 const afterRepair=await state(),next=done.result.job.branches.find(branch=>branch.kind==='next');
 assert.equal(afterRepair.presentation.points[next.pointId].available,false,'review completion does not certify the original lesson');
 assert.equal(afterRepair.presentation.currentPointId,'source-point');
 for(const task of course.tasks)assert.equal((await post('/api/check',{task:task.id,code:'answer = value\nprint(answer)'})).data.result.ok,true);
 const afterSource=await state();assert.equal(afterSource.presentation.currentPointId,next.pointId);assert.equal(afterSource.presentation.currentLessonId,next.lessonId);assert.equal(afterSource.presentation.points[next.pointId].available,true);
 assert.equal((await state()).lessons.filter(lesson=>lesson.adaptive).length,2);
}));
