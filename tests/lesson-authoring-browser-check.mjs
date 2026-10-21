import {browserOptions} from './browser-runtime.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';
import {algorithmWorkbook as lesson} from '../algorithm-workbook.mjs';
import {traceHtml} from '../tools/build_algorithms_notebook.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guild-lesson-authoring-'));
const server = createGuildServer({stateFile: path.join(dir, 'progress.json'), reviewProvider: 'file'});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch(browserOptions());
const snapshot = async () => (await (await fetch(origin + '/api/state')).json()).state;
const pages = lesson.sections.flatMap(s => [s, ...(s.preTaskExamples || [])]).concat(lesson.finalPreparation);
try {
  const before = await snapshot();
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/?lesson=algorithms#lesson');
  const frame = page.frameLocator('iframe');
  let examples = 0, steps = 0;
  for (const theory of pages) {
    const id = theory.beforeTaskId ? 'prep-' + theory.beforeTaskId : theory.id;
    await frame.locator(`[data-workspace-node="${id}"]`).click();
    assert.equal(await frame.locator('.wb-code-panel').count(), 0);
    for (const block of theory.teachingBlocks) {
      const area = frame.locator(`[data-teaching-block="${block.id}"]`);
      await area.waitFor();
      if (block.optional) await area.locator(':scope > summary').click();
      if (block.example?.steps && !block.traceScenarios) {
        for (let i = 1; i < block.example.steps.length; i++) {
          await area.locator('[data-action="wb-step"][data-delta="1"]').click(); steps++;
        }
        assert.equal(await area.locator('[data-action="wb-step"][data-delta="1"]').isDisabled(), true);
      }
      if (block.traceScenarios) {
        for (const [index, scenario] of block.traceScenarios.entries()) {
          await area.locator(`[data-action="nb-trace-scenario"][data-scenario="${index}"]`).click();
          for (let i = 1; i < scenario.frames.length; i++) {
            await area.locator('[data-action="nb-trace-next"]').click(); steps++;
          }
          assert.equal(await area.locator('[data-action="nb-trace-next"]').isDisabled(), true);
        }
      }
      if (block.example?.code) {
        await area.locator('.wb-theory-example > summary').click();
        const response = page.waitForResponse(r => r.url().endsWith('/api/execute'));
        await area.locator('[data-action="wb-example-run"]').click();
        const result = (await (await response).json()).result;
        assert.equal(result.ok, true, block.id + ': ' + JSON.stringify(result));
        await area.locator('.wb-example-output').waitFor();
        assert.ok(await area.locator('.wb-example-output').isVisible()); examples++;
      } else {
        assert.equal(await area.locator('[data-action="wb-example-run"]').count(), 0);
      }
    }
    if (id === 'max' || id === 'prep-algo-pointers-3') {
      await frame.locator('.wb-material').screenshot({path: '/private/tmp/guild-lesson24-' + id + '.png'});
    }
    for (const width of [360, 1440]) {
      await page.setViewportSize({width, height: 1000});
      assert.ok(await frame.locator('.workbench').evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), id + ' overflow at ' + width);
    }
  }
  await frame.locator('[data-workspace-node="algo-substring-1"]').click();
  assert.equal(await frame.locator('.wb-task-part').count(), 7);
  assert.match(await frame.locator('.wb-description').textContent(), /совпадения.*не ищем/);
  await frame.locator('.wb-statement').screenshot({path: '/private/tmp/guild-lesson24-task-contract.png'});
  await frame.locator('[data-workspace-node="reference"]').click();
  assert.equal(await frame.locator('.wb-error-example').count(), 2);
  for (const detail of await frame.locator('.wb-error-example').all()) {
    await detail.locator('summary').click();
    assert.match(await detail.locator('pre').textContent(), /^Traceback/);
  }
  const publicData = await (await fetch(origin + '/api/state')).json();
  for (const taskId of lesson.taskIds) {
    const task = publicData.tasks.find(t => t.id === taskId);
    await frame.locator(`[data-workspace-node="${taskId}"]`).click();
    const tables = task.statement.filter(p => p.table);
    assert.equal(await frame.locator('.wb-task-examples').count(), tables.length, taskId);
    assert.equal(await frame.locator('.wb-task-examples tbody tr').count(), tables.reduce((n, p) => n + p.table.rows.length, 0), taskId);
    for (const width of [360, 1440]) {
      await page.setViewportSize({width, height: 1000});
      assert.ok(await frame.locator('.workbench').evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), taskId + ' example overflow at ' + width);
    }
    if (taskId === 'algo-max-3') await frame.locator('.wb-statement').screenshot({path: '/private/tmp/guild-task-meaning-profit-plan.png'});
  }
  // All lesson notebook interactives must work independently, including zero-iteration scenarios.
  const notebookPage = await browser.newPage({viewport: {width: 320, height: 900}});
  notebookPage.on('pageerror', e => errors.push(e.message));
  for (const block of pages.flatMap(p => p.teachingBlocks).filter(b => b.example?.steps || b.traceScenarios)) {
    await notebookPage.setContent(traceHtml(block).replace(/^%%html\n/, ''));
    const scenarios = block.traceScenarios || [{frames: block.example.steps}];
    for (let index = 0; index < scenarios.length; index++) {
      await notebookPage.locator('select').selectOption(String(index));
      for (let i = 1; i < scenarios[index].frames.length; i++) await notebookPage.getByRole('button', {name: 'Следующий шаг'}).click();
      assert.equal(await notebookPage.getByRole('button', {name: 'Следующий шаг'}).isDisabled(), true);
      assert.ok(await notebookPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), block.id + ' notebook overflow');
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(await snapshot(), before, 'authoring QA must not claim learning or currency');
  console.log(`${pages.length} theory pages, ${examples} runnable examples, ${steps} manual transitions; task contracts, tracebacks, notebook controls and mobile layout passed; progress unchanged.`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dir, {recursive: true, force: true});
}
