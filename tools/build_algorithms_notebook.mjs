import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {algorithmWorkbook as lesson} from '../algorithm-workbook.mjs';
import {algorithmTasks} from '../algorithm-lesson.mjs';
import {readAliceTemplate,notebookOutput} from './authoring-paths.mjs';

const template = readAliceTemplate();
const cells = [];
const lines = text => String(text).split(/(?<=\n)/);
const add = (type, id, source, role = undefined) => cells.push({
  cell_type: type, metadata: {id: `a24-${id}`, ...(role ? {alice_role: role} : {})},
  ...(type === 'code' ? {execution_count: null, outputs: []} : {}), source: lines(source),
});
const md = (id, source) => add('markdown', id, source);
const code = (id, source, role = 'example') => add('code', id, source, role);
const prose = text => text.split(/(`[^`]*`)/g).map((part, i) => i % 2 ? part : part.replace(/\b[A-Za-z_]\w*\b/g, word => '`' + word + '`')).join('');
const table = (headers, rows) => [headers, headers.map(() => '---'), ...rows]
  .map(row => '| ' + row.map(cell => String(cell).replaceAll('|', '\\|')).join(' | ') + ' |').join('\n');
const py = value => JSON.stringify(value).replace(/\bnull\b/g, 'None').replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False');

// The same prepared example snapshots power the app. No student's answers here.
export function traceHtml(section) {
  const rootId = `alice-lesson-02-04-${section.id}`;
  const scenarios = section.traceScenarios || [{id: 'bridge', name: 'Читаем и записываем', frames: section.example.steps.map(s => ({line: s.line, values: [], active: [], marks: {}, vars: s.variables, expressions: s.expressions, text: s.explanation}))}];
  const payload = JSON.stringify({scenarios, source: section.example.code.split('\n')}).replaceAll('<', '\\u003c');
  const expressionsEnabled=scenarios.some(scenario=>scenario.frames.some(frame=>frame.expressions?.length));
  const expressionCss=expressionsEnabled?"#${rootId} .expression-table{width:100%;table-layout:fixed;border-collapse:collapse;margin:12px 0} #${rootId} .expression-table th,#${rootId} .expression-table td{padding:10px 8px;text-align:left;vertical-align:top;border-bottom:1px solid #c5bda8;overflow-wrap:anywhere} #${rootId} .expression-table th{font-size:14px}\n".replaceAll("${rootId}",rootId):"";
  const variableCode=expressionsEnabled?"(frame.expressions?.length?'<table class=\"expression-table\"><thead><tr><th>Выражение</th><th>Результат</th><th>Что делает</th></tr></thead><tbody>'+frame.expressions.map(row=>'<tr><td><code>'+escape(row.expression)+'</code></td><td><code>'+escape(value(row.result))+'</code></td><td>'+escape(row.effect)+'</td></tr>').join('')+'</tbody></table>':Object.entries(frame.vars||{}).map(([key,item])=>'<div class=\"variable\"><code>'+escape(key)+' = '+escape(value(item))+'</code></div>').join(''))":"Object.entries(frame.vars||{}).map(([key,item])=>'<div class=\"variable\"><code>'+escape(key)+' = '+escape(value(item))+'</code></div>').join('')";
  return `%%html
<div id="${rootId}">
  <section aria-label="Пошаговый разбор примера">
    <label>Сценарий <select aria-label="Сценарий"></select></label>
    <div class="stage" aria-live="polite"></div>
    <div class="controls"><button type="button" data-action="prev">Назад</button><button type="button" data-action="next">Следующий шаг</button><button type="button" data-action="reset">Сначала</button></div>
  </section>
</div>
<style>
#${rootId}{font-family:ui-rounded,system-ui,sans-serif;color:#342f2b;max-width:980px;margin:16px auto}
#${rootId} *{box-sizing:border-box}
#${rootId} section{background:#fff8e7;border:3px solid #342f2b;border-radius:20px;box-shadow:6px 6px 0 #342f2b;padding:20px}
#${rootId} .shelf{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}
#${rootId} .cell{background:#fffdf8;border:2px solid #342f2b;border-radius:10px;min-width:52px;max-width:100%;padding:10px;text-align:center;overflow-wrap:anywhere}
#${rootId} .active{background:#ffe184}
#${rootId} .cell small{display:block;font-size:12px;margin-top:5px}
#${rootId} .variables{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
#${rootId} .variable{background:#bfdff6;border:2px solid #342f2b;border-radius:10px;padding:8px;max-width:100%;overflow-wrap:anywhere}
#${rootId} code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}
#${rootId} .line{background:#fffdf8;border-left:4px solid #ff927d;padding:12px;margin:12px 0}
#${rootId} p{font-size:16px;line-height:1.5}
${expressionCss}#${rootId} .controls{display:flex;flex-wrap:wrap;gap:10px;margin-top:16px}
#${rootId} button,#${rootId} select{font:inherit;color:#342f2b;background:#ffe184;border:2px solid #342f2b;border-radius:10px;min-height:44px;padding:8px 12px;max-width:100%}
#${rootId} button:disabled{opacity:.45;cursor:not-allowed}
#${rootId} button:focus-visible,#${rootId} select:focus-visible{outline:3px solid #4f70ff;outline-offset:3px}
@media(max-width:640px){#${rootId} section{padding:14px}}
</style>
<script>
(()=>{
const root=document.getElementById('${rootId}'); if(!root)return;
const data=${payload};
const select=root.querySelector('select'),stage=root.querySelector('.stage');
const previous=root.querySelector('[data-action="prev"]'),next=root.querySelector('[data-action="next"]'),reset=root.querySelector('[data-action="reset"]');
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const value=text=>JSON.stringify(text).replace(/\\bnull\\b/g,'None').replace(/\\btrue\\b/g,'True').replace(/\\bfalse\\b/g,'False');
let selected=0,index=0;
data.scenarios.forEach((scenario,i)=>{const option=document.createElement('option');option.value=i;option.textContent=scenario.name;select.append(option);});
function render(){
 const scenario=data.scenarios[selected],frame=scenario.frames[index];
 const values=frame.values||[],active=frame.active||[],marks=frame.marks||{};
 const shelf=values.length?'<div class="shelf">'+values.map((item,i)=>'<div class="cell '+(active.includes(i)?'active':'')+'"><code>'+escape(typeof item==='string'?item||'·':item)+'</code><small>индекс '+i+(marks[i]?' · '+escape(marks[i]):'')+'</small></div>').join('')+'</div>':'';
 stage.innerHTML='<p><b>Шаг '+(index+1)+' / '+scenario.frames.length+'</b></p>'+shelf+'<div class="line"><code>'+escape(data.source[frame.line-1]||'')+'</code></div><div class="variables">'+${variableCode}+'</div><p>'+escape(frame.text)+'</p>';
 previous.disabled=index===0;next.disabled=index===scenario.frames.length-1;reset.disabled=index===0;
}
select.addEventListener('change',()=>{selected=Number(select.value);index=0;render();});
previous.addEventListener('click',()=>{if(index>0)index--;render();});
next.addEventListener('click',()=>{if(index<data.scenarios[selected].frames.length-1)index++;render();});
reset.addEventListener('click',()=>{index=0;render();});
render();
})();
</script>`;
}

function teachingCells(blocks) {
  for (const block of blocks) {
    md(block.id, `#### ${block.title}\n\n${block.paragraphs.map(prose).join('\n\n')}\n\n${block.table ? table(block.table.headers, block.table.rows) : ''}\n\n${(block.afterTable || []).map(prose).join('\n\n')}`);
    if (block.example?.steps?.length || block.traceScenarios?.length) code(`${block.id}-interactive`, traceHtml(block), 'interactive-example');
    if (block.example?.code) code(`${block.id}-code`, block.example.code);
  }
}

function taskCells(task, ordinal, section) {
  for (const extra of section?.preTaskExamples || []) {
    if (extra.beforeTaskId !== task.id) continue;
    md(`${task.id}-prelude`, `### Перед задачей: ${extra.title}\n\n${extra.paragraphs.map(prose).join('\n\n')}`);
    if (extra.teachingBlocks?.length) {
      teachingCells(extra.teachingBlocks);
      continue;
    }
    code(`${task.id}-prelude-code`, extra.code);
    md(`${task.id}-prelude-trace`, extra.trace.map(text => '- ' + prose(text)).join('\n'));
  }
  const primary = task.tests[0];
  const difficulty = task.id === lesson.finalTaskId ? 'Мини-проект' : ordinal % 3 === 1 ? 'Простая' : ordinal % 3 === 2 ? 'Средняя' : 'Сложная';
  const resultNames = Object.keys(primary.expected).map(name => '`' + name + '`').join(', ');
  const inputTable = table(['Вход', 'Первый набор'], Object.entries(primary.inputs).map(([name, value]) => ['`' + name + '`', '`' + py(value) + '`']));
  const resultTable = table(['Результат', 'Для первого набора'], Object.entries(primary.expected).map(([name, value]) => ['`' + name + '`', '`' + py(value) + '`']));
  const statement = task.statement?.length ? task.statement.map(p => `#### ${p.title}\n\n${prose(p.text)}${p.table ? '\n\n' + table(p.table.headers, p.table.rows) : ''}`).join('\n\n') : prose(task.description);
  md(`${task.id}-statement`, `### ${task.id === lesson.finalTaskId ? 'Финальный кейс' : 'Задача ' + ordinal}. ${task.name.replace(/^Экзамен: /, '')}\n\n**${difficulty} · около ${task.minutes} минут**\n\n${statement}\n\n**Сохрани:** ${resultNames}.\n\n${inputTable}\n\n${resultTable}\n\n**Что вывести:** все требуемые результаты с понятными подписями; итог должен появиться и при нуле кругов там, где пустой вход разрешён. В мини-проекте нужен полный мини-отчёт по перечисленным в условии частям.\n\n**Проверочные сценарии:** ${task.tests.map(test => test.label).join('; ')}. Перед запуском выбери ещё один отличающийся от первого набор, запиши ожидаемый ответ и проверь фактический. Исходный набор в ячейке можно временно менять для теста.\n\n<details><summary>Подсказки словами</summary>\n\n${task.hints.map((hint, i) => `${i + 1}. ${prose(hint)}`).join('\n')}\n\n</details>`);
  code(`${task.id}-student`, task.starter, 'student');
  md(`${task.id}-self-check`, `**После реального запуска:** заполни коротко: «вход → ожидалось → получилось».\n\n- Обычный набор: …\n- Граничный или нулевой набор: …\n- Сложность 1–5: … Что пришлось понять? Какая подсказка понадобилась?\n\nЕсли тест не сошёлся, сначала назови первый переход, где ожидание расходится с фактом. Не нужно сразу переписывать всё решение.`);
}

md('title', `# Урок ${lesson.title}\n\n**Для:** ученика\n\nСегодня соберём знакомые циклы, условия и строки в три понятных алгоритма. Цель — объяснить один шаг и проверить результат на другом входе, а не выучить код целиком.\n\n${lesson.subtitle.replace('Для: Алиса · ', '')}\n\n| Встреча | Что делаем | Где можно остановиться |\n| --- | --- | --- |\n| 1 · 45–60 мин | Действующий лидер | После задач 1–3 |\n| 2 · 35–45 мин | Движущееся окно в строке | После задач 4–6 |\n| 3 · 45–60 мин | Два указателя | После задач 7–9; мини-проект можно перенести |\n\nВ приложении весь портал — один урок: три учебных мини-блока и финал. За всю обязательную практику — **480 примогемов**; за качество до **10** в каждой обычной задаче и до **20** в финале. Черновики можно улучшать. Работы над ошибками открываются отдельно рядом с прежними темами на карте. В Colab награды автоматически не начисляются.\n\n**Самостоятельность задач:** у каждой ячейки свои входы. Не рассчитывай на результаты соседнего примера; после перезапуска среды задачу должно быть возможно выполнить отдельно.`);

let ordinal = 0;
for (const section of lesson.sections) {
  if (section.teachingBlocks?.length) {
    md(`${section.id}-theory`, `## ${section.title}\n\n${section.paragraphs.map(prose).join('\n\n')}`);
    teachingCells(section.teachingBlocks);
  } else {
  md(`${section.id}-theory`, `## ${section.title}\n\n${section.paragraphs.map(prose).join('\n\n')}\n\n${section.details.map(prose).join('\n\n')}\n\n${section.table ? table(section.table.headers, section.table.rows) : ''}`);
  if (section.roles) md(`${section.id}-roles`, '### Роли перед запуском\n\n' + table(['Переменная', 'Роль', 'Смысл'], section.roles.map(row => ['`' + row[0] + '`', row[1], row[2]])));
  md(`${section.id}-interactive-intro`, '### Посмотрим руками\n\nПереключай шаги в своём темпе. На экране связаны выбранная строка, текущие значения и объяснение перехода. Сначала назови, что изменится на следующем шаге.');
  code(`${section.id}-interactive`, traceHtml(section), 'visualization');
  md(`${section.id}-example-title`, '### Тот же принцип на обычном Python\n\nПример можно запустить отдельно. Здесь другие данные; в задачах ты построишь решение самостоятельно.');
  code(`${section.id}-example`, section.example.code);
  md(`${section.id}-trace`, '### Трассировка\n\n' + table(['Шаг', 'Состояние после шага', 'Почему'], section.example.steps.map(s => [s.label, Object.entries(s.variables).map(([name, value]) => '`' + name + ' = ' + py(value) + '`').join('; '), prose(s.explanation)])) + '\n\n' + section.checks.map(text => '- ' + prose(text)).join('\n'));
  if (section.type === 'bridge') {
    md('bridge-check', '**Небольшая проверка мостика:** своими словами раздели ключ, сохранённое значение и запасное значение. Затем реально выполни два изменения из списка выше. Если пока не складывается, пройди шаги ещё раз: новая тема подождёт.');
  }
  }
  for (const id of section.taskIds) {
    ordinal++;
    taskCells(algorithmTasks.find(task => task.id === id), ordinal, section);
  }
  if (section.pause) md(`${section.id}-pause`, `> **Пауза.** ${section.pause}`);
}

md('pitfalls', '## Ловушки, в которые легко попасть\n\n' + lesson.pitfalls.map(p => `### ${p.title}\n\n${p.problem}\n\n${p.explanation}\n\n**Как проверить:** ${p.fix}`).join('\n\n'));
md('tracebacks', '### Как читать последние строки traceback\n\n```text\nTraceback (most recent call last):\n  File "<cell>", line 2, in <module>\n    print(values[2])\nIndexError: list index out of range\n```\n\nPython дошёл до чтения третьего элемента. Список содержал только два, поэтому выполнение этой ячейки остановилось. Верхняя часть показывает место, последняя строка — тип и причину. Это диагностический пример текста; намеренно падающую ячейку запускать не требуется.\n\n```text\nTraceback (most recent call last):\n  File "<cell>", line 1, in <module>\n    5 > None\nTypeError: \'>\' not supported between instances of \'int\' and \'NoneType\'\n```\n\nСравнение числа с отсутствием не имеет числового смысла. Сначала отдельно разбираем `None`, затем сравниваем числа.');
md('cheatsheet', '## Короткая памятка\n\n' + lesson.cheatsheet.map(item => '- ' + item).join('\n'));
md('final-before', '## Собираем три идеи вместе\n\nФинальный кейс — не новая тема. Выполни часть с рекордом, проверь её; затем подготовь текст и проверь адрес маркера; в конце добавь поиск пары и динамический отчёт. Если внимание закончилось, сохрани эту точку и продолжи позже. Не нужно удерживать все части в голове одновременно.');
taskCells(algorithmTasks.find(task => task.id === lesson.finalTaskId), 10, {preTaskExamples: [lesson.finalPreparation].filter(Boolean)});
md('resources', '## Если хочется другого объяснения\n\n' + lesson.resources.map(resource => `- [${resource.title}](${resource.url}) — ${resource.note}`).join('\n') + '\n\nЧитать всё подряд не нужно: открой только тот приём, который сейчас неясен. Ручной интерактив и обычный Python-пример выше остаются основными объяснениями.');
md('feedback', '## Фидбек после урока\n\n- Где получилось объяснить алгоритм своими словами?\n- Какой граничный ввод оказался неожиданным?\n- Удалось ли реально выполнить два разных ввода в каждой задаче?\n- Что было в комфортных 3/5–4/5, а где не хватило объяснения?\n- Смогла ли ты запустить задачу независимо от соседних ячеек?');

const notebook = {...template, metadata: {...template.metadata, alice: {lesson_id: lesson.id, authoring_source: 'apps/python-guild/algorithm-workbook.mjs', generated_by: 'apps/python-guild/tools/build_algorithms_notebook.mjs'}}, cells};
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = notebookOutput('lesson_02_04_basic_algorithms.ipynb');
  fs.writeFileSync(target, JSON.stringify(notebook, null, 2) + '\n');
  console.log(`Saved ${target} · ${cells.length} cells`);
}

export {notebook};
