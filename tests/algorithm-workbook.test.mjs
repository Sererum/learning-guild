import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {algorithmWorkbook} from '../algorithm-workbook.mjs';
import {algorithmTasks} from '../algorithm-lesson.mjs';
import {notebook, traceHtml} from '../tools/build_algorithms_notebook.mjs';
import {authoringRoot} from '../tools/authoring-paths.mjs';

test('2.4 is a complete three-block lesson without embedded corrective work and ten independent tasks', () => {
  assert.deepEqual(algorithmWorkbook.taskIds, algorithmTasks.map(task => task.id));
  assert.equal(new Set(algorithmWorkbook.taskIds).size, 10);
  assert.equal(algorithmWorkbook.reward, 480);
  assert.ok(algorithmWorkbook.sections.every(s=>s.type==='topic'));
  assert.ok(!algorithmWorkbook.sections.some(s=>s.id==='bridge'));
  const topics = algorithmWorkbook.sections.filter(section => section.type === 'topic');
  assert.deepEqual(topics.map(section => section.id), ['max', 'substring', 'pointers']);
  assert.ok(topics.every(section => section.taskIds.length === 3));
  assert.equal(algorithmWorkbook.finalTaskId, 'algo-final');
  for (const section of algorithmWorkbook.sections) {
    assert.equal(section.paragraphs.length, 2);
    assert.ok(section.example.code.includes('print('));
    assert.ok(section.example.steps.length >= 3);
    assert.ok(section.example.steps.every(frame => frame.line >= 1 && frame.line <= section.example.code.split('\n').length));
  }
});

test('notebook comes from the same source and preserves all starters without solutions', () => {
  const externalRoot=authoringRoot();
  const saved=notebook;
  if(externalRoot){
    const external=JSON.parse(fs.readFileSync(path.join(externalRoot,'notebooks/lesson_02_04_basic_algorithms.ipynb'),'utf8'));
    assert.deepEqual(external,notebook,'Explicit authoring root notebook differs from current lesson data');
  }
  const studentCells = saved.cells.filter(cell => cell.metadata.alice_role === 'student');
  assert.equal(studentCells.length, 10);
  for (const task of algorithmTasks) {
    const cell = studentCells.find(cell => cell.metadata.id === `a24-${task.id}-student`);
    assert.equal(cell.source.join(''), task.starter);
    assert.equal(cell.execution_count, null);
    assert.deepEqual(cell.outputs, []);
  }
  const ids = saved.cells.map(cell => cell.metadata.id);
  assert.equal(ids.length, new Set(ids).size);
  const text = saved.cells.map(cell => cell.source.join('')).join('\n');
  assert.ok(text.includes('**Для:** ученика'));
  assert.ok(text.includes('**Пауза.**'));
  assert.ok(text.includes('Короткая памятка'));
  assert.ok(text.includes('Traceback'));
  assert.doesNotMatch(text, /Алиса\s*\/\s*Алисик|закрепля(?:ет|ешь|ем) ошибки/iu);
});

test('new concepts are taught before the task that needs them', () => {
  const cells = notebook.cells;
  for (const [sectionId, taskId] of [['max', 'algo-max-2'], ['max', 'algo-max-3'], ['pointers', 'algo-pointers-1']]) {
    const section = algorithmWorkbook.sections.find(item => item.id === sectionId);
    assert.ok(section.preTaskExamples.some(example => example.beforeTaskId === taskId));
    const preludeIndex = cells.findIndex(cell => cell.metadata.id === `a24-${taskId}-prelude`);
    const taskIndex = cells.findIndex(cell => cell.metadata.id === `a24-${taskId}-statement`);
    assert.ok(preludeIndex >= 0 && preludeIndex < taskIndex);
  }
  const beforeNone = algorithmWorkbook.sections.find(section => section.id === 'max').preTaskExamples.find(extra => extra.beforeTaskId === 'algo-max-3');
  assert.ok(beforeNone.code.includes(' is None or '));
  assert.ok(beforeNone.trace.some(text => text.includes('не выполняется')));
});

test('interactive examples are manual, scoped, self-contained, and syntactically valid', () => {
  for (const section of algorithmWorkbook.sections) {
    const html = traceHtml(section);
    assert.ok(html.startsWith('%%html\n'));
    assert.ok(html.includes(`id="alice-lesson-02-04-${section.id}"`));
    assert.ok(html.includes('aria-live="polite"'));
    assert.ok(html.includes('Следующий шаг'));
    assert.ok(html.includes('Назад'));
    assert.doesNotMatch(html, /fetch\(|setInterval\(|setTimeout\(|https?:\/\//);
    const script = html.match(/<script>([\s\S]+)<\/script>/)[1];
    assert.doesNotThrow(() => new vm.Script(script));
    const css = html.match(/<style>([\s\S]+)<\/style>/)[1];
    for (const selector of css.matchAll(/(^|\n)([^{}]+)\{/g)) {
      assert.ok(selector[2].trim().startsWith('#alice-lesson-02-04-') || selector[2].trim().startsWith('@media'));
    }
  }
});

test('the whole lesson introduces roles, boundaries, new operations and final tools before independent use', () => {
  const textBefore = taskId => notebook.cells.slice(0, notebook.cells.findIndex(c => c.metadata.id === `a24-${taskId}-statement`)).map(c => c.source.join('')).join('\n');
  for (const section of algorithmWorkbook.sections) {
    assert.ok(section.teachingBlocks.some(b => b.table?.rows.length >= 3), 'visible roles or concrete values in ' + section.id);
    assert.ok(section.teachingBlocks.some(b => b.example?.steps?.length >= 3), 'manual changes in ' + section.id);
  }
  assert.match(textBefore('algo-max-2'), /range\(2\).*0.*1/s);
  assert.match(textBefore('algo-substring-1'), /cocoa/);
  assert.match(textBefore('algo-substring-2'), /break/);
  assert.match(textBefore('algo-substring-3'), /starts\.append\(0\)/);
  assert.match(textBefore('algo-pointers-1'), /просмотрено 2, совпало 1/);
  assert.match(textBefore('algo-pointers-2'), /Флаг/);
  assert.ok(!algorithmWorkbook.sections.find(s => s.id === 'pointers').teachingBlocks.some(b => b.example?.code.includes('target')),
    'first pointer theory teaches motion before the later sum model');
  assert.match(textBefore('algo-pointers-3'), /4 \+ 8 = 12/);
  assert.match(textBefore('algo-final'), /чай и кофе/);
  assert.equal(algorithmWorkbook.errorExamples.length, 2);
  assert.ok(algorithmWorkbook.errorExamples.every(e => e.traceback.startsWith('Traceback')));
  for (const task of algorithmTasks) {
    assert.ok(task.statement.some(p => /Что получить|Рекорд/.test(p.title)), task.id);
    assert.ok(task.statement.some(p => /Что вывести|Решение и отчёт/.test(p.title)), task.id);
  }
});
