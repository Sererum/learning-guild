import {browserOptions} from './browser-runtime.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createGuildServer} from '../server.mjs';
import {booleanPrimer} from '../boolean-primer.mjs';
import {traceHtml} from '../tools/build_algorithms_notebook.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guild-boolean-primer-'));
const server = createGuildServer({stateFile: path.join(dir, 'state.json'), reviewProvider: 'file'});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch(browserOptions());
const snapshot = async () => (await (await fetch(origin + '/api/state')).json()).state;
try {
  const before = await snapshot();
  const page = await browser.newPage({viewport: {width: 1500, height: 1050}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/?lesson=algorithms#lesson');
  const frame = page.frameLocator('iframe');
  await frame.locator('[data-workspace-node="prep-algo-max-3"]').click();
  assert.equal(await frame.locator('.wb-code-panel').count(), 0);
  assert.equal(await frame.locator('[data-teaching-block]').count(), 4);
  const expected = [
    ['Первый случай: True', 'Второй случай: True', 'Третий случай: False'],
    ['Значения пока нет: True', 'Ноль — это отсутствие? False', 'Текст — это отсутствие? False'],
    ['Запоминаем первую цену: True', '140 дешевле 160: True', '140 дешевле 100: False'],
    ['Есть элемент, и он положительный: True', 'За концом списка: False', 'Пустой список: False'],
  ];
  for (const [index, block] of booleanPrimer.teachingBlocks.entries()) {
    const area = frame.locator(`[data-teaching-block="${block.id}"]`);
    if (block.optional) {
      assert.equal(await area.getAttribute('open'), null);
      await area.locator(':scope > summary').click();
    }
    if (block.example.steps?.length) {
      for (let step = 0; step < block.example.steps.length; step++) {
        assert.match(await area.locator('.wb-trace').textContent(), new RegExp('Шаг ' + (step + 1) + ' / 3'));
        if (step < block.example.steps.length - 1) await area.locator('[data-action="wb-step"][data-delta="1"]').click();
      }
      await area.locator('[data-action="wb-step"][data-delta="reset"]').click();
      assert.match(await area.locator('.wb-trace').textContent(), /Шаг 1 \/ 3/);
    }
    await area.locator('.wb-theory-example > summary').click();
    const response = page.waitForResponse(r => r.url().endsWith('/api/execute'));
    await area.locator('[data-action="wb-example-run"]').click();
    const result = (await (await response).json()).result;
    assert.equal(result.ok, true, JSON.stringify(result));
    for (const line of expected[index]) assert.ok(result.output.includes(line), line);
    await area.locator('.wb-example-output').waitFor();
    assert.ok(await area.locator('.wb-example-output').isVisible());
  }
  const truthRows = await frame.locator('[data-teaching-block$="-or"] .nb-table').first().locator('tbody tr').allTextContents();
  assert.match(truthRows[0], /True.*True.*True/);
  assert.match(truthRows[1], /False.*True.*False/);
  await page.screenshot({path: '/private/tmp/guild-boolean-primer-desktop.png', fullPage: true});
  for (const width of [1100, 360, 320]) {
    await page.setViewportSize({width, height: 900});
    assert.ok(await frame.locator('.workbench').evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'overflow at ' + width);
  }
  // Notebook uses the same content and manual snapshots without a backend.
  const notebookPage = await browser.newPage({viewport: {width: 360, height: 900}});
  notebookPage.on('pageerror', error => errors.push(error.message));
  for (const block of booleanPrimer.teachingBlocks.filter(b => b.example.steps?.length)) {
    await notebookPage.setContent(traceHtml(block).replace(/^%%html\n/, ''));
    await notebookPage.getByRole('button', {name: 'Следующий шаг'}).click();
    assert.match(await notebookPage.locator('[aria-live="polite"]').textContent(), /Шаг 2 \/ 3/);
    await notebookPage.getByRole('button', {name: 'Следующий шаг'}).click();
    assert.match(await notebookPage.locator('[aria-live="polite"]').textContent(), /Шаг 3 \/ 3/);
    assert.ok(await notebookPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  assert.deepEqual(await snapshot(), before, 'reading and running examples must not change progress');
  assert.deepEqual(errors, []);
  console.log('Boolean primer: four runnable examples, manual steps, optional material, notebook and 320–1500px passed; progress unchanged.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dir, {recursive: true, force: true});
}
