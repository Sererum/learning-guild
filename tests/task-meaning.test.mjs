import test from 'node:test';
import assert from 'node:assert/strict';
import {algorithmTaskCopy} from '../algorithm-task-copy.mjs';

// Verify the answers actually shown in the authored examples, not a duplicate dataset.
const codes = text => [...text.matchAll(/`([^`]*)`/g)].map(m => m[1]);
const parse = text => text === 'None' ? null : text === 'True' ? true : text === 'False' ? false : JSON.parse(text);
const rows = id => algorithmTaskCopy[id].filter(p => p.table).flatMap(p => p.table.rows);
const inputPair = text => codes(text).map(parse);
const windows = (text, marker) => Array.from({length: Math.max(0, text.length - marker.length + 1)}, (_, i) => text.slice(i, i + marker.length));
const pairFor = (prices, target) => {
  let left = 0, right = prices.length - 1;
  while (left < right) {
    const total = prices[left] + prices[right];
    if (total === target) return [prices[left], prices[right]];
    if (total < target) left++; else right--;
  }
  return [];
};

test('each task has an everyday goal and concrete answer examples', () => {
  assert.equal(Object.keys(algorithmTaskCopy).length, 10);
  for (const [id, parts] of Object.entries(algorithmTaskCopy)) {
    assert.ok(parts.some(p => p.title === 'Зачем'), id);
    assert.ok(parts.some(p => p.title === 'Что вывести'), id);
    assert.ok(rows(id).length >= 3, id);
  }
});

test('maximum examples distinguish real zero, first post and absent daily-plan result', () => {
  for (const row of rows('algo-max-1')) assert.equal(parse(codes(row[1])[0]), Math.max(...parse(codes(row[0])[0])));
  for (const row of rows('algo-max-2')) {
    const values = parse(codes(row[0])[0]);
    const [best, index] = [...row[1].matchAll(/= (\d+)/g)].map(m => Number(m[1]));
    assert.equal(best, Math.max(...values)); assert.equal(index, values.indexOf(best));
  }
  for (const row of rows('algo-max-3')) {
    const values = parse(codes(row[0])[0]), minimum = parse(codes(row[1])[0]);
    const eligible = values.filter(n => n >= minimum);
    assert.equal(parse(codes(row[3])[0]), eligible.length ? Math.min(...eligible) : null);
  }
});

test('string examples distinguish complete pieces, cleaned-text positions and overlapping matches', () => {
  for (const row of rows('algo-substring-1')) {
    const [text, marker] = inputPair(row[0]), pieces = windows(text, marker);
    assert.equal(Number(row[2].match(/window_count = (\d+)/)[1]), pieces.length);
    assert.equal(JSON.parse(row[2].match(/last_window = ("[^"]*")/)[1]), pieces.at(-1) || '');
  }
  for (const row of rows('algo-substring-2')) {
    const [text, marker] = inputPair(row[0]), clean = text.trim().toLowerCase();
    assert.equal(parse(codes(row[1])[0]), clean);
    assert.equal(parse(codes(row[2])[0]), clean.indexOf(marker));
  }
  for (const row of rows('algo-substring-3')) {
    const [text, marker] = inputPair(row[0]);
    const positions = windows(text, marker).flatMap((piece, i) => piece === marker ? [i] : []);
    assert.deepEqual(parse(codes(row[1])[0]), positions);
    assert.equal(parse(codes(row[2])[0]), positions.length);
  }
});

test('pair examples distinguish opposite positions, mirrored words and two separate products', () => {
  for (const row of rows('algo-pointers-1')) {
    const labels = parse(codes(row[0])[0]), count = Math.floor(labels.length / 2);
    const equal = labels.slice(0, count).filter((label, i) => label === labels.at(-i - 1)).length;
    assert.deepEqual(codes(row[1]).map(parse), [count, equal]);
  }
  for (const row of rows('algo-pointers-2')) {
    const clean = parse(codes(row[0])[0]).trim().toLowerCase();
    assert.equal(parse(codes(row[1])[0]), clean);
    assert.equal(parse(codes(row[2])[0]), [...clean].reverse().join('') === clean);
  }
  for (const row of rows('algo-pointers-3')) {
    const [prices, target] = inputPair(row[0]), pair = pairFor(prices, target);
    assert.equal(parse(codes(row[1])[0]), pair.length === 2);
    assert.deepEqual(parse(codes(row[2])[0]), pair);
  }
});

test('final decision examples require both campaign text and gifts, independently of revenue', () => {
  const decision = algorithmTaskCopy['algo-final'].find(p => p.title === '4. Решение');
  for (const row of decision.table.rows) assert.equal(parse(codes(row[2])[0]), row[0] === 'Да' && row[1] === 'Да' ? 'готово' : 'нужна проверка');
});
