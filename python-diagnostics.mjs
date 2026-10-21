import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildPythonLaunch} from './execution-sandbox.mjs';
const script=fileURLToPath(new URL('./python-diagnostics.py',import.meta.url));
export function diagnosePython(code,python){
 if(typeof code!=='string'||code.length>16000)throw Error('Добавь код размером до 16000 символов.');
 return new Promise(resolve=>{
  const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'guild-diagnostics-'));
  let launch;try{launch=buildPythonLaunch({python,script,cwd,mode:'isolated'});}catch{fs.rmSync(cwd,{recursive:true,force:true});resolve({diagnostics:[],unavailable:true});return;}
  const child=spawn(launch.command,launch.args,launch.options);let out='',done=false;
  function stop(){try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL');}catch{}}
  function finish(value){if(done)return;done=true;clearTimeout(timer);fs.rmSync(cwd,{recursive:true,force:true});resolve(value);}
  const timer=setTimeout(()=>{stop();finish({diagnostics:[],unavailable:true});},2500);
  child.on('error',()=>finish({diagnostics:[],unavailable:true}));
  child.stdout.on('data',chunk=>{out+=chunk;if(out.length>32000){stop();finish({diagnostics:[],unavailable:true});}});
  child.stderr.on('data',()=>{});
  child.on('close',()=>{try{const value=JSON.parse(out);finish(Array.isArray(value.diagnostics)?value:{diagnostics:[],unavailable:true});}catch{finish({diagnostics:[],unavailable:true});}});
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({code}));
 });
}
