import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createLocalCourseStore,courseAvatars} from '../local-courses.mjs';
import {createAccountServer} from '../account-server.mjs';
import {browserOptions} from './browser-runtime.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'guild-metadata-browser-')),store=createLocalCourseStore({root});
store.create({id:'synthetic',title:'Тестовый курс',learnerName:'Ученик',goal:'Подробная цель программы',contentMode:'blank',preferencesMode:'new'});
const server=createAccountServer({root,python:'python3.12',reviewProvider:'off',learningProvider:'off'});let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch(browserOptions());const page=await browser.newPage({viewport:{width:1360,height:960}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/?account=synthetic&settings=course#settings');const form=page.locator('[data-settings-form=course]');await form.waitFor();
 assert.equal(await form.locator('[name=avatar]').count(),courseAvatars.length);assert.equal(await form.locator('[name=title]').inputValue(),'Тестовый курс');
 const title='Очень длинное название курса для проверки компактного меню и сохранения настройки',description='Короткое описание курса, которое видно рядом с названием и хранится отдельно от подробной итоговой цели.';
 await form.locator('[name=title]').fill(title);await form.locator('[name=description]').fill(description);await form.locator('[name=avatar]').nth(2).check();await form.getByRole('button',{name:'Сохранить курс',exact:true}).click();await page.getByText('Настройки курса сохранены',{exact:true}).waitFor();
 assert.equal(await page.title(),title+' · Атлас знаний');assert.equal(await page.locator('.brand strong').textContent(),title);assert.equal(await page.locator('.brand img').getAttribute('src'),courseAvatars[2].url);assert.equal(await page.locator('.sidebar-profile img').getAttribute('src'),courseAvatars[2].url);
 const size=await page.locator('.brand strong').evaluate(element=>({height:element.clientHeight,line:parseFloat(getComputedStyle(element).lineHeight)}));assert.ok(size.height<=size.line*2+1);
 await page.reload();await form.waitFor();assert.equal(await form.locator('[name=description]').inputValue(),description);assert.equal(await form.locator('[name=avatar]:checked').getAttribute('value'),courseAvatars[2].url);
 await page.screenshot({path:path.join(os.tmpdir(),'guild-course-metadata-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(os.tmpdir(),'guild-course-metadata-mobile.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 const saved=await(await fetch(base+'/api/state?account=synthetic')).json();assert.equal(saved.program.finish,'Подробная цель программы');assert.equal(saved.state.currency,0);
 console.log('Course metadata browser checks passed: save, reload, avatar, title clamp, mobile layout, goal and progress preservation.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
