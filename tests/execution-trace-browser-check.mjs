import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {browserOptions} from './browser-runtime.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const code='values = [-4, -7, -2]\nbest = None\nfor value in values:\n    if best is None or value > best:\n        best = value\nprint(best)';
const variables={},frames=[],occurrences={};
const frame=(line,explanation='',output='')=>frames.push({line,event:'after',occurrence:occurrences[line]=(occurrences[line]||0)+1,variables:structuredClone(variables),output,explanation});
variables.values=[-4,-7,-2];frame(1);variables.best=null;frame(2);
for(const [index,value]of variables.values.entries()){
 variables.value=value;frame(3,`Берём элемент с индексом ${index} из values: value = ${value}.`);
 const update=variables.best===null||value>variables.best;frame(4,'Условие: '+(update?'True':'False'));
 if(update){variables.best=value;frame(5);}
}
frame(3,'В values больше нет элементов: выходим из цикла.');frame(6,'Печатаем итог.','-2\n');
const section={id:'generic-trace',title:'Шаги',paragraphs:[],example:{code,executionTrace:{complete:true,frames}}};
const lesson={id:'generic-lesson',title:'Поиск максимума',taskIds:['generic-task'],sections:[section],cheatsheet:[],pitfalls:[]};
const data={lessons:[lesson],activeLesson:lesson,tasks:[{id:'generic-task',name:'Практика',cases:[]}],state:{currency:120,claims:{},testProofs:{}}};
const browser=await chromium.launch(browserOptions());
try{
 const page=await browser.newPage({viewport:{width:1200,height:950}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('http://guild-trace.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><div id="guild-adventure"></div>'}));
 await page.goto('http://guild-trace.test/#practice');
 await page.addStyleTag({path:new URL('../public/lesson-workbench/style.css',import.meta.url).pathname});
 await page.evaluate(data=>{
  window.traceTestData=data;window.guildRules={normalizeState(){}};
  const store=new Map();window.guildStorage={configure(){},getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)};
  window.guildTransport={load:async()=>data};
 },data);
 for(const file of ['workspace.js','app.js'])await page.addScriptTag({path:new URL('../public/lesson-workbench/'+file,import.meta.url).pathname});
 const trace=page.locator('[data-example-trace="generic-trace"]');await trace.waitFor();
 const next=trace.locator('[data-delta="1"]'),previous=trace.locator('[data-delta="-1"]'),reset=trace.locator('[data-delta="reset"]');
 const stateBefore=await page.evaluate(()=>JSON.stringify(window.traceTestData.state));
 assert.equal(await trace.locator('.wb-trace-code-line').count(),6);
 assert.equal(await trace.locator('[data-variable="best"]').count(),0);
 assert.equal(await previous.isDisabled(),true);
 for(let i=1;i<frames.length;i++){
  await next.click();const expected=frames[i];
  assert.equal(await trace.locator('.wb-trace-code-line.current').getAttribute('data-line'),String(expected.line));
  assert.match(await trace.locator('.trace-position').textContent(),new RegExp('Шаг '+(i+1)+' / '+frames.length));
  if(expected.line===3&&i===2){
   assert.match(await trace.locator('.wb-trace-explanation').textContent(),/индексом 0.*value = -4/);
   assert.match(await trace.locator('[data-variable="value"].changed').textContent(),/-4/);
   assert.equal(await trace.locator('[data-variable="best"].changed').count(),0);
   await page.screenshot({path:'/private/tmp/guild-full-trace-for.png',fullPage:true});
  }
 }
 assert.equal(await next.isDisabled(),true);
 assert.equal(await trace.locator('.wb-trace-output pre').textContent(),'-2\n');
 await previous.click();assert.equal(await trace.locator('.wb-trace-code-line.current').getAttribute('data-line'),'3');
 await reset.click();assert.equal(await trace.locator('[data-variable="best"]').count(),0);
 const current=trace.locator('.wb-trace-code-line.current'),plain=trace.locator('.wb-trace-code-line').nth(1);
 assert.notEqual(await current.evaluate(el=>getComputedStyle(el).backgroundColor),await plain.evaluate(el=>getComputedStyle(el).backgroundColor));
 for(const width of [1200,736,375,320]){
  await page.setViewportSize({width,height:950});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no page overflow at '+width);
  assert.equal(await trace.locator('.wb-trace-code-line').count(),6);
 }
 await page.locator('[data-action="wb-theme"]').click();
 assert.notEqual(await current.evaluate(el=>getComputedStyle(el).backgroundColor),await plain.evaluate(el=>getComputedStyle(el).backgroundColor));
 await page.screenshot({path:'/private/tmp/guild-full-trace-mobile.png',fullPage:true});
 assert.equal(await page.evaluate(()=>JSON.stringify(window.traceTestData.state)),stateBefore);
 assert.deepEqual(errors,[]);
 console.log('Complete code, green current line, all passes, value source, changes, cumulative output, navigation, dark/mobile320 and unchanged progress: OK');
}finally{await browser.close();}
