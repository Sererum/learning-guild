import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildPythonLaunch,getExecutionCapabilities} from '../execution-sandbox.mjs';
import {findPython312} from '../local-config.mjs';
import {executeGeneratedPython} from '../adaptation/runtime.mjs';

const python=findPython312(process.env.GUILD_PYTHON);
const capability=getExecutionCapabilities({python});
function isolatedScript(code) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'guild-isolation-test-'));
 const cwd=path.join(root,'work');fs.mkdirSync(cwd);
 const script=path.join(root,'trusted-test.py');fs.writeFileSync(script,code);
 try{const spec=buildPythonLaunch({python,script,cwd});return spawnSync(spec.command,spec.args,{...spec.options,encoding:'utf8',timeout:6000,detached:false});}
 finally{fs.rmSync(root,{recursive:true,force:true});}
}

test('isolated execution never silently falls back to trusted mode',()=>{
 assert.throws(()=>buildPythonLaunch({python,script:import.meta.filename,cwd:os.tmpdir(),mode:'auto'}),/режим/);
 const absent=getExecutionCapabilities({python:'/private/tmp/no-such-guild-python'});
 assert.equal(absent.available,false);
 assert.throws(()=>buildPythonLaunch({python:'/private/tmp/no-such-guild-python',script:import.meta.filename,cwd:os.tmpdir()}),/Защищённый запуск/);
});

test('OS sandbox runs actual Python and preserves educational tracing',{skip:!capability.available},async()=>{
 const result=await executeGeneratedPython({python,code:'values = [2, 3]\ntotal = 0\nfor value in values:\n    total += value\nprint(total)',trace:true});
 assert.equal(result.ok,true,JSON.stringify(result));assert.ok(result.frames.length>=3);
});

test('OS sandbox denies external file reads/writes, sockets and child processes',{skip:!capability.available},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'guild-private-sentinel-'));
 const sentinel=path.join(root,'private.txt'),writeTarget=path.join(root,'outside.txt');fs.writeFileSync(sentinel,'synthetic-private-marker');
 try{
  const result=isolatedScript(`import json, os, socket, subprocess\nresults = {}\nfor name, action in [\n ('read', lambda: open(${JSON.stringify(sentinel)}).read()),\n ('write', lambda: open(${JSON.stringify(writeTarget)}, 'w').write('changed')),\n ('socket', lambda: socket.create_connection(('127.0.0.1', 9), timeout=.2)),\n ('spawn', lambda: subprocess.run(['/bin/echo', 'escape'])),\n ('fork', lambda: os.fork()),\n]:\n try:\n  action()\n  results[name] = 'ALLOWED'\n except PermissionError:\n  results[name] = 'denied'\n except Exception as error:\n  results[name] = type(error).__name__\nwith open('scratch.txt','w') as scratch:\n scratch.write('temporary work is allowed')\nprint(json.dumps(results))\n`);
  assert.equal(result.status,0,result.stderr);
  const denied=JSON.parse(result.stdout);assert.deepEqual(denied,{read:'denied',write:'denied',socket:'denied',spawn:'denied',fork:'denied'});
  assert.equal(fs.readFileSync(sentinel,'utf8'),'synthetic-private-marker');assert.equal(fs.existsSync(writeTarget),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('OS sandbox blocks symlink traversal from writable temporary directory',{skip:!capability.available},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'guild-symlink-sentinel-'));const sentinel=path.join(root,'sentinel.txt');fs.writeFileSync(sentinel,'synthetic-private-marker');
 try{const result=isolatedScript(`import os\nos.symlink(${JSON.stringify(sentinel)}, 'shortcut')\ntry:\n print(open('shortcut').read())\nexcept PermissionError:\n print('denied')\n`);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout.trim(),'denied');}
 finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('OS kernel rejects a fork even when Python audit helpers are bypassed',{skip:!capability.available},()=>{
 const result=isolatedScript("import ctypes, json\nlibc = ctypes.CDLL(None, use_errno=True)\nchild = libc.fork()\nif child == 0:\n    libc._exit(0)\nprint(json.dumps({'child': child, 'errno': ctypes.get_errno()}))\n");
 assert.equal(result.status,0,result.stderr);const observed=JSON.parse(result.stdout);assert.equal(observed.child,-1);assert.ok([1,35].includes(observed.errno),JSON.stringify(observed));
});

test('resource envelope stops an unbounded CPU loop',{skip:!capability.available},()=>{
 const result=isolatedScript('while True:\n    pass\n');assert.notEqual(result.status,0);assert.ok(['SIGKILL','SIGXCPU'].includes(result.signal),JSON.stringify({status:result.status,signal:result.signal,stderr:result.stderr}));
});

test('resident watchdog stops sustained allocations above the configured memory envelope',{skip:!capability.available},()=>{
 const result=isolatedScript('import time\nchunks = []\nwhile True:\n    chunks.append(bytearray(20 * 1024 * 1024))\n    time.sleep(.01)\n');
 assert.equal(result.status,137,JSON.stringify({status:result.status,signal:result.signal,stderr:result.stderr}));
});
