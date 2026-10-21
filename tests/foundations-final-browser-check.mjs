import {browserOptions} from './browser-runtime.mjs';
import {completeTaskFeedback} from './feedback-browser-helper.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-foundations-browser-'));
const server=createGuildServer({stateFile:path.join(dir,'state.json'),reviewProvider:'file'});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch(browserOptions());
// Teacher solution is confined to this temporary QA browser context.
const good=`raw_message = "  Нужна ДОСТАВКА завтра  "
marker = "доставка"

clean_text = raw_message.strip().lower()
character_count = len(clean_text)
first_character = ""
if character_count > 0:
    first_character = clean_text[0]
marker_index = clean_text.find(marker)
has_marker = marker_index != -1
after_marker = ""
if has_marker:
    after_marker = clean_text[marker_index + len(marker):].strip()
if clean_text == "":
    decision = "нет текста"
elif has_marker:
    decision = "передать менеджеру"
else:
    decision = "обычная заявка"
print("Текст:", clean_text)
print("Символов:", character_count, "Первый:", first_character)
print("Индекс:", marker_index, "Найдено:", has_marker)
print("После фрагмента:", after_marker)
print("Решение:", decision)`;
const bad=good.replace('has_marker = marker_index != -1','has_marker = bool(marker_index)');
const snapshot=async()=>(await(await fetch(origin+'/api/state')).json()).state;
const fixture=(id,values)=>{
 const job=JSON.parse(fs.readFileSync(path.join(dir,'reviews',id+'.request.json'),'utf8')),r=job.request;
 const metric={score:values.score||9,comment:'Имена понятны, шаги соответствуют условию.'};
 fs.writeFileSync(path.join(dir,'reviews',id+'.result.json'),JSON.stringify({schemaVersion:2,taskId:r.taskId,codeHash:r.codeHash,rubricVersion:r.rubricVersion,mode:r.mode,
 summary:r.mode==='help'?'Результат поиска превращён в булево значение. Из-за этого начало строки и отсутствие фрагмента трактуются неверно.':'Разбор текста последователен, пустое сообщение обрабатывается, отчёт вычисляется из результатов.',
 criteria:r.mode==='help'?null:{correctness:metric,readability:metric,efficiency:metric},strengths:['Входные данные не меняются, итоговый отчёт сохранён.'],
 improvements:r.mode==='help'?[{message:'Различи найденный адрес и отсутствие.',hint:'Сравни смысл нулевого индекса со специальным значением ненайденного фрагмента.'}]:[],
 nextStep:r.mode==='help'?'Проследи результат условия для фрагмента в начале.':'Можно завершать работу.',question:r.mode==='help'?'Найден ли фрагмент, если его индекс равен нулю?':null}));
};
try{
 const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
 await page.goto(origin+'/#world');await page.locator('[data-world-point="foundation-archon"]').click();
 const before=await snapshot();assert.equal(before.claims['foundations-exam'],undefined);
 await page.locator('[data-world-open]').click();const frame=page.frameLocator('iframe'),field=frame.locator('[data-cell-code="foundations-exam"]');
 await field.waitFor();assert.match(await frame.locator('.wb-brand h1').textContent(),/Финал блока 1/);
 assert.equal(await frame.locator('.wb-outline-practice').count(),1);assert.equal(await frame.locator('.wb-outline-theory').count(),0);
 assert.match(await frame.locator('.nb-cell-reward').textContent(),/0 \/ 20/);
 assert.equal(await frame.locator('[data-action="cell-ai"]').isDisabled(),true);
 // First test run deliberately precedes the raw execution action.
 await field.fill(bad);await frame.locator('[data-action="cell-check"]').click();await frame.locator('.nb-test-tab.failed').first().waitFor();
 assert.equal(await frame.locator('.nb-output').count(),0);assert.equal((await snapshot()).currency,before.currency);
 assert.match(await frame.locator('[data-action="cell-ai"]').textContent(),/помощь/);
 await frame.locator('[data-action="cell-ai"]').click();await frame.locator('[data-ai-answer]').fill('Почему поиск в начале не сработал? Дай мне готовое решение.');

 let response=page.waitForResponse(r=>r.url().endsWith('/api/ai-review'));
 await frame.locator('[data-ai-question-form] button[type="submit"]').click();let request=await(await response).json();fixture(request.result.review.id,{});
 await frame.locator('.nb-ai-review .nb-ai-wait').filter({hasText:'Без оценки'}).waitFor();
 assert.match(await frame.locator('.nb-ai-review').textContent(),/нулев/);assert.equal(await frame.locator('.nb-ai-review pre').count(),0);
 assert.equal((await snapshot()).currency,before.currency);
 await field.fill(good);assert.equal(await frame.locator('[data-action="cell-ai"]').isDisabled(),true);
 await frame.locator('[data-action="cell-execute"]').click();await frame.locator('.nb-output').waitFor();assert.match(await frame.locator('.nb-output').textContent(),/передать менеджеру/);
 await frame.locator('[data-action="cell-check"]').click();await frame.locator('.wb-completed').waitFor();
 assert.equal(await frame.locator('.nb-test-tab.passed').count(),9);
 let paid=await snapshot();assert.equal(paid.currency,before.currency+640);assert.equal(paid.claims['foundations-exam'],true);assert.ok(paid.statues.includes('foundation-archon'));
 assert.equal(paid.books,before.books+4);assert.equal(paid.crystals,before.crystals+2);assert.equal(paid.gold,before.gold+1200);
 for(const [key,count] of Object.entries({ore:6,cloth:6,notes:4,dust:3}))assert.equal(paid.materials[key],before.materials[key]+count);
 assert.ok(paid.inventory['archive-quill']);assert.equal(paid.lessonClaims.algorithms,undefined);assert.equal(paid.visited.includes('algorithms'),false);
 await frame.locator('[data-action="cell-check"]').click();await frame.locator('.wb-completed').waitFor();assert.deepEqual(await snapshot(),paid,'repeat checks pay neither currency nor materials');
 await frame.locator('[data-action="cell-ai"]').click();await frame.locator('[data-ai-answer]').fill('Проверь логику, читаемость и эффективность отчёта.');
 response=page.waitForResponse(r=>r.url().endsWith('/api/ai-review'));
 await frame.locator('[data-ai-question-form] button[type="submit"]').click();request=await(await response).json();fixture(request.result.review.id,{score:9});
 await frame.locator('.nb-ai-review .nb-ai-wait').filter({hasText:'Три оценки качества'}).waitFor();
 paid=await snapshot();assert.equal(paid.qualityClaims['foundations-exam'].gems,18);assert.equal(paid.currency,before.currency+658);
 assert.equal(await frame.locator('.nb-ai-review .nb-table tbody tr').count(),3);assert.match(await frame.locator('.nb-cell-reward').textContent(),/18 \/ 20/);
 await frame.locator('[data-action="cell-ai"]').click();await frame.locator('[data-ai-answer]').fill('Повторная проверка качества: проверь, остались ли существенные улучшения.');
 response=page.waitForResponse(r=>r.url().endsWith('/api/ai-review'));
 await frame.locator('[data-ai-question-form] button[type="submit"]').click();request=await(await response).json();fixture(request.result.review.id,{score:10});
 await frame.locator('.nb-ai-review .nb-ai-wait').filter({hasText:'Три оценки качества'}).waitFor();
 paid=await snapshot();assert.equal(paid.qualityClaims['foundations-exam'].gems,20);assert.equal(paid.currency,before.currency+660);
 assert.match(await frame.locator('.nb-cell-reward').textContent(),/20 \/ 20/);
 await page.screenshot({path:'/private/tmp/guild-foundations-final-desktop.png',fullPage:true});
 await frame.locator('[data-workspace-node="reference"]').click();await completeTaskFeedback(page);assert.equal(await field.count(),0);assert.match(await frame.locator('.wb-material').textContent(),/пуст/);
 await frame.locator('[data-workspace-node="foundations-exam"]').click();await completeTaskFeedback(page);assert.equal(await field.inputValue(),good);
 for(const width of [1024,736,375,320]){
  await page.setViewportSize({width,height:1100});await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'parent width '+width);
  assert.equal(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'workbench width '+width);
 }
 await page.screenshot({path:'/private/tmp/guild-foundations-final-mobile.png',fullPage:true});
 await field.scrollIntoViewIfNeeded();await page.screenshot({path:'/private/tmp/guild-foundations-final-mobile-viewport.png'});
 await page.reload();await field.waitFor();assert.equal(await field.inputValue(),good);
 await page.locator('[data-page="world"]').click();await completeTaskFeedback(page);await page.locator('[data-world-point="foundation-archon"].world-done').waitFor();
 assert.equal(await page.locator('[data-world-point="algorithms"].world-done').count(),0);assert.equal((await snapshot()).currency,paid.currency);
 assert.deepEqual(errors,[]);
 console.log('Foundations final: map → full task → direct failing tests → hint fixture → execution → 9 green tests → 640 once/materials/statue → review 18/20 → top-up to cap20 → drafts/reference/mobile320; algorithms remains incomplete. FILE FIXTURES ONLY.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
