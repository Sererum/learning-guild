import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';
import {learningCourseFixture} from './learning-course-fixture.mjs';
import {browserOptions} from './browser-runtime.mjs';

const require=createRequire(import.meta.url),{chromium}=require('playwright');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-risk-settings-browser-')),course=learningCourseFixture(),at=new Date().toISOString(),old='2020-01-01T00:00:00Z';
const observation=(id,authorId,text,savedAt=at)=>({id,kind:'task',taskId:id,text,savedAt,author:{id:authorId,name:authorId==='learner'?'Тестовый ученик':'Преподаватель',role:authorId==='learner'?'learner':'teacher'}});
fs.writeFileSync(path.join(directory,'personalization.json'),JSON.stringify({schemaVersion:1,version:1,observations:[observation('old-1','learner','Показывать промежуточные шаги.',old),observation('old-2','learner','Нужны пошаговые таблицы.',old),observation('one','learner','Сначала пример.'),observation('two','teacher','Сначала схема.')],rules:[{id:'expired-rule',text:'Показывать промежуточные шаги',status:'active',source:'explicit-feedback',evidenceIds:['old-1','old-2']},{id:'examples-rule',text:'Сначала понятный пример',status:'superseded',supersededBy:'scheme-rule',source:'explicit-feedback',evidenceIds:['one']},{id:'scheme-rule',text:'Сначала краткая схема',status:'active',source:'explicit-feedback',evidenceIds:['two']}],history:[],sharedProposals:[]}));
const server=createGuildServer({course,stateFile:path.join(directory,'progress.json'),sharedDirectory:path.join(directory,'shared'),importHistory:false,reviewProvider:'off',learningProvider:'off'});
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch(browserOptions());const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 const state=async()=>await(await fetch(origin+'/api/settings')).json();
 const save=async action=>{const response=page.waitForResponse(response=>response.url().endsWith('/api/settings')&&response.request().method()==='POST');await action();assert.equal((await response).status(),200);await page.locator('.settings-pending').waitFor({state:'detached'});};
 await page.goto(origin+'/#settings');await page.locator('[data-settings-tab="preferences"]').click();await page.getByRole('heading',{name:'Настройки обучения',exact:true}).waitFor();
 const conflict=page.locator('[data-conflict]');await conflict.waitFor();await conflict.locator('[value="examples-rule"]').check();await save(()=>conflict.getByRole('button',{name:'Сохранить выбор'}).click());await page.locator('[data-conflict]').waitFor({state:'detached'});
 const card=page.locator('[data-preference="expired-rule"]');await card.getByText('Нужно подтвердить',{exact:true}).waitFor();await card.locator('summary').click();await card.locator('blockquote').filter({hasText:'Показывать промежуточные шаги.'}).waitFor();assert.match(await card.textContent(),/Тестовый ученик/);
 await save(()=>card.getByRole('button',{name:'Подтвердить',exact:true}).click());await card.getByText('Применяется',{exact:true}).waitFor();await card.getByRole('button',{name:'Изменить',exact:true}).click();await card.locator('textarea').fill('Показывать вход, операцию и результат');await save(()=>card.getByRole('button',{name:'Сохранить и применять'}).click());await card.getByRole('heading',{name:'Показывать вход, операцию и результат'}).waitFor();
 await save(()=>card.getByRole('button',{name:'Отключить',exact:true}).click());await card.getByText('Отключено',{exact:true}).waitFor();await save(()=>card.getByRole('button',{name:'Включить',exact:true}).click());

 await page.locator('[data-settings-tab="generation"]').click();const limits=page.locator('[data-settings-form="limits"]');await limits.locator('[name="dailyCalls"]').fill('0');await limits.locator('[name="dailyTokens"]').fill('0');await limits.locator('[name="autoResume"]').uncheck();await save(()=>limits.getByRole('button',{name:'Сохранить ограничения'}).click());assert.equal((await state()).settings.generation.settings.dailyCalls,0);assert.match(await limits.textContent(),/Значение 0 приостанавливает/);
 await page.locator('[data-settings-tab="shared"]').click();await page.getByText('Предложений пока нет.',{exact:false}).waitFor();assert.match(await page.locator('.settings-body').textContent(),/не переносятся в общий стандарт автоматически/);
 await page.locator('[data-settings-tab="privacy"]').click();await page.getByRole('heading',{name:'Запуск Python',exact:true}).waitFor();await page.getByRole('button',{name:'Настроить запуск'}).click();const dialog=page.locator('.settings-dialog[open]');await dialog.waitFor();assert.match(await dialog.textContent(),/код может обращаться к файлам/);await dialog.getByRole('button',{name:'Закрыть',exact:true}).click();await dialog.waitFor({state:'detached'});
 await page.reload();await page.locator('[data-settings-tab="generation"]').click();assert.equal(await page.locator('[name="dailyCalls"]').inputValue(),'0');assert.equal((await state()).state.currency,0);assert.deepEqual(errors,[]);await context.close();
 console.log('Risk settings browser: conflict resolution, source explanations, overdue rule confirmation, edit/disable/confirm, learner-only feedback, zero budget persistence, shared-rule boundary and execution dialog passed using a real isolated temporary profile.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
