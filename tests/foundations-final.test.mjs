import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {runPython} from '../server.mjs';
import {foundationsFinalTask as task, foundationsFinalLesson as lesson} from '../foundations-final.mjs';

const python = process.env.GUILD_PYTHON || path.join(os.homedir(), '.local/bin/python3.12');
// Teacher code stays in tests; public lesson data contains only the blank starter.
const solution = `clean_text = raw_message.strip().lower()
character_count = len(clean_text)
first_character = ""
if character_count > 0:
    first_character = clean_text[0]
marker_index = clean_text.find(marker)
has_marker = marker_index != -1
after_marker = ""
if has_marker:
    after_marker = clean_text[marker_index + len(marker):].strip()
if clean_text == "":
    decision = "нет текста"
elif has_marker:
    decision = "передать менеджеру"
else:
    decision = "обычная заявка"
print("Текст:", clean_text)
print("Символов:", character_count, "Первый:", first_character)
print("Индекс:", marker_index, "Найдено:", has_marker)
print("После фрагмента:", after_marker)
print("Решение:", decision)`;

test('final has one examination task, 640 total reward and no new loop topic', () => {
  assert.deepEqual(lesson.taskIds, ['foundations-exam']);
  assert.equal(task.reward, 640);
  assert.equal(lesson.reward, 640);
  assert.equal(lesson.qualityCap, 20);
  assert.equal(task.tests.length, 9);
  assert.match(task.starter, /# Напиши свой код здесь:/);
  assert.doesNotMatch(task.starter, /\.find\(|\.strip\(|if |for |while /);
});

test('final accepts a complete string-and-conditions report for all contrastive cases', async () => {
  const result = await runPython(task, task.starter + solution, python);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.tests.filter(item => item.ok).length, task.tests.length);
});

test('final detects missing search, unsafe first index and incorrect fragment length', async () => {
  for (const bad of [
    solution.replace('has_marker = marker_index != -1', 'has_marker = bool(marker_index)'),
    solution.replace('first_character = ""\nif character_count > 0:\n    first_character = clean_text[0]', 'first_character = clean_text[0]'),
    solution.replace('marker_index + len(marker)', 'marker_index + 8'),
  ]) {
    const result = await runPython(task, task.starter + bad, python);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.ok(result.tests.some(item => !item.ok));
  }
});

test('final rejects an unrelated success print instead of the required report', async () => {
  const code = solution.slice(0, solution.indexOf('print("Текст:"')) + 'print("готово")';
  const result = await runPython(task, task.starter + code, python);
  assert.equal(result.ok, false);
  assert.ok(result.tests.every(item => /отчёте/.test(item.note)), JSON.stringify(result));
});
