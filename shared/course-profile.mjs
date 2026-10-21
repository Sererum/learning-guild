import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';

const unsafeKeys=new Set(['__proto__','prototype',...Object.getOwnPropertyNames(Object.prototype)]);
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const fail=message=>{throw Error('Некорректный личный course-state.json: '+message);};
function object(value,label){if(!plain(value))fail(label+' должен быть JSON-объектом');return value;}
function safeTree(value,label='файл',seen=new Set()){
 if(value===null||['string','boolean'].includes(typeof value))return;
 if(typeof value==='number'&&Number.isFinite(value))return;
 if(typeof value!=='object'||(!Array.isArray(value)&&!plain(value))||seen.has(value))fail(label+': только конечные JSON-значения');
 seen.add(value);for(const [key,item] of Object.entries(value)){if(unsafeKeys.has(key))fail(label+': небезопасный ключ '+key);safeTree(item,label+'.'+key,seen);}seen.delete(value);
}
function keys(value,allowed,label){object(value,label);for(const key of Object.keys(value))if(!allowed.includes(key))fail(label+': запрещённое поле '+key);}
function text(value,label,max=4000){if(typeof value!=='string'||value.length>max)fail(label+': ожидалась строка до '+max+' символов');return value;}
function references(value,known,label){if(!Array.isArray(value))fail(label+' должен быть массивом');const seen=new Set();for(const id of value){if(typeof id!=='string'||!known.has(id)||seen.has(id))fail(label+': неизвестный или повторный ID '+String(id));seen.add(id);}return [...value];}
const clone=value=>JSON.parse(JSON.stringify(value));

/** Non-executable profile data: it can describe prior learning, never new tasks or payments. */
export function applyCourseProfile(course,profile,{profileId='default'}={}){
 const config=course.engineConfig;
 const catalog=clone(config.historyCatalog||config.courseHistory||[]);
 const pointIds=new Set((config.courseMap?.points||[]).map(item=>item.id));
 const lessonIds=new Set((course.lessons||[]).map(item=>item.id));
 const regionIds=new Set((config.courseMap?.regions||[]).map(item=>item.id));
 const historyById=new Map(catalog.map(entry=>[entry.id,entry]));
 let history=[],completedTopics=[],presentation={...(course.presentation||{})};
 if(profile!==undefined){
  safeTree(profile);keys(profile,['schemaVersion','courseId','profileId','history','presentation','normalization'],'файл');
  if(profile.schemaVersion!==1)fail('schemaVersion должен быть 1');
  if(profile.courseId!==course.id||profile.profileId!==profileId)fail('courseId/profileId не соответствуют выбранному профилю');
  if(profile.history!==undefined){
   if(!Array.isArray(profile.history))fail('history должен быть массивом');const seen=new Set();
   history=profile.history.map((entry,index)=>{
    const label='history['+index+']';keys(entry,['id','name','kind','source','points','studiedPoints','closed','closedPoints','reward'],label);
    const canonical=historyById.get(entry.id);if(!canonical||seen.has(entry.id))fail(label+': неизвестный или повторный ID '+String(entry.id));seen.add(entry.id);
    if(entry.reward!==undefined&&entry.reward!==(canonical.reward||0))fail(label+': нельзя менять награду каталога');
    if(entry.kind!==undefined&&entry.kind!==canonical.kind)fail(label+': нельзя менять тип записи каталога');
    const result={...clone(canonical),...clone(entry),id:canonical.id,reward:canonical.reward||0,points:references(entry.points??canonical.points??[],pointIds,label+'.points')};
    for(const key of ['studiedPoints','closed','closedPoints'])if(result[key]!==undefined)result[key]=references(result[key],pointIds,label+'.'+key);
    for(const key of ['name','kind','source'])if(result[key]!==undefined)text(result[key],label+'.'+key);
    return result;
   });
  }
  if(profile.normalization!==undefined){keys(profile.normalization,['completedTopics'],'normalization');completedTopics=references(profile.normalization.completedTopics||[],pointIds,'normalization.completedTopics');}
  if(profile.presentation!==undefined){
   const input=profile.presentation;keys(input,['currentLessonId','currentPointId','legacyLessonId','roadmap','visibleRegionIds','regions','points','previous','routeOverrides','worldTitle','worldSubtitle','bookSubtitle'],'presentation');
   for(const [key,known] of [['currentLessonId',lessonIds],['legacyLessonId',lessonIds],['currentPointId',pointIds]])if(input[key]!==undefined){if(!known.has(input[key]))fail('presentation.'+key+': неизвестный ID');presentation[key]=input[key];}
   for(const key of ['worldTitle','worldSubtitle','bookSubtitle'])if(input[key]!==undefined)presentation[key]=text(input[key],'presentation.'+key);
   if(input.visibleRegionIds!==undefined)presentation.visibleRegionIds=references(input.visibleRegionIds,regionIds,'presentation.visibleRegionIds');
   for(const [key,known,allowed] of [['roadmap',pointIds,['number','phase','note']],['regions',regionIds,['name','subtitle','description']],['points',pointIds,['number','description','lessonId','available','legacyRewardField','prerequisites']]])if(input[key]!==undefined){
    object(input[key],'presentation.'+key);presentation[key]={...(presentation[key]||{})};
    for(const [id,entry] of Object.entries(input[key])){
     if(!known.has(id))fail('presentation.'+key+': неизвестный ID '+id);keys(entry,allowed,'presentation.'+key+'.'+id);
     const result={...(presentation[key][id]||{})};
     for(const [field,value] of Object.entries(entry)){
      const label='presentation.'+key+'.'+id+'.'+field;
      if(field==='phase'){if(!['mastered','partial','current','available','archive','future'].includes(value))fail(label+': неизвестная фаза');result[field]=value;}
      else if(field==='available'){if(typeof value!=='boolean')fail(label+': ожидался boolean');result[field]=value;}
      else if(field==='lessonId'){if(!lessonIds.has(value))fail(label+': неизвестный урок');result[field]=value;}
      else if(['legacyRewardField','prerequisites'].includes(field)){
       if(!isDeepStrictEqual(value,course.presentation?.[key]?.[id]?.[field]))fail(label+': нельзя менять зависимости или расчёт наград');result[field]=clone(value);
      }else result[field]=text(value,label);
     }
     presentation[key][id]=result;
    }
   }
   // A full old presentation can be migrated, but topology stays owned by the course.
   for(const key of ['previous','routeOverrides'])if(input[key]!==undefined){if(!isDeepStrictEqual(input[key],course.presentation?.[key]))fail('presentation.'+key+': нельзя менять зависимости курса');presentation[key]=clone(input[key]);}
  }
 }
 return {...course,presentation,engineConfig:{...config,historyCatalog:catalog,courseHistory:history,initialState:{...(config.initialState||{}),completedTopics:[...completedTopics]},normalization:{...(config.normalization||{}),completedTopics:[...completedTopics]}}};
}

export function loadCourseProfile(course,{stateFile,profileId='default'}={}){
 if(typeof stateFile!=='string'||!stateFile)fail('не указан путь сохранения');
 const filename=path.join(path.dirname(path.resolve(stateFile)),'course-state.json');let profile;
 try{const stat=fs.statSync(filename);if(!stat.isFile()||stat.size>512*1024)fail('файл должен быть обычным JSON не больше 512 КБ');profile=JSON.parse(fs.readFileSync(filename,'utf8'));}
 catch(error){if(error.code!=='ENOENT')throw error;}
 return applyCourseProfile(course,profile,{profileId});
}
