import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const publicRoot=path.join(path.dirname(fileURLToPath(import.meta.url)),'public');
import {createLocalCourseStore} from './local-courses.mjs';
import {createGuildServer} from './server.mjs';

// Each open account owns a separate server context and lock. Switching never
// redirects an in-flight request or background job to another learner.
export function createAccountServer({root,python,...options}){
 const store=createLocalCourseStore({root}),contexts=new Map(),token=crypto.randomBytes(24).toString('hex');
 const reply=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 function context(accountId){if(contexts.has(accountId))return contexts.get(accountId);const entry=store.load(accountId);
  const child=createGuildServer({...options,course:entry.course,profileId:entry.profileId,stateFile:entry.stateFile,python,sharedPreferences:{read:()=>store.preferences(store.manifest(accountId).learningProfileId).read(),write:(value,opts)=>store.preferences(store.manifest(accountId).learningProfileId).write(value,opts)},
   accountContext:{id:accountId,sharing:()=>store.sharing(accountId),snapshot:()=>({id:accountId,...store.sharing(accountId),id:accountId,learningProfileId:store.manifest(accountId).learningProfileId}),assets:state=>({...state,...(state.profileAssets?{profileAssets:Object.fromEntries(Object.entries(state.profileAssets).map(([key,url])=>[key,url+'?account='+accountId]))}:{})})}});
  contexts.set(accountId,child);return child;
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const host=req.headers.host||'';if(!/^127\.0\.0\.1:\d+$/.test(host))return reply(res,403,{error:'Доступ только через 127.0.0.1'});
  const url=new URL(req.url,'http://'+host),accountId=url.searchParams.get('account');
  try{
   if(url.pathname==='/api/accounts'&&req.method==='GET')return reply(res,200,{...store.list(),selected:store.selected(),token});
   if(url.pathname==='/api/accounts'&&req.method==='POST'){
    if(req.headers.origin!=='http://'+host||req.headers['x-guild-token']!==token)return reply(res,403,{error:'Обновите список курсов и повторите действие.'});
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16000)throw Error('Слишком большой запрос.');}const input=JSON.parse(body);
    if(input.action==='select'){context(input.id);store.select(input.id);return reply(res,200,{url:'/?account='+input.id+'#program'});}
    if(input.action==='detach'){store.detach(input.id,{expectedRevision:input.revision,expectedProfileId:input.sharedProfileId});return reply(res,200,{message:'Теперь у курса самостоятельный профиль обучения.'});}
    if(input.action!=='create')throw Error('Неизвестное действие.');
    // Never trust an effectiveCourse object received from the browser.
    delete input.effectiveCourse;if(input.contentMode==='copy')input.effectiveCourse=context(input.contentSourceId).guildCourse();
    const m=store.create(input);let warning;
    if(input.generatePlan&&input.contentMode==='blank')try{await context(m.id).guildPlan({action:'ask',target:{kind:'program'},message:'Создай полную программу с нуля от начального уровня до конечной цели: '+m.goal+'. Добавь все блоки и уроки до конца, зависимости и понятные планы каждого урока (3–6 пунктов по два предложения). Ничего не отмечай пройденным. Учитывай профиль обучения. Перед началом ученик проверит предложение.'});}catch(error){warning='Курс создан. План пока не подготовлен: '+error.message;}
    return reply(res,201,{account:m,warning,url:'/?account='+m.id+'#program'});
   }
   if(['GET','HEAD'].includes(req.method)&&['/accounts.js','/accounts.css'].includes(url.pathname)){const name=url.pathname.slice(1);res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-store'});return res.end(fs.readFileSync(path.join(publicRoot,name)));}
   if(req.method==='GET'&&url.pathname==='/'&&!accountId){const selection=store.selected(),accounts=store.list().accounts;if(!url.searchParams.has('courses')&&accounts.length){const chosen=accounts.some(a=>a.id===selection)?selection:accounts[0].id;res.writeHead(302,{Location:'/?account='+chosen+'#program','Cache-Control':'no-store'});return res.end();}
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Мои курсы · Гильдия знаний</title><link rel="stylesheet" href="/accounts.css"><body class="account-welcome"><main id="account-start"></main><script type="module" src="/accounts.js"></script></body></html>');}
   if(accountId){const child=context(accountId);return child.emit('request',req,res);}
   // Common assets have no account state. Use an existing context only for the
   // public allowlist. APIs, HTML, rules and private portraits require an ID.
   const common=/^\/(?:app\.js|style\.css|transport\.js|storage\.js|journey\.js|equipment-[a-z-]+\.js|fantasy-theme\.css|pages\/[a-z-]+\.(?:js|css)|lesson-workbench\/[a-z-]+\.(?:js|css)|assets\/[a-zA-Z0-9_/-]+\.(?:png|svg|webp|mp4))$/.test(url.pathname);
   if(common&&req.method==='GET'){
    const file=path.resolve(publicRoot,'.'+url.pathname);if(!file.startsWith(publicRoot+path.sep)||!fs.existsSync(file)||!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())return reply(res,404,{error:'Не найдено'});
    const types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.mp4':'video/mp4'},headers={'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache'},size=fs.statSync(file).size;
    if(path.extname(file)==='.mp4'){
     headers['Accept-Ranges']='bytes';
     if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);let start=0,end=size-1;
      if(match){if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}else if(match[2])start=Math.max(0,size-Number(match[2]));}
      if(!match||(!match[1]&&!match[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start){res.writeHead(416,{'Content-Range':'bytes */'+size});return res.end();}
      res.writeHead(206,{...headers,'Content-Range':'bytes '+start+'-'+end+'/'+size,'Content-Length':end-start+1});return fs.createReadStream(file,{start,end}).pipe(res);
     }
    }
    res.writeHead(200,{...headers,'Content-Length':size});return fs.createReadStream(file).pipe(res);
   }
   return reply(res,404,{error:'Выберите курс в меню аккаунта.'});
  }catch(error){return reply(res,400,{error:error.message});}
 });
 server.once('close',()=>{for(const context of contexts.values())context.guildClose();contexts.clear();});
 server.guildStore=store;return server;
}
