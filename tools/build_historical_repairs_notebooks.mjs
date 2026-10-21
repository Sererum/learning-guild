import fs from 'node:fs';
import {readAliceTemplate,notebookOutput,authoringRoot} from './authoring-paths.mjs';
import {historicalRepairSpecs,historicalRepairLessons} from '../historical-repairs.mjs';
import {traceHtml} from './build_algorithms_notebook.mjs';
const template=readAliceTemplate();
authoringRoot({required:true});
const names={clean:'lesson_01_04b_string_results_corrections',index:'lesson_01_04c_safe_slices_corrections',for:'lesson_02_01b_for_steps_corrections',accumulator:'lesson_02_01c_sum_count_corrections',while:'lesson_02_02d_boundaries_report_corrections'};
const prose=text=>text.split(/(`[^`]*`)/g).map((p,i)=>i%2?p:p.replace(/\b[A-Za-z_]\w*\b/g,'`$&`')).join('');
const requested=process.argv.slice(2);if(requested.some(id=>!historicalRepairSpecs.some(s=>s.topic===id)))throw Error('Unknown repair topic');
for(const spec of historicalRepairSpecs.filter(s=>!requested.length||requested.includes(s.topic))){
 const lesson=historicalRepairLessons.find(l=>l.topic===spec.topic),cells=[];
 const add=(type,text,role)=>cells.push({cell_type:type,metadata:{id:lesson.id+'-'+cells.length,...(role?{alice_role:role}:{})},source:text.split(/(?<=\n)/),...(type==='code'?{execution_count:null,outputs:[]}:{})});
 add('markdown','# '+lesson.title+'\n\n**Для:** ученика\n\nОтдельный короткий разбор знакомой темы: примерно25 минут, три небольшие задачи. Можно остановиться после любой задачи, а через20–30 минут сделать паузу. Прежние работы не изменяются. В приложении40 примогемов начислятся один раз после всех трёх проверенных решений; в Colab автоматических наград нет.\n\n## Разбираем сложное место\n\n'+spec.paragraphs.map(prose).join('\n\n'));
 const section=lesson.sections[0],trace={...section,traceScenarios:[{id:spec.topic,name:spec.title,frames:spec.steps.map(s=>({line:s.line,values:[],active:[],marks:{},vars:s.variables,expressions:s.expressions,text:s.explanation}))}]};
 add('code',traceHtml(trace).replaceAll('02-04','repair-'+spec.topic),'visualization');
 add('markdown','## Пример: прогноз → шаг → результат\n\nНажми «Следующий шаг» и объясни, какая переменная изменилась. Затем запусти обычный Python-пример.\n\n| Шаг | Состояние | Почему |\n| --- | --- | --- |\n'+spec.steps.map(s=>'| '+s.label+' | `'+(s.expressions?s.expressions.map(row=>row.expression+' → '+JSON.stringify(row.result)).join('; '):JSON.stringify(s.variables))+'` | '+prose(s.explanation)+' |').join('\n'));
 add('code',spec.code,'example');
 for(const [index,t] of spec.tasks.entries()){
  add('markdown','## Задача '+(index+1)+'. '+t.name+'\n\n'+prose(t.description)+'\n\n**Сохрани:** '+Object.keys(t.tests[0].expected).map(k=>'`'+k+'`').join(', ')+'.\n\n**Пример проверки**\n\n| Вход | Ожидаемые результаты |\n| --- | --- |\n'+t.tests.map(c=>'| `'+JSON.stringify(c.inputs)+'` | `'+JSON.stringify(c.expected)+'` |').join('\n')+'\n\n**Подсказка словами:** '+prose(spec.pitfalls[0]));
  add('code',t.starter,'student');
  add('markdown','**После реальной проверки:** запиши по каждому сценарию «ожидалось → получилось». Затем: сложность1–5; где пришлось подумать; какая подсказка помогла (или «без подсказки»).');
 }
 add('markdown','## Ловушки и памятка\n\n'+spec.pitfalls.map(p=>'- '+prose(p)).join('\n')+'\n\n'+lesson.cheatsheet.map(p=>'- '+prose(p)).join('\n')+'\n\n**Критерий завершения:** три задачи работают на всех приведённых данных, включая границу и пустой ввод/ноль действий; ты можешь объяснить роли переменных и один переход состояния. Авторские проверки не считаются твоим прохождением.');
 const notebook={...template,metadata:{...template.metadata,alice:{lesson_id:lesson.id,authoring_source:'apps/python-guild/historical-repairs.mjs'}},cells};
 const target=notebookOutput(names[spec.topic]+'.ipynb');fs.writeFileSync(target,JSON.stringify(notebook,null,2)+'\n');console.log(names[spec.topic]+': '+cells.length+' cells');
}
