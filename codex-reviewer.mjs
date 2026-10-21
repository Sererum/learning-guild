import fs from 'node:fs';
import {validateAiEffort} from './ai-policy.mjs';
import path from 'node:path';
import {sanitizeForModel} from './privacy.mjs';
import {spawn} from 'node:child_process';
export function findCodexExecutable(){
 const names=process.platform==='win32'?['codex.exe']:['codex'];
 const candidates=[process.env.GUILD_CODEX_BIN,...(process.env.PATH||'').split(path.delimiter).flatMap(dir=>names.map(name=>path.join(dir,name))),'/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex','/Applications/Codex.app/Contents/Resources/codex'];
 return candidates.filter(Boolean).find(file=>{try{fs.accessSync(file,fs.constants.X_OK);return true;}catch{return false;}})||null;
}
export function startCodexReview({executable,prompt,effort='medium',schema,schemaFile,resultFile,statusFile,cwd,timeoutMs=180000,noTools=false,jsonEvents=false}){
 prompt=sanitizeForModel(prompt);
 validateAiEffort(effort);
 fs.writeFileSync(schemaFile,JSON.stringify(schema),{mode:0o600});
 const started=Date.now(),telemetry={eventCount:0};
 const status=value=>{fs.writeFileSync(statusFile+'.tmp',JSON.stringify({...value,effort,...(jsonEvents?{telemetry:{...telemetry,elapsedMs:Date.now()-started}}:{})}),{mode:0o600});fs.renameSync(statusFile+'.tmp',statusFile);};
 status({status:'pending'});
 const restricted=noTools?['--disable','shell_tool','--disable','apps','--disable','plugins','--config','mcp_servers={}','--config','web_search="disabled"']:[];
 const child=spawn(executable,['exec',...(jsonEvents?['--json']:[]),'--sandbox','read-only','--ephemeral','--skip-git-repo-check',...restricted,'--config',`model_reasoning_effort="${effort}"`,'--output-schema',schemaFile,'--output-last-message',resultFile,'--color','never','-'],{cwd,stdio:['pipe',jsonEvents?'pipe':'ignore','pipe'],detached:process.platform!=='win32'});
 let finished=false,providerError=null,errorTail='';
 const classify=text=>{if(typeof text!=='string')return;const candidate=providerFailure(text);if(candidate)providerError=candidate;};
 const fail=(message,code)=>{if(finished)return;finished=true;clearTimeout(timer);status({status:'failed',error:message,...(code?{code}:{})});};
 const timer=setTimeout(()=>{try{if(process.platform==='win32')child.kill();else process.kill(-child.pid,'SIGKILL');}catch{}fail('Codex не успел завершить разбор. Можно повторить запрос позже.');},timeoutMs);
 child.guildCancel=()=>{fail('Запрос Codex отменён.');try{if(process.platform==='win32')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL');}catch{}};
 child.on('error',()=>fail('Не удалось запустить локальный Codex. Проверь доступность агента и вход в аккаунт.'));
 if(jsonEvents){
  let buffer='';
  const label=value=>typeof value==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(value)?value:undefined;
  child.stdout.on('data',chunk=>{
   if(finished)return;buffer+=chunk.toString();if(buffer.length>1500000){buffer='';return;}
   for(;;){const end=buffer.indexOf('\n');if(end<0)break;const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let event;try{event=JSON.parse(line);}catch{continue;}
    if(event.type==='error'||event.type==='turn.failed'){classify(event.message);classify(event.error?.message);classify(event.error?.code);}
    telemetry.eventCount+=1;telemetry.lastEvent=label(event.type);telemetry.lastItemType=label(event.item?.type);
    if(event.usage&&typeof event.usage==='object')telemetry.usage=Object.fromEntries(['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens','reasoning_output_tokens'].filter(key=>Number.isFinite(event.usage[key])).map(key=>[key,event.usage[key]]));
    // Never store agent messages, tool commands, student code, or error bodies.
    status({status:'pending'});
   }
  });
 }
 child.stderr.on('data',chunk=>{errorTail=(errorTail+chunk.toString()).slice(-8000);classify(errorTail);});
 child.on('close',code=>{if(finished)return;if(code!==0||!fs.existsSync(resultFile)){fail(providerError?.message||'Codex завершился без разбора. Проверь вход в Codex и доступность модели.',providerError?.code);return;}finished=true;clearTimeout(timer);status({status:'complete'});});
 child.stdin.on('error',()=>{});child.stdin.end(prompt);
 return child;
}

// Classify in memory; never persist stderr, account details, or provider error text.
export function providerFailure(text){
 if(/usage[_ ]limit|rate[_ ]limit|quota|insufficient_quota|too many requests|limit.{0,30}(reached|exceeded)|429/i.test(text))return {code:'GUILD_PROVIDER_LIMIT',message:'Достигнут лимит аккаунта Codex или частоты запросов. Дождись восстановления лимита и повтори запрос либо нажми «Продолжить». Готовые этапы сохранены. Локальный бюджет приложения не показывает остаток аккаунта.'};
 if(/unsupported.{0,80}(effort|reasoning)|(effort|reasoning).{0,80}(unsupported|not supported)/i.test(text))return {code:'GUILD_UNSUPPORTED_EFFORT',message:'Выбранная модель Codex не поддерживает этот уровень тщательности. Выбери другой уровень в настройках и повтори запрос. Готовые этапы сохранены.'};
 return null;
}
