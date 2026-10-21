import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {runPython} from '../server.mjs';
import {algorithmTasks} from '../algorithm-lesson.mjs';
import {algorithmSolutions} from './algorithm-solutions.mjs';

const python = process.env.GUILD_PYTHON || path.join(os.homedir(), '.local/bin/python3.12');
const fixture = (label, inputs, expected) => ({label, inputs, expected});
async function check(id, cases, code = algorithmSolutions[id]) {
  const task = algorithmTasks.find(item => item.id === id);
  assert.ok(task, `Missing task ${id}`);
  return runPython({...task, tests: cases}, code, python);
}
async function passes(id, cases) {
  const result = await check(id, cases);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.tests.length, cases.length);
}

test('Maximum keeps a real negative candidate, first tied index, and zero distinct from None', async () => {
  await passes('algo-max-1', [
    fixture('Negative singleton', {sales: [-1]}, {best_sale: -1}),
    fixture('Zero is a real value', {sales: [-5, 0, -1]}, {best_sale: 0})
  ]);
  await passes('algo-max-2', [
    fixture('All tied at zero', {views: [0, 0, 0]}, {best_views: 0, best_index: 0}),
    fixture('First peak remains first', {views: [2, 9, 1, 9, 9]}, {best_views: 9, best_index: 1})
  ]);
  await passes('algo-max-3', [
    fixture('Zero qualifies', {profit_changes: [0], min_change: 0}, {best_change: 0}),
    fixture('No implicit zero candidate', {profit_changes: [-8, -2, -7], min_change: -8}, {best_change: -8}),
    fixture('Neither global minimum nor global maximum', {profit_changes: [-8, -2, -7], min_change: -7}, {best_change: -7}),
    fixture('No candidate at positive threshold', {profit_changes: [0, -1], min_change: 1}, {best_change: null}),
    fixture('Empty negative threshold', {profit_changes: [], min_change: -5}, {best_change: null})
  ]);
});

test('Substring handles single-character windows, cleaned index zero, early break and overlaps', async () => {
  await passes('algo-substring-1', [
    fixture('Width one', {text: 'abc', marker: 'x'}, {window_count: 3, last_window: 'c'}),
    fixture('Empty source', {text: '', marker: 'ab'}, {window_count: 0, last_window: ''})
  ]);
  await passes('algo-substring-2', [
    fixture('First of several', {raw_text: '  SALE sale SALE  ', marker: 'sale'}, {clean_text: 'sale sale sale', first_index: 0}),
    fixture('One exact cleaned window', {raw_text: '  X  ', marker: 'x'}, {clean_text: 'x', first_index: 0}),
    fixture('Whitespace-only source', {raw_text: '  ', marker: 'x'}, {clean_text: '', first_index: -1})
  ]);
  await passes('algo-substring-3', [
    fixture('Overlaps in Cyrillic', {text: 'ааааа', marker: 'ааа'}, {positions: [0, 1, 2]}),
    fixture('Every character matches', {text: 'aaa', marker: 'a'}, {positions: [0, 1, 2]}),
    fixture('Empty source', {text: '', marker: 'a'}, {positions: []}),
    fixture('Case-sensitive search', {text: 'AaaA', marker: 'aa'}, {positions: [1]})
  ]);
});

test('Pointers never reuse one element and preserve deterministic first-encounter pair', async () => {
  await passes('algo-pointers-1', [
    fixture('Centre is not a pair', {labels: ['a', 'a', 'a']}, {pairs_checked: 1, matching_pairs: 1}),
    fixture('Two different labels', {labels: ['x', 'y']}, {pairs_checked: 1, matching_pairs: 0})
  ]);
  await passes('algo-pointers-2', [
    fixture('Inner mismatch after matching edges', {raw_code: 'abca'}, {code_text: 'abca', is_palindrome: false}),
    fixture('Internal spaces stay', {raw_code: 'a ba'}, {code_text: 'a ba', is_palindrome: false}),
    fixture('Two equal characters', {raw_code: ' AA '}, {code_text: 'aa', is_palindrome: true})
  ]);
  await passes('algo-pointers-3', [
    fixture('Different zero-price items', {prices: [0, 0], target: 0}, {pair_found: true, pair_prices: [0, 0]}),
    fixture('Single zero cannot be reused', {prices: [0], target: 0}, {pair_found: false, pair_prices: []}),
    fixture('Several valid sums: outer pair first', {prices: [1, 2, 3, 4], target: 5}, {pair_found: true, pair_prices: [1, 4]}),
    fixture('Move right to exhaustion', {prices: [2, 4, 8], target: 1}, {pair_found: false, pair_prices: []}),
    fixture('Move left to exhaustion', {prices: [2, 4, 8], target: 99}, {pair_found: false, pair_prices: []})
  ]);
});

test('Final report combines first tied negative peak, marker at zero, and zero-priced distinct gifts', async () => {
  await passes('algo-final', [
    fixture('Zero-index success', {revenues: [-2, -2, -8], raw_campaign: '  PEONY peony ', marker: 'peony', prices: [0, 0], gift_budget: 0},
      {peak_revenue: -2, peak_index: 0, campaign_name: 'peony peony', marker_index: 0, pair_found: true, pair_prices: [0, 0], decision: 'готово'}),
    fixture('Marker absent despite available pair', {revenues: [1], raw_campaign: ' OTHER ', marker: 'peony', prices: [10, 10], gift_budget: 20},
      {peak_revenue: 1, peak_index: 0, campaign_name: 'other', marker_index: -1, pair_found: true, pair_prices: [10, 10], decision: 'нужна проверка'})
  ]);
});

test('Contrast cases reject plausible wrong answers rather than only accepting fixtures', async () => {
  const noFirst = algorithmSolutions['algo-substring-2'].replace('        break', '        # deliberately keep searching');
  const result = await check('algo-substring-2', [fixture('Repeated match', {raw_text: 'x x', marker: 'x'}, {clean_text: 'x x', first_index: 0})], noFirst);
  assert.equal(result.ok, false);
  assert.equal(result.tests[0].actualValues.first_index, 2);

  const reuseItem = algorithmSolutions['algo-pointers-3'].replace('while left < right:', 'while left <= right:');
  const reused = await check('algo-pointers-3', [fixture('One item is not two', {prices: [5], target: 10}, {pair_found: false, pair_prices: []})], reuseItem);
  assert.equal(reused.ok, false);
  assert.deepEqual(reused.tests[0].actualValues.pair_prices, [5, 5]);
});
