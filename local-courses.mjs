import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {blankCourse} from './shared/blank-course.mjs';
import {validateCourse} from './course-loader.mjs';
import {validateProgramGraph} from './program-service.mjs';
import {normalizeSharedLearningPreferences} from './profile-governance.mjs';
import {acquireProfileLock} from './local-config.mjs';

const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const id=value=>{if(typeof value!=='string'||!slug.test(value)||value.length>64)throw Error('ID: латинские буквы, цифры и дефисы, до 64 символов.');return value;};
const text=(value,label,max=180)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(label+': укажите текст до '+max+' символов.');return value.trim();};
export const courseAvatars=Object.freeze([
 {url:'/assets/nav-hero-painted-v1.png',label:'Путешественница'},
 {url:'/assets/nav-book-painted-v1.png',label:'Книга знаний'},
 {url:'/assets/nav-world-painted-v1.png',label:'Новый мир'},
 {url:'/assets/nav-brand-painted-v1.png',label:'Гильдия'},
 {url:'/assets/nav-wishes-painted-v1.png',label:'Звезда'},
 {url:'/assets/nav-achievements-painted-v1.png',label:'Достижения'}
].map(Object.freeze));
const description=value=>{if(typeof value!=='string'||value.length>240||/[\u0000-\u001f\u007f]/.test(value))throw Error('Короткое описание: одна строка до 240 символов.');return value.trim();};
const avatar=value=>{if(!courseAvatars.some(option=>option.url===value))throw Error('Выберите аватар из общих иллюстраций.');return value;};
export const courseMetadata=m=>({title:m.title,description:m.description||'',avatar:m.avatar||courseAvatars[0].url,metadataRevision:m.metadataRevision||0});
export function writeLocalJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function regular(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32*1024*1024)throw Error('Ожидался обычный локальный файл: '+path.basename(file));return file;}
const read=file=>JSON.parse(fs.readFileSync(regular(file),'utf8'));
function realFolder(target){let stat;try{stat=fs.lstatSync(target);}catch(error){if(error.code!=='ENOENT')throw error;}if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()))throw Error('Папка курса не может быть ссылкой.');return target;}
function folder(root,name){realFolder(root);return realFolder(path.join(root,id(name)));}
export function validateAccountManifest(m){if(m?.schemaVersion!==1)throw Error('Неизвестная версия manifest.json.');id(m.id);id(m.learningProfileId);if(typeof m.profileId!=='string'||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(m.profileId))throw Error('Неверный profileId.');text(m.title,'Название курса');text(m.learnerName,'Имя');if(m.avatar)avatar(m.avatar);if(m.description!==undefined)description(m.description);if(m.metadataRevision!==undefined&&(!Number.isSafeInteger(m.metadataRevision)||m.metadataRevision<0))throw Error('Неверная редакция названия курса.');return m;}

// Load the exact selected directory; a manifest must never redirect to a sibling account.
export function loadLocalCourseDirectory(directory,{accountId=path.basename(directory)}={}){
 realFolder(directory);const m=validateAccountManifest(read(path.join(directory,'manifest.json')));
 if(m.id!==accountId||m.id!==path.basename(directory))throw Error('ID manifest не совпадает с папкой курса.');
 const course=read(path.join(directory,'content.json'));
 const dailyFile=path.join(directory,'daily.json');if(fs.existsSync(dailyFile))course.daily=read(dailyFile);realFolder(path.join(directory,'profile'));
 course.id=m.id;course.manifest={...course.manifest,id:m.id,...courseMetadata(m),learnerName:m.learnerName};
 course.program={...read(path.join(directory,'program.json')),title:m.title};
 if(course.program.roadmap){course.adaptation={...course.adaptation,roadmap:course.program.roadmap};}
 validateProgramGraph(course.adaptation?.roadmap||[],course.program.excluded||[]);validateCourse(course);
 return {manifest:m,course,directory,stateFile:path.join(directory,'profile','progress.json'),profileId:m.profileId};
}

function copiedPresentation(presentation={}){
 const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value[key]!==undefined).map(key=>[key,structuredClone(value[key])]));
 const copy=pick(presentation,['regions','previous','routeOverrides','worldTitle','worldSubtitle','bookSubtitle']);
 for(const key of ['points','roadmap'])if(presentation[key])copy[key]=Object.fromEntries(Object.entries(presentation[key]).map(([id,point])=>[id,pick(point,['lessonId','prerequisites','number','description'])]));
 return copy;
}

export function createLocalCourseStore({root}){
 const coursesRoot=path.join(root,'local-courses'),preferencesRoot=path.join(root,'local-learning-profiles'),selectionFile=path.join(root,'local-data','selected-course.json');
 function manifest(accountId){const m=validateAccountManifest(read(path.join(folder(coursesRoot,accountId),'manifest.json')));if(m.id!==accountId)throw Error('ID manifest не совпадает с папкой курса.');return m;}
 function list(){const accounts=[],errors=[];if(fs.existsSync(coursesRoot))for(const entry of fs.readdirSync(coursesRoot,{withFileTypes:true})){if(!entry.isDirectory()||entry.name.startsWith('.'))continue;try{const m=manifest(entry.name);if(m.id!==entry.name)throw Error('ID не совпадает с папкой');accounts.push(m);}catch(error){errors.push({id:entry.name,error:error.message});}}return {accounts:accounts.sort((a,b)=>a.title.localeCompare(b.title)),errors};}
 function load(accountId){return loadLocalCourseDirectory(folder(coursesRoot,accountId),{accountId});}
 function selected(){try{return read(selectionFile).id;}catch{return null;}}
 function select(accountId){manifest(accountId);writeLocalJson(selectionFile,{id:accountId});}
 function updateMetadata(accountId,input){
  const allowed=['title','description','avatar','expectedMetadataRevision'];
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.includes(key)))throw Error('Изменять можно только название, короткое описание и аватар курса.');
  const title=text(input.title,'Название курса'),summary=description(input.description),image=avatar(input.avatar);
  if(/[\u0000-\u001f\u007f]/.test(title))throw Error('Название курса должно быть одной строкой.');
  const manifestFile=path.join(folder(coursesRoot,accountId),'manifest.json'),release=acquireProfileLock(manifestFile);
  try{const previous=manifest(accountId),revision=previous.metadataRevision||0;
   if(input.expectedMetadataRevision!==revision)throw Error('Название или аватар курса уже изменились. Обновите страницу перед сохранением.');
   const next={...previous,title,description:summary,avatar:image,metadataRevision:revision+1};validateAccountManifest(next);writeLocalJson(manifestFile,next);return next;
  }finally{release();}
 }
 function preferences(profileId){const file=path.join(folder(preferencesRoot,profileId),'preferences.json');return {
  read(){const doc=read(file);if(doc.schemaVersion!==1||!Number.isSafeInteger(doc.revision)||doc.revision<0||!doc.value||typeof doc.value!=='object'||Array.isArray(doc.value))throw Error('Повреждён профиль обучения.');return {...doc,value:normalizeSharedLearningPreferences(doc.value)};},
  write(value,{expectedRevision}={}){const release=acquireProfileLock(file);try{const previous=this.read();if(previous.revision!==expectedRevision)throw Error('Профиль обучения изменился в другом курсе. Обновите настройки.');const next={schemaVersion:1,revision:previous.revision+1,value:normalizeSharedLearningPreferences(value)};writeLocalJson(file,next);return next;}finally{release();}}
 };}
 function sharing(accountId){const m=manifest(accountId);return {id:m.learningProfileId,revision:preferences(m.learningProfileId).read().revision,courses:list().accounts.filter(a=>a.learningProfileId===m.learningProfileId).map(a=>({id:a.id,title:a.title}))};}
 function create(input){
  const accountId=id(input.id),title=text(input.title,'Название курса'),learnerName=text(input.learnerName,'Имя',80),goal=text(input.goal,'Цель',3000);
  if(!['blank','copy'].includes(input.contentMode)||!['new','copy','shared'].includes(input.preferencesMode))throw Error('Выберите основу курса и профиль обучения.');
  const destination=folder(coursesRoot,accountId);if(fs.existsSync(destination))throw Error('Курс с таким ID уже существует.');
  const source=input.contentMode==='copy'?load(input.contentSourceId):null,preferenceSource=input.preferencesMode!=='new'?manifest(input.preferencesSourceId):null;
  let course=source?structuredClone(source.course):blankCourse({id:accountId,title,learnerName,goal,subject:input.subject||title});
  // Copy the effective curriculum and reviewed material, never a learner's state.
  if(source&&input.effectiveCourse){course=structuredClone(input.effectiveCourse);}
  course.program={...course.program,title,finish:goal};
  course.id=accountId;course.manifest={...course.manifest,id:accountId,title,learnerName,legacyStorageMigration:false};
  course.engineConfig.initialState={...structuredClone(blankCourse({learnerName}).engineConfig.initialState)};
  course.engineConfig.courseHistory=[];course.engineConfig.normalization={...(course.engineConfig.normalization||{}),completedTopics:[]};
  course.presentation=copiedPresentation(course.presentation);delete course.activeLesson;delete course.notebookLesson;delete course.algorithmLesson;
  const profileId='default',learningProfileId=input.preferencesMode==='shared'?preferenceSource.learningProfileId:'learner-'+crypto.randomUUID();
  const m={schemaVersion:1,id:accountId,title,learnerName,profileId,learningProfileId,avatar:'/assets/nav-hero-painted-v1.png',createdAt:new Date().toISOString(),goal};
  validateAccountManifest(m);validateProgramGraph(course.adaptation?.roadmap||[],course.program?.excluded||[]);validateCourse(course);
  const staging=path.join(coursesRoot,'.creating-'+crypto.randomUUID());fs.mkdirSync(staging,{recursive:true});
  let createdPreferences;
  try{writeLocalJson(path.join(staging,'content.json'),course);writeLocalJson(path.join(staging,'program.json'),{...course.program,finish:goal,roadmap:course.adaptation?.roadmap||[]});
   if(input.preferencesMode!=='shared'){createdPreferences=folder(preferencesRoot,learningProfileId);writeLocalJson(path.join(createdPreferences,'preferences.json'),{schemaVersion:1,revision:0,value:preferenceSource?preferences(preferenceSource.learningProfileId).read().value:{}});}
   writeLocalJson(path.join(staging,'manifest.json'),m);fs.renameSync(staging,destination);
  }catch(error){fs.rmSync(staging,{recursive:true,force:true});if(createdPreferences)fs.rmSync(createdPreferences,{recursive:true,force:true});throw error;}
  select(accountId);return m;
 }
 function detach(accountId,{expectedRevision,expectedProfileId}={}){
  const manifestFile=path.join(folder(coursesRoot,accountId),'manifest.json'),release=acquireProfileLock(manifestFile);
  let createdPreferences,releasePreferences;
  try{
   const m=manifest(accountId);
   if(m.learningProfileId!==expectedProfileId)throw Error('Профиль обучения изменился. Обновите страницу.');
   releasePreferences=acquireProfileLock(path.join(folder(preferencesRoot,m.learningProfileId),'preferences.json'));
   const old=preferences(m.learningProfileId).read();if(old.revision!==expectedRevision)throw Error('Профиль уже изменился. Обновите страницу.');
   m.learningProfileId='learner-'+crypto.randomUUID();createdPreferences=folder(preferencesRoot,m.learningProfileId);
   writeLocalJson(path.join(createdPreferences,'preferences.json'),{schemaVersion:1,revision:0,value:old.value});
   writeLocalJson(manifestFile,m);createdPreferences=null;return m;
  }finally{if(createdPreferences)fs.rmSync(createdPreferences,{recursive:true,force:true});releasePreferences?.();release();}
 }
 return {list,load,manifest,selected,select,create,updateMetadata,preferences,sharing,detach,coursesRoot,preferencesRoot};
}
