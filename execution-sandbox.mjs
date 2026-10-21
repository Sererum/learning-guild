import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const bootstrap=fileURLToPath(new URL('./sandbox-bootstrap.py',import.meta.url));
const cache=new Map();
const quote=value=>JSON.stringify(value);
const absolute=value=>fs.realpathSync(path.resolve(value));
const explanation='Защищённый запуск Python недоступен. В настройках можно явно разрешить доверенный локальный запуск; он не изолирует файлы компьютера.';

function runtimeFor(python) {
 const result=spawnSync(python,['-I','-S','-B','-c','import json,sys,os;print(json.dumps({"executable":os.path.realpath(sys.executable),"prefix":sys.base_prefix,"version":list(sys.version_info[:2])}))'],{encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH||'/usr/bin:/bin',DYLD_LIBRARY_PATH:process.env.DYLD_LIBRARY_PATH||'/opt/homebrew/opt/expat/lib'}});
 if(result.status!==0)throw Error('Не удалось проверить готовый Python3.12.');
 const runtime=JSON.parse(result.stdout);
 if(runtime.version.join('.')!=='3.12')throw Error('Для учебного запуска нужен Python3.12.');
 return {...runtime,executable:absolute(runtime.executable),prefix:absolute(runtime.prefix)};
}

function policyFor({runtime,cwd,script,readPaths}) {
 const files=[bootstrap,script,...readPaths].flatMap(file=>[path.resolve(file),absolute(file)]);
 const literals=[...new Set(['/',...files,'/dev/null','/dev/urandom','/dev/random'])].map(file=>`(literal ${quote(file)})`).join(' ');
 return `(version 1)
(deny default)
(allow process-exec (literal ${quote(runtime.executable)}))
(allow sysctl-read)
(allow process-info* (target self))
(allow file-read-metadata)
(allow file-read* ${literals} (subpath "/usr/lib") (subpath "/System") (subpath ${quote(runtime.prefix)}) (subpath ${quote(cwd)}))
(allow file-write* (subpath ${quote(cwd)}) (literal "/dev/null"))`;
}

function launch({runtime,script,cwd,args=[],readPaths=[],mode='isolated'}) {
 const executable=runtime.executable;
 const pythonArgs=['-I','-S','-B',bootstrap,script,...args];
 const env=process.platform==='win32'?{SystemRoot:process.env.SystemRoot||process.env.SYSTEMROOT||'C:\\Windows',PATH:path.dirname(executable),USERPROFILE:cwd,TEMP:cwd,TMP:cwd,HOME:cwd}:{PATH:'/usr/bin:/bin',HOME:cwd,TMPDIR:cwd,LANG:'en_US.UTF-8',LC_ALL:'en_US.UTF-8',DYLD_LIBRARY_PATH:'/opt/homebrew/opt/expat/lib'};
 const options={cwd,env,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'};
 if(mode==='trusted-local')return {command:executable,args:pythonArgs,options};
 return {command:'/usr/bin/sandbox-exec',args:['-p',policyFor({runtime,cwd,script,readPaths}),executable,...pythonArgs],options};
}

export function getExecutionCapabilities({python,refresh=false}={}) {
 if(!python)return {available:false,backend:'unavailable',reason:'Не указан готовый Python3.12.',memoryProtection:'none'};
 const key=String(python);
 if(!refresh&&cache.has(key))return cache.get(key).capabilities;
 let runtime,capabilities;
 try{
  runtime=runtimeFor(python);
  if(process.platform!=='darwin'||!fs.existsSync('/usr/bin/sandbox-exec'))throw Error('На этой системе нет подключённого поддерживаемого средства изоляции.');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-isolation-probe-'));
  try{
   const spec=launch({runtime,script:bootstrap,cwd:absolute(directory),args:['--probe']});
   const result=spawnSync(spec.command,spec.args,{...spec.options,encoding:'utf8',timeout:5000,detached:false});
   if(result.status!==0||!result.stdout.includes('guild-sandbox-ready'))throw Error(result.stderr?.trim()||`Средство изоляции не прошло проверку (${result.signal||result.status}).`);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
  capabilities={available:true,backend:'macos-seatbelt',filesystemIsolation:true,networkDenied:true,childProcessesDenied:true,cpuLimitSeconds:3,memoryLimitMiB:512,memoryProtection:'resident-watchdog',reason:'Файлы доступны только среде Python, исполнителю и временному каталогу. Сеть и создание процессов запрещены. Память контролируется наблюдателем; краткий пик возможен.'};
 }catch(error){capabilities={available:false,backend:'unavailable',filesystemIsolation:false,networkDenied:false,childProcessesDenied:false,memoryProtection:'none',reason:error.message};}
 cache.set(key,{runtime,capabilities});return capabilities;
}

export function buildPythonLaunch({python,script,cwd,args=[],readPaths=[],mode='isolated'}={}) {
 if(!['isolated','trusted-local'].includes(mode))throw Error('Неизвестный режим запуска Python.');
 if(!cwd||!script)throw Error('Нужны временная папка и доверенный исполнитель Python.');
 const capabilities=getExecutionCapabilities({python});
 if(mode==='isolated'&&!capabilities.available)throw Error(`${explanation} ${capabilities.reason}`);
 const runtime=cache.get(String(python))?.runtime||runtimeFor(python);
 return {...launch({runtime,script:absolute(script),cwd:absolute(cwd),args,readPaths,mode}),capabilities:mode==='isolated'?capabilities:{...capabilities,available:false,backend:'trusted-local',filesystemIsolation:false,networkDenied:false,childProcessesDenied:false,...(process.platform==='win32'?{cpuLimitSeconds:null,memoryLimitMiB:null,memoryProtection:'none'}:{}),reason:'Явно выбран доверенный локальный запуск. Файлы компьютера не изолированы.'}};
}
