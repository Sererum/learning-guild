import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const window={};
vm.runInNewContext(fs.readFileSync(new URL('../public/lesson-workbench/workspace.js',import.meta.url),'utf8'),{window});
const workspace=window.guildWorkspace;
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const code='values = [-4, -7, -2]\nbest = None\nfor value in values:\n    if best is None or value > best:\n        best = value\nprint(best)';
const frames=[
 {line:1,event:'after',occurrence:1,variables:{values:[-4,-7,-2]},output:''},
 {line:2,event:'after',occurrence:1,variables:{values:[-4,-7,-2],best:null},output:''},
 {line:3,event:'after',occurrence:1,variables:{values:[-4,-7,-2],best:null,value:-4},output:'',explanation:'Берём элемент с индексом 0 из values: value = -4.'},
 {line:5,event:'after',occurrence:1,variables:{values:[-4,-7,-2],best:-4,value:-4},output:''},
 {line:3,event:'after',occurrence:2,variables:{values:[-4,-7,-2],best:-4,value:-7},output:''},
 {line:6,event:'after',occurrence:1,variables:{values:[-4,-7,-2],best:-2,value:-2},output:'-2\n'},
];
function fixture(){
 const section={id:'generic-section',title:'Разбор',paragraphs:[],example:{code,steps:[{line:5,variables:{best:-4},explanation:'Старый снимок'}],executionTrace:{complete:true,frames}},traceScenarios:[{frames:[]}]};
 const lesson={id:'generic-unit',title:'Поиск',taskIds:['generic-task'],sections:[section],cheatsheet:[],pitfalls:[]};
 return {lessons:[lesson],activeLesson:lesson,tasks:[{id:'generic-task',name:'Практика',cases:[]}],state:{currency:123,claims:{},testProofs:{}}};
}
function render(data,step=0){return workspace.render({data,ui:{workspaceNode:'generic-section',exampleResults:{},exampleSteps:{'generic-section':step}},esc,prose:esc,button:(text,action,attrs,disabled)=>`<button data-action="${action}" ${attrs} ${disabled?'disabled':''}>${text}</button>`,cell:()=>'',trace:()=>'<p>Legacy scenario</p>',table:()=>'',value:v=>v===null?'None':JSON.stringify(v),solved:()=>false});}

test('whole program is visible from initialization and variables appear only when created',()=>{
 const data=fixture(),before=JSON.stringify(data),html=render(data);
 assert.match(html,/data-trace-kind="execution"/);
 assert.equal((html.match(/class="wb-trace-code-line /g)||[]).length,6);
 assert.match(html,/data-line="1" aria-current="step"/);
 assert.match(html,/data-line="6"[^]*?print\(best\)/);
 assert.match(html,/data-variable="values" class="changed"/);
 assert.doesNotMatch(html,/data-variable="(?:best|value)"/);
 assert.doesNotMatch(html,/Legacy scenario|Старый снимок/);
 assert.match(html,/Пока ничего не напечатано/);
 assert.equal(JSON.stringify(data),before);
});
test('for shows where value came from and marks only changed variables',()=>{
 const data=fixture(),html=render(data,2);
 assert.match(html,/data-line="3" aria-current="step"/);
 assert.match(html,/Берём элемент с индексом 0 из values: value = -4/);
 assert.match(html,/data-variable="value" class="changed"/);
 assert.match(html,/data-variable="best"><th[^]*?None/);
 assert.doesNotMatch(html,/data-variable="values" class="changed"/);
 const repeated=render(data,4);
 assert.match(repeated,/2-е выполнение этой строки/);
 assert.match(repeated,/data-variable="value" class="changed"/);
 assert.doesNotMatch(repeated,/data-variable="best" class="changed"/);
});
test('last print shows accumulated output and optional terminal frame has no current line',()=>{
 const data=fixture(),html=render(data,5);
 assert.match(html,/data-line="6" aria-current="step"/);
 assert.match(html,/Вывод к этому шагу<\/h4><pre>-2\n<\/pre>/);
 assert.match(html,/data-delta="1" disabled/);
 data.activeLesson.sections[0].example.executionTrace.frames=[...frames,{event:'complete',variables:frames.at(-1).variables,output:'-2\n'}];
 const complete=render(data,6);
 assert.match(complete,/Программа завершена/);
 assert.doesNotMatch(complete,/data-line="\d+" aria-current="step"/);
});
test('legacy snapshots keep whole code and identify incomplete coverage',()=>{
 const data=fixture(),section=data.activeLesson.sections[0];delete section.example.executionTrace;
 const html=render(data);
 assert.match(html,/data-trace-kind="key-steps"/);
 assert.match(html,/Показаны отдельные моменты, а не все выполненные строки/);
 assert.equal((html.match(/class="wb-trace-code-line /g)||[]).length,6);
 assert.match(html,/data-line="5" aria-current="step"/);
 assert.equal(workspace.exampleFrames(section).length,1);
});
test('actual step handler traverses all execution frames, goes back and resets without state changes',async()=>{
 const data=fixture(),before=JSON.stringify(data),listeners={};
 const root={innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners[name]=fn};
 const appWindow={guildWorkspace:workspace,guildRules:{normalizeState(){}},guildStorage:{configure(){},getItem:()=>null},guildTransport:{load:async()=>data},addEventListener(){},scrollY:0};
 vm.runInNewContext(fs.readFileSync(new URL('../public/lesson-workbench/app.js',import.meta.url),'utf8'),{window:appWindow,document:{getElementById:()=>root},location:{search:'',hash:'#practice'},URLSearchParams,requestAnimationFrame:fn=>fn(),clearTimeout(){}});
 await new Promise(resolve=>setImmediate(resolve));
 const click=delta=>listeners.click({target:{closest:()=>({dataset:{action:'wb-step',section:'generic-section',delta}})}});
 for(let i=1;i<frames.length;i++)await click('1');
 assert.match(root.innerHTML,/Шаг 6 \/ 6/);
 assert.match(root.innerHTML,/Вывод к этому шагу<\/h4><pre>-2\n<\/pre>/);
 await click('-1');assert.match(root.innerHTML,/Шаг 5 \/ 6/);
 await click('reset');assert.match(root.innerHTML,/Шаг 1 \/ 6/);
 assert.doesNotMatch(root.innerHTML,/data-variable="best"/);
 assert.equal(JSON.stringify(data),before);
});

test('an interrupted trace cannot be presented as a full execution',()=>{
 const data=fixture();data.activeLesson.sections[0].example.executionTrace.complete=false;
 const html=render(data);
 assert.match(html,/data-trace-kind="key-steps"/);
 assert.doesNotMatch(html,/Полный ход программы/);
 assert.match(html,/Старый снимок/);
});
