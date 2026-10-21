import {repairSolutions} from './repair-solutions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createGuildServer,runPython} from '../server.mjs';
import {tasks} from '../tasks.mjs';
import {algorithmSolutions} from './algorithm-solutions.mjs';
const python=process.env.GUILD_PYTHON||path.join(os.homedir(),'.local/bin/python3.12');
const solutions={...repairSolutions,...algorithmSolutions,'frequency-practice':'for source in lead_sources:\n    source_counts[source] = source_counts.get(source, 0) + 1\nlead_count = len(lead_sources)\nprint(source_counts, lead_count)','unique-practice':'unique_customers = set(customer_ids)\nlead_count = len(customer_ids)\nunique_customer_count = len(unique_customers)\nprint(unique_customers, lead_count, unique_customer_count)','foundations-exam':"clean_text = raw_message.strip().lower()\ncharacter_count = len(clean_text)\nfirst_character = \"\"\nif character_count > 0:\n    first_character = clean_text[0]\nmarker_index = clean_text.find(marker)\nhas_marker = marker_index != -1\nafter_marker = \"\"\nif has_marker:\n    after_marker = clean_text[marker_index + len(marker):].strip()\nif clean_text == \"\":\n    decision = \"нет текста\"\nelif has_marker:\n    decision = \"передать менеджеру\"\nelse:\n    decision = \"обычная заявка\"\nprint(\"Текст:\", clean_text)\nprint(\"Символов:\", character_count, \"Первый:\", first_character)\nprint(\"Индекс:\", marker_index, \"Найдено:\", has_marker)\nprint(\"После фрагмента:\", after_marker)\nprint(\"Решение:\", decision)",lesson:'flower_price = prices.get(flower, "нет в каталоге")\nprint(flower_price)',repair:'while checked_reviews < reviews_goal:\n    checked_reviews += 1\n    actions += 1\nprint(checked_reviews, actions)',daily:'clean_name = raw_name.strip().lower()\nprint(clean_name)',exam:'for source in lead_sources:\n    source_counts[source] = source_counts.get(source, 0) + 1\nunique_customers = set(customer_ids)\nlead_count = len(lead_sources)\nunique_customer_count = len(unique_customers)\nprint(source_counts, unique_customers, lead_count, unique_customer_count)'};
test('Настоящий Python проверяет все поручения и контрастные данные',async()=>{
 for(const task of tasks.filter(t=>!t.id.startsWith('algo-'))){const result=await runPython(task,solutions[task.id],python);assert.equal(result.ok,true,task.id+': '+JSON.stringify(result));assert.equal(result.tests.length,task.tests.length);}
});
test('Исходная ошибка <= обнаруживается; правильный основной результат недостаточен',async()=>{
 const result=await runPython(tasks[1],tasks[1].starter,python);assert.equal(result.ok,false);assert.equal(result.tests.find(x=>x.label==='Ровно цель').ok,false);
});
test('Нулевая цена отличается от отсутствующего ключа',async()=>{
 const result=await runPython(tasks[0],'flower_price = prices.get(flower) or "нет в каталоге"\nprint(flower_price)',python);assert.equal(result.ok,false);assert.equal(result.tests[1].ok,false);
});
test('Импорты, служебные атрибуты и бесконечный цикл не проходят',async()=>{
 for(const code of ['import os','x = (1).__class__'])assert.equal((await runPython(tasks[0],code,python)).ok,false);
 const result=await runPython(tasks[0],'while True:\n    pass',python);assert.equal(result.ok,false);assert.match(result.error,/остановлена/);
});
test('Сервер сохраняет награды, блокирует чужой Origin и повторную выдачу',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-test-'));const file=path.join(dir,'progress.json');const server=createGuildServer({stateFile:file,python,importHistory:false});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 try{
 const html=await(await fetch(origin)).text();const token=html.match(/name="guild-token" content="([^"]+)"/)[1];
 const headers={'Content-Type':'application/json','X-Guild-Token':token,Origin:origin};
 const blocked=await fetch(origin+'/api/action',{method:'POST',headers:{...headers,Origin:'https://example.com'},body:JSON.stringify({type:'wish',banner:'outfit'})});assert.equal(blocked.status,403);
 for(let i=0;i<2;i++){const response=await fetch(origin+'/api/run',{method:'POST',headers,body:JSON.stringify({task:'lesson',code:solutions.lesson})});const payload=await response.json();assert.equal(response.status,200,JSON.stringify(payload));assert.equal(payload.result.ok,true);assert.equal(payload.state.currency,160);}
 const saved=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(saved.currency,160);assert.equal(saved.claims.lesson,true);
 const wrong=await fetch(origin+'/api/run',{method:'POST',headers,body:JSON.stringify({task:'daily',code:'clean_name = "hardcoded"\nprint(clean_name)'})});assert.equal((await wrong.json()).state.currency,160);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
