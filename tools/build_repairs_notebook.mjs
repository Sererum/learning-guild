import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {notebookOutput} from './authoring-paths.mjs';
import {repairLessons,repairTasks} from '../repair-lessons.mjs';
import {traceHtml} from './build_algorithms_notebook.mjs';
const cells=[];
const add=(type,source,role)=>cells.push({id:'repair-23-'+cells.length,cell_type:type,metadata:role?{alice_role:role}:{},source:source.split(/(?<=\n)/),...(type==='code'?{execution_count:null,outputs:[]}:{})});
add('markdown','# Работы над ошибками · 2.3: словари и множества\n\n**Для:** ученика\n\nЭто отдельные короткие разборы по знакомым темам, а не начало следующего урока. Выбирай нужный приём на карте рядом с жёлтой темой или в книге «Работы над ошибками». В приложении каждый разбор приносит 40 примогемов один раз после проверки. В Colab автоматических наград нет. Каждая задача запускается отдельно.\n\nСначала предскажи следующий шаг примера, затем сравни его с интерактивной схемой и обычным запуском. Через 20–30 минут сделай паузу.');
for(const lesson of repairLessons.filter(l=>l.evidenceId==='lesson-02-03')){
 const section=lesson.sections[0],task=repairTasks.find(t=>t.id===lesson.taskIds[0]);
 add('markdown','## '+lesson.title+'\n\n'+section.paragraphs.join('\n\n'));
 add('code',traceHtml(section).replaceAll('02-04','02-03a'),'visualization');
 add('code',section.example.code,'example');
 add('markdown','### Самостоятельная практика\n\n'+task.description.replace(/\b(stock|product|added_units|previous_stock|updated_stock|prices|found_price|size_after_read|lead_sources|source_counts|lead_count|customers|unique_customers|unique_customer_count|request_count)\b/g,'`$1`')+'\n\n**Проверь:** '+task.tests.map(t=>t.label).join('; ')+'.\n\n**Подсказки словами:**\n\n'+task.hints.map(h=>'- '+h).join('\n'));
 add('code',task.starter,'student');
 add('markdown','**После запуска:** запиши «вход → ожидалось → получилось» для основного случая и отличающегося от него. Для словаря отдельно сравни чтение и запись; для сводок проверь пустой список.\n\nСложность 1–5: … Что теперь можешь объяснить своими словами? …');
}
add('markdown','## Памятка и неочевидные места\n\n- Ключ — подпись; значение — сохранённые под ней данные.\n- `.get()` читает, но не добавляет ключ. Ноль не означает отсутствие.\n- `NameError` при `print(unique_visitors)` означает: Python не нашёл это имя в текущей задаче. Проверь точные имена созданных результатов.\n- `KeyError` при чтении отсутствующего ключа означает: такой подписи в словаре нет. Вспомни договор о запасном значении.\n- Итоговый отчёт после цикла работает и для пустого входа. Передавай в `print()` переменные, а не заранее посчитанные числа.\n- Один выполненный разбор закрывает своё сложное место. Следующий урок 2.4 изучает новые алгоритмы отдельно.');
const notebook={nbformat:4,nbformat_minor:5,metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'},language_info:{name:'python',version:'3.12'},alice:{lesson_id:'dict-set-corrections',authoring_source:'apps/python-guild/repair-lessons.mjs'}},cells};
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const target=notebookOutput('lesson_02_03a_dict_set_corrections.ipynb');
 fs.writeFileSync(target,JSON.stringify(notebook,null,2)+'\n');
 console.log(`Saved ${target} · ${cells.length} cells`);
}
export {notebook};
