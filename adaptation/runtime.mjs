import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildPythonLaunch} from '../execution-sandbox.mjs';
const runner=fileURLToPath(new URL('../runner.py',import.meta.url));
const tracer=fileURLToPath(new URL('./trace.py',import.meta.url));

// Same bounded educational executor as learner code, with optional observations
// made by trusted instrumentation. This does not grant generated code imports.
export function executeGeneratedPython({python,code,tests=[{label:'Пример',inputs:{},expected:{}}],trace=false,inspectStarter=false,constraints={},executionMode='isolated'} ) {
 return new Promise(resolve=>{
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'guild-author-check-'));
  let child,done=false,out='',error='';
  const stop=()=>{try{process.platform==='win32'?child.kill('SIGKILL'):process.kill(-child.pid,'SIGKILL');}catch{}};
  const finish=result=>{if(done)return;done=true;clearTimeout(timer);fs.rmSync(cwd,{recursive:true,force:true});if(trace&&!result.executionTrace)result.executionTrace={complete:false,frames:Array.isArray(result.frames)?result.frames:[]};resolve(result);};
  const timer=setTimeout(()=>{stop();finish({ok:false,error:'Проверка материала остановлена: превышено время выполнения.'});},3500);
  try{const launch=buildPythonLaunch({python,script:(trace||inspectStarter)?tracer:runner,args:(trace||inspectStarter)?[runner,...(inspectStarter?['--inspect-starter']:[])]:[],readPaths:[runner],cwd,mode:executionMode});child=spawn(launch.command,launch.args,launch.options);}catch(e){finish({ok:false,error:e.message});return;}
  child.on('error',e=>finish({ok:false,error:e.message}));
  child.stdout.on('data',chunk=>{out+=chunk.toString();if(out.length>700000){stop();finish({ok:false,error:'Превышен объём проверочного вывода.'});}});
  child.stderr.on('data',chunk=>{if(error.length<3000)error+=chunk.toString();});
  child.on('close',()=>{try{finish(JSON.parse(out));}catch{finish({ok:false,error:error||'Исполнитель не вернул результат.'});}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({code,mode:trace?'execute':undefined,tests,constraints}));
 });
}
