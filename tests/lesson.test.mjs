import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {algorithmLesson,algorithmTasks} from '../algorithm-lesson.mjs';
import {algorithmSolutions} from './algorithm-solutions.mjs';
import {initialState,claim,learnedPoints,act,earnedAchievements} from '../engine.mjs';
import {createGuildServer,runPython} from '../server.mjs';
const day='2026-10-16',python=(process.env.GUILD_PYTHON||path.join(os.homedir(),'.local/bin/python3.12'));
test('Полный урок: три микро-блока по три задачи, трассировки, ресурсы и финал',()=>{
 assert.deepEqual(algorithmLesson.sections.map(s=>s.id),['max','substring','pointers']);
 assert.equal(algorithmTasks.length,10);assert.equal(algorithmLesson.finalTaskId,'algo-final');
 for(const section of algorithmLesson.sections){assert.equal(section.taskIds.length,3);assert.ok(section.theory.length>=3);assert.ok(section.example.trace.length>=3);assert.match(section.example.code,/print\(/);for(const id of section.taskIds)assert.ok(algorithmTasks.some(t=>t.id===id));}
 for(const task of algorithmTasks){assert.ok(task.hints.length>=3);assert.ok(task.tests.length>=3);assert.equal(task.reward,0);assert.ok(algorithmSolutions[task.id]);}
 assert.ok(algorithmLesson.pitfalls.length>=2);assert.ok(algorithmLesson.resources.length>=2);
});
test('Все задачи урока проходят настоящую проверку Python на нескольких вводах',async()=>{
 for(const task of algorithmTasks){const result=await runPython(task,algorithmSolutions[task.id],python);assert.equal(result.ok,true,task.id+': '+JSON.stringify(result));assert.equal((await runPython(task,task.starter,python)).ok,false,task.id+' must not contain a solution');}
});
test('Разобранные примеры выполняются и показывают промежуточные состояния',async()=>{
 for(const section of algorithmLesson.sections){const result=await runPython({tests:[{label:section.id,inputs:{},expected:{}}]},section.example.code,python);assert.equal(result.ok,true,JSON.stringify(result));assert.ok(result.tests[0].output.length>20);}
});
test('Проверяется изучаемый приём: готовый max и вложенный перебор не заменяют алгоритм',async()=>{
 const maximum=algorithmTasks.find(t=>t.id==='algo-max-1');
 const shortcut=await runPython(maximum,'best_sale = sales[0]\nfor value in sales:\n    best_sale = max(best_sale, value)\nprint(best_sale)',python);
 assert.equal(shortcut.ok,false);assert.match(shortcut.error,/max/);
 const pair=algorithmTasks.find(t=>t.id==='algo-pointers-3');
 const nested=await runPython(pair,'pair_found = False\npair_prices = []\nfor a in prices:\n    for b in prices:\n        if a + b == target:\n            pair_found = True\n            pair_prices = [a, b]\nprint(pair_found, pair_prices)',python);
 assert.equal(nested.ok,false);assert.match(nested.error,/while/);
});
test('Глава не закрывается просмотром или одним финалом: нужна проверенная практика',()=>{
 const s=initialState();assert.throws(()=>claim(s,algorithmTasks[0].id,day),/dict и set/);
 for(const id of ['lesson','repair','daily','exam'])claim(s,id,day);
 assert.equal(claim(s,'algo-final',day).gems,0);
 for(const task of algorithmTasks.filter(t=>t.id!=='algo-final'))claim(s,task.id,day);
 assert.equal(learnedPoints(s).includes('algorithms'),true);
 assert.equal(s.lessonClaims.algorithms.gems,480);const before=s.currency;claim(s,'algo-final',day);assert.equal(s.currency,before);
 assert.equal(learnedPoints(s).includes('algorithms'),true);assert.equal(earnedAchievements(s).some(a=>a.id==='algorithms'),true);act(s,{type:'teleport',id:'algorithms'},day);
});
test('Предпросмотр проверяет код без награды; примеры не меняют прогресс, ответы не уходят в браузер',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-lesson-'));const file=path.join(dir,'progress.json'),server=createGuildServer({stateFile:file,importHistory:false});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
  const html=await(await fetch(origin)).text(),token=html.match(/name="guild-token" content="([^"]+)"/)[1];
  const headers={'Content-Type':'application/json','X-Guild-Token':token,Origin:origin};
  const run=async(task,code)=>{const response=await fetch(origin+'/api/run',{method:'POST',headers,body:JSON.stringify({task,code})});assert.equal(response.status,200);return response.json();};
  let value=await run(algorithmTasks[0].id,algorithmSolutions[algorithmTasks[0].id]);assert.equal(value.result.ok,true);assert.equal(value.result.reward.preview,true);assert.equal(value.state.currency,0);assert.equal(value.state.claims[algorithmTasks[0].id],undefined);
  value=await run('example-max',algorithmLesson.sections[0].example.code);assert.equal(value.result.ok,true);assert.equal(value.state.currency,0);assert.deepEqual(value.state.claims,{});
  assert.ok(value.lesson.sections.length===3);for(const task of value.tasks){assert.equal(task.tests,undefined);assert.equal(task.solution,undefined);}
  const source=await(await fetch(origin+'/rules.js')).text();assert.equal(source.includes('algorithmSolutions'),false);assert.equal(source.includes('"expected":'),false);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
