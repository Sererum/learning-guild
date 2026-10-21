import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {generationPrompt} from '../adaptation/prompts.mjs';

const window={};
vm.runInNewContext(fs.readFileSync(new URL('../public/lesson-workbench/workspace.js',import.meta.url),'utf8'),{window});
const workspace=window.guildWorkspace;
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const text=html=>html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
function fixture(type='lesson'){
 const taskIds=['stable-first','stable-second','stable-final'];
 const lesson={id:'unrelated-course-unit',title:'Поиск ответа',type,taskIds,finalTaskId:taskIds.at(-1),reward:480,sections:[{id:'stable-section',title:'Теория · Мини-блок 1. Последовательный максимум → задачи n24-1, n24-2; затем мини-проект',taskIds:taskIds.slice(0,2),paragraphs:[],preTaskExamples:[{beforeTaskId:taskIds[1],title:'r23-2 · Отдельный приём',paragraphs:[]}]}],cheatsheet:[],pitfalls:[]};
 const tasks=taskIds.map((id,index)=>({id,name:['n24-1 · Максимум после измерения','r23-2 · Строгий рекорд','n24-final · Экзамен: Отчёт о записи'][index],description:'Условие',cases:[]}));
 return {lessons:[lesson],activeLesson:lesson,tasks,state:{currency:123,claims:{'stable-first':true},testProofs:{}}};
}
function render(data,node){
 return workspace.render({data,ui:{workspaceNode:node,exampleResults:{}},esc,prose:esc,button:()=>'',cell:id=>'<div data-editor-task="'+id+'"></div>',trace:()=>'',table:()=>'',value:String,solved:id=>!!data.state.claims[id]});
}

test('presentation removes authoring IDs and routing tails while preserving meaningful titles',()=>{
 for(const [source,expected,options]of [
  ['n24-1 · Максимум','Максимум',{practice:true}],
  ['r23-3: Отчёт','Отчёт',{practice:true}],
  ['x82-4 — Совсем другой курс','Совсем другой курс',{practice:true}],
  ['stable-final · Мини-проект: Итог','Итог',{id:'stable-final',practice:true}],
  ['Теория · Мини-блок 3. Два указателя → задачи x82-4, x82-5; затем мини-проект','Мини-блок 3. Два указателя',{}],
  ['Мини-блок 1. Поиск; затем мини-проект','Мини-блок 1. Поиск',{}],
  ['Строка → число','Строка → число',{}],
  ['Отчёт за 2024 год','Отчёт за 2024 год',{}],
 ])assert.equal(workspace.displayTitle(source,options),expected);
});

test('outline and content use readable labels, retain canonical IDs and do not mutate task/state data',()=>{
 const data=fixture(),before=JSON.stringify(data);
 for(const node of ['stable-section','stable-first','prep-stable-second','stable-final']){
  const html=render(data,node),visible=text(html);
  assert.doesNotMatch(visible,/n24-|r23-|→ задачи|затем мини-проект|stable-/);
  assert.match(html,/<small>ЗАДАЧА 1<\/small>Максимум после измерения/);
  assert.match(html,/<small>ЗАДАЧА 2<\/small>Строгий рекорд/);
  assert.match(html,/<small>МИНИ-ПРОЕКТ<\/small>Отчёт о записи/);
  assert.match(html,/data-workspace-task="stable-first"/);
  assert.doesNotMatch(html,/aria-label="[^"]*(?:n24-|r23-)/);
 }
 assert.match(render(data,'stable-section'),/<h2 class="wb-block-title">Мини-блок 1\. Последовательный максимум<\/h2>/);
 assert.match(render(data,'stable-first'),/<p class="wb-task-count">Задача 1 \/ 2<\/p>/);
 assert.match(render(data,'stable-final'),/<p class="wb-task-count">Мини-проект<\/p>/);
 assert.equal(workspace.nodes(data).find(node=>node.taskId==='stable-first').section,data.lessons[0].sections[0]);
 assert.equal(JSON.stringify(data),before);
});

test('exam final and reinforcement/repair practice have the right generic roles',()=>{
 const exam=fixture('exam');exam.lessons[0].sections=[];exam.lessons[0].taskIds=['stable-final'];
 const html=render(exam,'stable-final');
 assert.match(html,/<small>ИТОГОВАЯ ЗАДАЧА<\/small>Отчёт о записи/);
 assert.match(html,/<p class="wb-task-count">Итоговая задача<\/p>/);
 assert.doesNotMatch(text(html),/Мини-проект|n24-/);
 for(const type of ['repair','lesson']){
  const data=fixture(type);delete data.lessons[0].finalTaskId;data.lessons[0].adaptiveBranch='reinforcement';
  assert.match(render(data,'stable-final'),/<small>ЗАДАЧА 3<\/small>Отчёт о записи/);
 }
});

test('the actual application renders clean names throughout the full editor cell',async()=>{
 const data=fixture(),source=fs.readFileSync(new URL('../public/lesson-workbench/app.js',import.meta.url),'utf8');
 for(const task of data.tasks)Object.assign(task,{starter:'values = [1]\n\n# Напиши свой код здесь:',scenarios:['Один элемент'],cases:[{label:'Один элемент',inputs:{values:[1]},expected:{total:1}}],hints:[]});
 const before=JSON.stringify(data);
 for(const task of data.tasks){
  const root={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},saved=JSON.stringify({lesson:data.lessons[0].id,node:task.id,task:task.id});
  const appWindow={guildWorkspace:workspace,guildRules:{normalizeState(){}},guildStorage:{configure(){},getItem:key=>key==='workspace-v1'?saved:null},guildTransport:{load:async()=>data},addEventListener(){},scrollY:0};
  vm.runInNewContext(source,{window:appWindow,document:{getElementById:()=>root},location:{search:'',hash:'#practice'},URLSearchParams,requestAnimationFrame:fn=>fn(),clearTimeout(){}});
  await new Promise(resolve=>setImmediate(resolve));
  const html=root.innerHTML,clean=workspace.displayTitle(task.name,{id:task.id,practice:true}),cell=html.match(/<section class="nb-code-cell[^]*?<\/section>/)?.[0];
  assert.ok(cell,'the real notebookCell must be included by app.js');
  assert.match(cell,new RegExp('<h3>'+clean+'<\\/h3>'));
  assert.match(cell,new RegExp('Python · '+clean+'<\\/label>'));
  for(const label of [clean,'Код: '+clean,'Тесты: '+clean])assert.ok(cell.includes('aria-label="'+label+'"'));
  assert.doesNotMatch(text(cell),/n24-|r23-/);
  assert.doesNotMatch(cell,/aria-label="[^"]*(?:n24-|r23-)/);
  assert.ok(cell.includes('data-cell="'+task.id+'"'));
  assert.ok(cell.includes('data-cell-code="'+task.id+'"'));
  assert.ok(cell.includes('data-test-task="'+task.id+'"'));
  assert.ok(cell.includes(task.starter));
  assert.match(cell,/<p class="nb-task-description">Условие<\/p>/);
 }
 assert.equal(JSON.stringify(data),before);
});

test('generation prompt specifies exact section sizes and keeps technical IDs out of names',()=>{
 const prompt=generationPrompt({job:{},course:{},personalization:{rules:[]},decision:{},nextTopic:{},standard:''});
 assert.match(prompt,/ordinary lesson — ровно 3 sections/);
 assert.match(prompt,/ровно по 3 самостоятельные задачи в каждом/);
 assert.match(prompt,/финальный мини-проект вне sections/);
 assert.match(prompt,/reinforcement — ровно 1 или 2 sections и ровно по 3 задачи в каждом: только 3 или 6 tasks/);
 assert.match(prompt,/Не включай внутренние ID, технические метки/);
 assert.match(prompt,/не дублируй их в name/);
});
