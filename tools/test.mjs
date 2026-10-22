import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {findPython312} from '../local-config.mjs';

// Expand the test list ourselves: shell glob expansion differs across systems.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
try{
 const python=findPython312(process.env.GUILD_PYTHON);
 const files=fs.readdirSync(path.join(root,'tests')).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>path.join(root,'tests',name));
 if(!files.length)throw new Error('В tests/ нет файлов *.test.mjs.');
 const result=spawnSync(process.execPath,['--test','--test-concurrency=2',...files],{
  cwd:root,env:{...process.env,GUILD_PYTHON:python},stdio:'inherit',shell:false
 });
 if(result.error)throw result.error;
 if(result.signal){console.error(`Проверка остановлена: ${result.signal}`);process.exitCode=1;}
 else process.exitCode=result.status??1;
}catch(error){console.error(error.message);process.exitCode=1;}
