import {fileURLToPath} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {diagnosePython} from '../python-diagnostics.mjs';import {findPython312} from '../local-config.mjs';import {createGuildServer} from '../server.mjs';import {loadCourse} from '../course-loader.mjs';
const python=findPython312(process.env.GUILD_PYTHON);
async function analyze(code){const result=await diagnosePython(code,python);assert.notEqual(result.unavailable,true);return result.diagnostics;}
test('static diagnostics find the exact unknown name without running source',async()=>{
 const code='for i in range(10):\n    sa\n';const result=await analyze(code);assert.equal(result.length,1);assert.equal(code.slice(result[0].start,result[0].end),'sa');assert.equal(result[0].line,2);
 const marker=path.join(os.tmpdir(),'guild-diagnostic-never-run-'+process.pid);assert.equal(fs.existsSync(marker),false);
 assert.deepEqual(await analyze(`open(${JSON.stringify(marker)}, "w").write("must not execute")\nwhile True:\n    pass\n`),[]);assert.equal(fs.existsSync(marker),false);
});
test('definitions, builtins, imports, loops and lexical scopes do not create false errors',async()=>{
 const examples=[
 'class Box[T]:\n    def typ(self):\n        return T\n',
 'class Box[T](list[T]):\n    def first(self):\n        return self[0]\n',
 'import math as m\nfrom collections import Counter\nvalues = [1]\nfor value in values:\n    print(m.sqrt(value), Counter(values))',
 'limit=3\ndef outer(values):\n    total=0\n    def inner(step):\n        nonlocal total\n        total += step\n        return total + limit\n    return inner(values[0])',
 'class Item:\n    limit=3\n    def value(self, x=1):\n        return self.limit + x + len(__class__.__name__)\n',
 'values=[1,2]\nresult={key: [value for value in values] for key in values if key>0}\nfunc=lambda n: n + 1\n',
 'try:\n    print(1/0)\nexcept ValueError as error:\n    print(error)\n',
 'def fn():\n    global output\n    output = 1\n    return output\n',
 'values=[1]\nresult=[last := value for value in values]\nprint(last)\n',
 'result=(lambda: (x := 1, x))()\n',
 'match {"x": 1}:\n    case {"x": value, **rest}:\n        print(value, rest)\n',
 'from somewhere import *\nprint(dynamic_name)\n',
 'exec("generated = 3")\nprint(generated)\n',
 ];
 for(const code of examples)assert.deepEqual(await analyze(code),[],code);
});
test('names do not leak between comprehension/function/class scopes',async()=>{
 for(const [code,name] of [['result=[value for value in [1]]\nprint(value)','value'],['def fn(arg):\n    local=arg\nprint(local)','local'],['class C:\n    x=1\n    def fn(self):\n        return x','x']]){
  const result=await analyze(code);assert.equal(result.length,1);assert.equal(code.slice(result[0].start,result[0].end),name);
 }
});
test('syntax errors and Unicode positions use actual editor UTF16 offsets',async()=>{
 const syntax=await analyze('for i in range(10)\n    print(i)');assert.equal(syntax[0].kind,'syntax');
 const unicode='строка = "☕️😀"; неизвестно\n';const result=await analyze(unicode);assert.equal(result.length,1);assert.equal(unicode.slice(result[0].start,result[0].end),'неизвестно');
 assert.deepEqual(await analyze('text="sa" # unknown\nprint(text)'),[]);
});
test('diagnostic endpoint requires local session and does not change progress or run code',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-diagnostic-api-')),stateFile=path.join(dir,'progress.json'),course=await loadCourse({courseId:'starter-python',coursesRoot:fileURLToPath(new URL('../templates/',import.meta.url))});
 const server=createGuildServer({course,stateFile,python,reviewEnabled:false});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  const html=await(await fetch(base)).text(),token=html.match(/name="guild-token" content="([^"]+)/)[1],before=fs.existsSync(stateFile)?fs.readFileSync(stateFile,'utf8'):null;
  const call=(headers={})=>fetch(base+'/api/diagnostics',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({code:'sa'})});
  assert.equal((await call()).status,403);const response=await call({Origin:base,'X-Guild-Token':token});assert.equal(response.status,200);assert.equal((await response.json()).diagnostics[0].kind,'undefined-name');
  assert.equal(fs.existsSync(stateFile)?fs.readFileSync(stateFile,'utf8'):null,before);assert.equal(fs.existsSync(path.join(dir,'checks')),false);
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
