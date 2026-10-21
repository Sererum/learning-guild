import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {runPython} from '../server.mjs';
import {structurePractice} from '../structure-practice.mjs';

const task=structurePractice.find(item=>item.id==='frequency-practice');
const python=process.env.GUILD_PYTHON||path.join(os.homedir(),'.local/bin/python3.12');
const prefix='lead_sources = ["telegram", "search", "telegram"]\nsource_counts = {}\n';
const count='for source in lead_sources:\n    source_counts[source] = source_counts.get(source, 0) + 1\nlead_count = len(lead_sources)\n';
const run=(code,options={})=>runPython({...task,...options},code,python);

test('frequency accepts direct, formatted and composed reports without prescribing labels',async()=>{
 for(const report of [
  'print("Сводка:", source_counts, "Всего:", lead_count)',
  'print(f"Источники: {source_counts}; заявок: {lead_count}")',
  'report = f"Источники: {source_counts}; заявок: {lead_count}"\nprint(report)',
  'report = "Источники: " + str(source_counts) + "; заявок: " + str(lead_count)\nprint(report)',
  'print(source_counts)\nprint(lead_count)'
 ]){
  const result=await run(prefix+count+report);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.tests.filter(item=>item.ok).length,4);
 }
});

test('frequency rejects an unrelated print, one missing result and an unexecuted report',async()=>{
 for(const report of ['print("готово")','print(source_counts)','if False:\n    print(source_counts, lead_count)\nprint("готово")']){
  const result=await run(prefix+count+report);
  assert.equal(result.ok,false);
  assert.ok(result.tests.every(item=>!item.ok&&/отчёте/.test(item.note)),JSON.stringify(result));
 }
});

test('frequency tests require an ordinary pass and reject ready-made counting',async()=>{
 for(const code of [
  prefix+'lead_count = len(lead_sources)\nsource_counts = {source: lead_sources.count(source) for source in set(lead_sources)}\nprint(source_counts, lead_count)',
  prefix+'for source in lead_sources:\n    source_counts[source] = lead_sources.count(source)\nlead_count = len(lead_sources)\nprint(source_counts, lead_count)'
 ]){
  const result=await run(code);
  assert.equal(result.ok,false);
  assert.match(result.error,/for|count|сокращ/);
 }
});

test('only literal starter assignments are replaced by test inputs',async()=>{
 const code='lead_sources = ["telegram", "search", "telegram"]\nsource_counts = dict(unexpected=1)\n'+count+'print(source_counts, lead_count)';
 const result=await run(code);
 assert.equal(result.ok,false);
 assert.ok(result.tests.every(item=>item.mismatches.some(m=>m.variable==='source_counts')));
 assert.ok(result.tests.every(item=>item.actualValues.source_counts.unexpected===1));
});

test('Run code permits exploratory snippets without the assignment loop',async()=>{
 const result=await run('sample = {}\nprint(sample.get("чай", 0))',{mode:'execute'});
 assert.equal(result.ok,true);
 assert.equal(result.output,'0\n');
});
