import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {runPython} from '../server.mjs';
import starter from '../courses/starter-python/index.mjs';
import alice from '../courses/alice-python/index.mjs';
import {algorithmSolutions} from './algorithm-solutions.mjs';
const python=process.env.GUILD_PYTHON||path.join(os.homedir(),'.local/bin/python3.12');
const task=constraints=>({...starter.tasks[0],constraints});
const manual='total = 0\nfor value in values:\n    total += value\nprint(total)';
test('Partial print constraints accept a correct loop and still require the named report',async()=>{
 assert.equal((await runPython(task({requiredPrintVariables:['total']}),manual,python)).ok,true);
 const noReport=await runPython(task({requiredPrintVariables:['total']}),manual.replace('print(total)','print("done")'),python);assert.equal(noReport.ok,false);assert.match(noReport.tests[0].note,/total/);
});
test('Only explicitly declared loop counts constrain another course',async()=>{
 assert.equal((await runPython(task({forLoops:1}),manual,python)).ok,true);
 const wrong=await runPython(task({forLoops:1}),'total = sum(values)\nprint(total)',python);assert.equal(wrong.ok,false);assert.match(wrong.error,/for: 1/);
});
test('Independent call restrictions reject shortcuts while permitting unrestricted manual work',async()=>{
 assert.equal((await runPython(task({forbiddenCalls:['sum']}),manual,python)).ok,true);
 const wrong=await runPython(task({forbiddenCalls:['sum']}),'total = sum(values)\nprint(total)',python);assert.equal(wrong.ok,false);assert.match(wrong.error,/sum\(\)/);
});
test('Existing full Alice algorithm restrictions still pass reference code and reject forbidden max',async()=>{
 const original=alice.tasks.find(t=>t.id==='algo-max-1');assert.equal((await runPython(original,algorithmSolutions[original.id],python)).ok,true);
 const wrong=await runPython(original,'best_sale = max(sales)\nfor sale in sales:\n    pass\nprint(best_sale)',python);assert.equal(wrong.ok,false);assert.match(wrong.error,/max\(\)/);
});
