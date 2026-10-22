import {fileURLToPath} from 'node:url';
import {browserOptions} from './browser-runtime.mjs';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';import {loadCourse} from '../course-loader.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-editor-'));
const course=await loadCourse({courseId:'starter-python',coursesRoot:fileURLToPath(new URL('../templates/',import.meta.url))}),first=course.tasks[0];
course.tasks.push({...first,id:'editor-second',name:'Отдельная задача',starter:'private_other_task_name = 7\n'});course.lessons[0].taskIds.push('editor-second');
const server=createGuildServer({course,stateFile:path.join(dir,'progress.json'),reviewEnabled:false});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch(browserOptions());
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/#lesson');const frame=page.frameLocator('iframe'),field=frame.locator('[data-cell-code]'),popup=frame.locator('.guild-completions');
 await frame.locator('.wb-outline-practice').first().click();await field.waitFor();
 const atEnd=async value=>{await field.fill(value);await field.press('ControlOrMeta+End');};
 const type=async text=>field.pressSequentially(text);
 await atEnd('');await type('pri');await popup.waitFor({state:'visible'});assert.equal(await popup.locator('[aria-selected="true"]').count(),1);
 await field.press('Enter');assert.equal(await field.inputValue(),'pri\n','unselected autocomplete never steals Enter');
 await atEnd('');await type('pri');await field.press('Tab');assert.equal(await field.inputValue(),'print','Tab accepts the first automatic suggestion without arrows');
 await field.press('ControlOrMeta+z');assert.equal(await field.inputValue(),'pri','completion is undoable');
 await atEnd('');await type('pri');await field.press('Escape');assert.equal(await popup.isVisible(),false);await field.press('Tab');assert.equal(await field.inputValue(),'pri    ');
 await atEnd('');await type('pri');await field.press('ArrowDown');await field.press('Enter');assert.equal(await field.inputValue(),'print');
 await atEnd('');await type('pri');await field.press('ArrowUp');assert.equal(await popup.locator('[aria-selected="true"]').count(),1);await field.press('Escape');
 await atEnd('values.');await field.press('Control+Space');assert.match(await popup.textContent(),/append/);await popup.locator('[data-completion-index]').filter({hasText:'append'}).click();assert.equal(await field.inputValue(),'values.append','method names do not insert a call or solution');
 await atEnd('');await type('val');assert.match(await popup.textContent(),/values/);assert.doesNotMatch(await popup.textContent(),/private_other_task_name/);await field.press('Escape');
 await atEnd('own_local_name = 1\nown_');await field.press('Control+Space');assert.match(await popup.textContent(),/own_local_name/);await field.press('Enter');assert.match(await field.inputValue(),/\nown_local_name$/);
 await atEnd('private_');await field.press('Control+Space');assert.equal(await popup.isVisible(),false);
 await frame.locator('[data-workspace-node="editor-second"]').click();await atEnd('');await type('val');assert.equal(await popup.isVisible(),false,'other task starter and draft names never leak');
 await atEnd('other_draft_only = 1');await frame.locator('.wb-outline-practice').first().click();assert.equal(await field.inputValue(),'private_');await atEnd('other_');await field.press('Control+Space');assert.equal(await popup.isVisible(),false);
 for(const text of ['# pri','"pri',"'''pri\npri",'f"{pri']){await atEnd(text);await field.press('Control+Space');assert.equal(await popup.isVisible(),false,'no completion inside string/comment: '+text);}
 const code='price = 12.5\n# print("comment")\nlabel = "hash # inside"\nmessage = """line 1\nline 2"""\nif price > 0:\n    print(label)\n';await atEnd(code);
 assert.match(await frame.locator('.py-comment').textContent(),/^# print/);assert.equal(await frame.locator('.py-number').count(),2);assert.equal(await frame.locator('.py-string').count(),2);assert.equal(await frame.locator('.py-keyword').textContent(),'if');assert.equal(await frame.locator('.guild-code-colors').first().textContent(),code+'\n');
 await atEnd('if "#" in label: # note');await field.press('Enter');assert.match(await field.inputValue(),/\n {4}$/);await field.press('Backspace');assert.match(await field.inputValue(),/\n$/);
 await atEnd('    price');await field.press('Home');await field.press('Delete');assert.equal(await field.inputValue(),'price');
 await atEnd('first\nsecond\nthird');await field.evaluate(el=>el.setSelectionRange(0,13));await field.press('Tab');assert.equal(await field.inputValue(),'    first\n    second\nthird');await field.press('Shift+Tab');assert.equal(await field.inputValue(),'first\nsecond\nthird');
 await atEnd('print("x:")');await field.press('Enter');assert.equal(await field.inputValue(),'print("x:")\n','colon inside strings does not indent');
 await atEnd('');await field.evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));});assert.equal(await field.inputValue(),'');await field.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
 await page.context().grantPermissions(['clipboard-read','clipboard-write']);await atEnd('replace this');await field.selectText();await page.evaluate(()=>navigator.clipboard.writeText('pasted_line = 1\nprint(pasted_line)'));await field.press('ControlOrMeta+v');assert.equal(await field.inputValue(),'pasted_line = 1\nprint(pasted_line)');await field.press('ControlOrMeta+z');assert.equal(await field.inputValue(),'replace this');
 await page.context().setOffline(true);await atEnd('');await type('pri');await field.press('ArrowDown');await field.press('Enter');assert.equal(await field.inputValue(),'print','completion works offline');await page.context().setOffline(false);
 await atEnd('draft_before_reload = 42\nprint(draft_before_reload)');await frame.locator('[data-editor-completion]').uncheck();await page.reload();await field.waitFor();assert.equal(await field.inputValue(),'draft_before_reload = 42\nprint(draft_before_reload)');assert.equal(await frame.locator('[data-editor-completion]').isChecked(),false);await atEnd('pri');await field.press('Control+Space');assert.equal(await popup.isVisible(),false);await frame.locator('[data-editor-completion]').check();
 await atEnd('values = [2, 3]\ntotal = sum(values)\nprint(total)');
 const execution=page.waitForResponse(response=>response.url().endsWith('/api/execute'));await frame.locator('[data-action="cell-execute"]').click();assert.equal((await(await execution).json()).result.ok,true);await frame.locator('.nb-output').waitFor();assert.match(await frame.locator('.nb-output').textContent(),/5/);
 const checked=page.waitForResponse(response=>response.url().endsWith('/api/check'));await frame.locator('[data-action="cell-check"]').click();assert.equal((await(await checked).json()).result.ok,true);await frame.locator('.nb-test-tab.passed').first().waitFor();await frame.locator('[data-test-index="0"]').click();assert.match(await frame.locator('.nb-test-panel').textContent(),/Ожидается.*Получилось/s);
 await atEnd('changed = 1');assert.match(await frame.locator('[data-cell-output-status]').textContent(),/ПРЕДЫДУЩЕЙ/);
 for(const width of [1500,390]){await page.setViewportSize({width,height:1000});await atEnd(code);const metrics=await field.evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,font:getComputedStyle(el).fontSize,width:el.clientWidth,layer:el.previousElementSibling.clientWidth}));assert.equal(metrics.width,metrics.layer);assert.ok(metrics.height>=metrics.scroll-2);if(width===390)assert.equal(metrics.font,'16px');assert.equal(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await field.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(os.tmpdir(),'guild-editor-'+width+'.png'),fullPage:true});}
 await frame.locator('[data-action="wb-theme"]').click();await atEnd('');await type('pri');await field.press('ArrowDown');await popup.waitFor({state:'visible'});await page.screenshot({path:path.join(os.tmpdir(),'guild-editor-completion-dark.png'),fullPage:true});assert.equal(await popup.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(36, 37, 39)');await field.press('Escape');
 await atEnd('# Long pasted code\n'+Array.from({length:80},(_,i)=>'variable_'+i+' = "'+'long value '.repeat(10)+'"').join('\n'));assert.ok(await field.evaluate(el=>el.clientHeight>=el.scrollHeight-2));assert.equal(await frame.locator('.guild-code-colors').first().textContent(),(await field.inputValue())+'\n');
 await atEnd('');await type('pri');await field.press('ArrowDown');await field.press('Shift+ArrowLeft');assert.equal(await popup.isVisible(),false,'selection closes menu');
 assert.deepEqual(errors,[]);console.log('Editor browser checks: lexical colour, explicit completion, methods/current-task scope, undo, Enter/Tab/Escape, indent/delete/multiline, synthetic composition, drafts/reload/opt-out, run/tests, 1500+390 wrapping and growth — OK');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
