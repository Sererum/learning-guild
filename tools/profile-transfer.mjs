import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {acquireProfileLock,findPython312} from '../local-config.mjs';

export function parseTransferOptions(args){
 const action=args[0];if(!['export','import'].includes(action))throw Error('Использование: export --state-file PATH --output ZIP или import --archive ZIP --destination NEW_FOLDER.');
 const allowed=action==='export'?['state-file','output']:['archive','destination'];const options={};
 for(let i=1;i<args.length;i+=2){const key=args[i]?.replace(/^--/,'');if(!args[i]?.startsWith('--')||!allowed.includes(key)||!args[i+1]||args[i+1].startsWith('--')||options[key])throw Error('Неизвестный, повторный или незаполненный параметр переноса.');options[key]=path.resolve(args[i+1]);}
 if(allowed.some(k=>!options[k]))throw Error('Укажите все обязательные пути переноса.');return{action,...options};
}
export function transferProfile(options,{python=findPython312(process.env.GUILD_PYTHON)}={}){
 let release;
 try{
  if(options.action==='export'){
   const state=options['state-file'];if(!fs.lstatSync(state).isFile()||fs.lstatSync(state).isSymbolicLink())throw Error('Файл состояния должен быть обычным файлом.');
   if(fs.lstatSync(path.dirname(state)).isSymbolicLink())throw Error('Папка профиля не должна быть ссылкой.');
   release=acquireProfileLock(state);
  }
  const keys=options.action==='export'?['state-file','output']:['archive','destination'];
  const result=spawnSync(python,['-I',fileURLToPath(new URL('./profile_transfer.py',import.meta.url)),options.action,...keys.flatMap(k=>['--'+k,options[k]])],{encoding:'utf8',maxBuffer:1024*1024,timeout:120000});
  if(result.error||result.status!==0)throw Error((result.stderr||result.error?.message||'Не удалось перенести профиль.').trim());
  return JSON.parse(result.stdout);
 }finally{release?.();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(transferProfile(parseTransferOptions(process.argv.slice(2))),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
