import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {runPython} from '../server.mjs';
import {algorithmTasks} from '../algorithm-lesson.mjs';
import {algorithmSolutions} from './algorithm-solutions.mjs';

const python = process.env.GUILD_PYTHON || path.join(os.homedir(), '.local/bin/python3.12');
const taskFor = id => {
  const task = algorithmTasks.find(item => item.id === id);
  assert.ok(task, `Missing task ${id}`);
  return task;
};

function changedSolution(id, before, after) {
  const original = algorithmSolutions[id];
  assert.ok(original.includes(before), `Mutation target changed in ${id}`);
  const changed = original.replace(before, after);
  assert.notEqual(changed, original);
  return changed;
}

async function rejectsWrongResult(id, code) {
  // Use the learner's actual case set: private contrast-only tests cannot prove
  // that clicking “Проверить на тестах” catches this mistake.
  const task = taskFor(id);
  const result = await runPython(task, code, python);
  assert.equal(result.ok, false, `${id} accepted a plausible wrong solution`);
  assert.equal(result.error, undefined, JSON.stringify(result));
  assert.equal(result.tests?.length, task.tests.length, JSON.stringify(result));
  assert.ok(result.tests.some(item => !item.ok && item.mismatches?.length > 0),
    `A semantic counterexample must reject ${id}, not a syntax or method ban: ${JSON.stringify(result)}`);
}

test('Current public cases accept every complete reference solution', async () => {
  for (const task of algorithmTasks) {
    const result = await runPython(task, algorithmSolutions[task.id], python);
    assert.equal(result.ok, true, `${task.id}: ${JSON.stringify(result)}`);
    assert.equal(result.tests.length, task.tests.length);
  }
});

test('Minimum qualifying change is not the largest qualifying change', async () => {
  await rejectsWrongResult('algo-max-3', `best_change = None
for change in profit_changes:
    if change >= min_change:
        if best_change is None or change > best_change:
            best_change = change
print('Изменение:', best_change)`);
});

test('Minimum qualifying change cannot be replaced by a global minimum and a threshold check', async () => {
  await rejectsWrongResult('algo-max-3', `best_change = None
for change in profit_changes:
    if best_change is None or change < best_change:
        best_change = change
if best_change is not None and best_change < min_change:
    best_change = None
print('Изменение:', best_change)`);
});

test('First qualifying change need not be the minimum qualifying change', async () => {
  await rejectsWrongResult('algo-max-3', `best_change = None
for change in profit_changes:
    if change >= min_change:
        best_change = change
        break
print('Изменение:', best_change)`);
});

test('The threshold itself is not a result unless that value occurs in the input', async () => {
  await rejectsWrongResult('algo-max-3', `best_change = None
for change in profit_changes:
    if change >= min_change:
        best_change = min_change
        break
print('Изменение:', best_change)`);
});

test('A new maximum on the last day cannot be skipped', async () => {
  await rejectsWrongResult('algo-max-1', changedSolution('algo-max-1',
    'for sale in sales:', 'for sale in sales[:-1]:'));
});

test('Matching outside letters do not prove the whole code is a palindrome', async () => {
  await rejectsWrongResult('algo-pointers-2', `code_text = raw_code.strip().lower()
left = 0
right = len(code_text) - 1
is_palindrome = True
while left < right:
    is_palindrome = code_text[left] == code_text[right]
    break
print('Код:', code_text, 'Зеркальный:', is_palindrome)`);
});

test('Case-sensitive matches must not silently normalize the inputs', async () => {
  await rejectsWrongResult('algo-substring-3',
    'text = text.lower()\nmarker = marker.lower()\n' + algorithmSolutions['algo-substring-3']);
});

test('A gift pair alone does not make a campaign ready when its marker is absent', async () => {
  await rejectsWrongResult('algo-final', changedSolution('algo-final',
    'if marker_index != -1 and pair_found:', 'if pair_found:'));
});

test('Stopping at an exact threshold is a valid minimum-search optimization', async () => {
  const task = taskFor('algo-max-3');
  assert.ok(task.tests.some(item => item.expected.best_change === item.inputs.min_change),
    'Keep a public exact-threshold case for the valid early exit');
  const result = await runPython(task, `best_change = None
for change in profit_changes:
    if change >= min_change:
        if best_change is None or change < best_change:
            best_change = change
        if change == min_change:
            break
print('Изменение:', best_change)`, python);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.tests.length, task.tests.length);
});
