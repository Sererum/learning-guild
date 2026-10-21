import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';

const keyPattern=/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/;
export function createBrowserState(directory,scope){
 const file=path.join(directory,'browser-state.json');
 function values(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>200)throw Error('Некорректный набор черновиков браузера.');
  const result=Object.create(null);
  for(const [key,value]of Object.entries(input)){
   if(!keyPattern.test(key)||['__proto__','constructor','prototype'].includes(key)||/token|password|secret|credential|auth/i.test(key))throw Error('Недопустимый ключ черновика.');
   if(typeof value!=='string'||Buffer.byteLength(value)>1024*1024)throw Error('Черновик слишком большой.');
   result[key]=value;
  }
  if(Buffer.byteLength(JSON.stringify(result))>4*1024*1024)throw Error('Набор черновиков слишком большой.');
  return result;
 }
 function snapshot(){
  if(!fs.existsSync(file))return {schemaVersion:1,scope,revision:0,values:{}};
  const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>5*1024*1024)throw Error('Некорректный файл черновиков браузера.');
  const stored=JSON.parse(fs.readFileSync(file,'utf8'));
  if(stored.schemaVersion!==1||stored.scope!==scope||!Number.isSafeInteger(stored.revision)||stored.revision<1)throw Error('Черновики принадлежат другому профилю или имеют неизвестный формат.');
  return {...stored,values:values(stored.values)};
 }
 function save(input){
  if(input.scope!==scope)throw Error('Черновики относятся к другому профилю. Открой нужный профиль перед сохранением.');
  const next=values(input.values),before=snapshot();
  if(isDeepStrictEqual({...before.values},{...next}))return before;
  if(input.revision!==before.revision)throw Error('Черновики изменились в другой вкладке. Перезагрузи страницу перед переносом; текущий код остаётся в браузере.');
  const result={schemaVersion:1,scope,revision:before.revision+1,values:next};
  fs.mkdirSync(directory,{recursive:true});const temporary=file+'.'+process.pid+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(result,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,file);return result;
 }
 return {snapshot,save};
}
