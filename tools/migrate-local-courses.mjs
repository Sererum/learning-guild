import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadCourse} from '../course-loader.mjs';
import {writeLocalJson,createLocalCourseStore} from '../local-courses.mjs';
import {createProfileGovernance,pickSharedLearningPreferences} from '../profile-governance.mjs';
import {acquireProfileLock} from '../local-config.mjs';

const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function inventory(directory){const result={};function walk(folder,relative=''){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){if(entry.name==='.guild-lock.json')continue;const name=path.join(relative,entry.name),file=path.join(folder,entry.name);if(entry.isSymbolicLink())throw Error('Символические ссылки переносить автоматически нельзя: '+name);if(entry.isDirectory())walk(file,name);else if(entry.isFile())result[name]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');else throw Error('Нестандартный файл: '+name);}}walk(directory);return result;}
export async function migrateLocalCourse({root,sourceCourse,stateFile,account,apply=false}){
 root=path.resolve(root);stateFile=path.resolve(stateFile);sourceCourse=path.resolve(sourceCourse);
 const binding=read(path.join(path.dirname(stateFile),'profile.json')),course=await loadCourse({courseDir:sourceCourse});
 if(account!==course.id||binding.courseId!==course.id)throw Error('При переносе сохраняйте исходный ID курса.');
 const store=createLocalCourseStore({root}),destination=path.join(store.coursesRoot,account);
 if(fs.existsSync(destination))throw Error('Курс уже существует. Повторный перенос не перезаписывает данные.');
 const sourceProfile=path.dirname(stateFile),files=inventory(sourceProfile),before=read(stateFile),plan={account,sourceCourse,sourceProfile,destination,profileId:binding.profileId,files:Object.keys(files).length,taskProofs:Object.keys(before.testProofs||{}).length,currency:before.currency};
 if(!apply)return {applied:false,...plan};
 // Acquiring the legacy lock proves its old server has stopped before copying.
 const release=acquireProfileLock(stateFile),staging=path.join(store.coursesRoot,'.migrating-'+crypto.randomUUID());
 const preferencesId='learner-'+crypto.randomUUID();let preferenceDir;
 try{
  fs.mkdirSync(staging,{recursive:true});fs.cpSync(sourceProfile,path.join(staging,'profile'),{recursive:true,filter:file=>path.basename(file)!=='.guild-lock.json'});
  const copied=inventory(path.join(staging,'profile'));if(JSON.stringify(Object.entries(files).sort())!==JSON.stringify(Object.entries(copied).sort())||JSON.stringify(Object.entries(files).sort())!==JSON.stringify(Object.entries(inventory(sourceProfile)).sort()))throw Error('Исходные данные изменились при копировании. Повторите после остановки записи.');
  writeLocalJson(path.join(staging,'content.json'),course);writeLocalJson(path.join(staging,'program.json'),{...course.program,roadmap:course.adaptation?.roadmap||[]});
  const copiedProfile=path.join(staging,'profile'),governance=createProfileGovernance({directory:copiedProfile,courseId:course.id,profileId:binding.profileId});
  const seed=path.join(copiedProfile,'personalization-seed.json');if(fs.existsSync(seed))governance.importSeed(read(seed));
  const personalization=path.join(copiedProfile,'personalization.json'),preferences=pickSharedLearningPreferences(governance.settings(),fs.existsSync(personalization)?read(personalization):{});
  preferenceDir=path.join(store.preferencesRoot,preferencesId);writeLocalJson(path.join(preferenceDir,'preferences.json'),{schemaVersion:1,revision:0,value:preferences});
  writeLocalJson(path.join(staging,'manifest.json'),{schemaVersion:1,id:course.id,title:course.manifest.title,learnerName:before.name||course.manifest.learnerName||'Ученик',avatar:'/assets/nav-hero-painted-v1.png',profileId:binding.profileId,learningProfileId:preferencesId,migratedAt:new Date().toISOString()});
  writeLocalJson(path.join(staging,'migration.json'),{...plan,sourceHashes:files,progressHash:files[path.basename(stateFile)]});
  // The new canonical name must contain the exact original bytes.
  if(path.basename(stateFile)!=='progress.json')fs.copyFileSync(stateFile,path.join(copiedProfile,'progress.json'));
  fs.renameSync(staging,destination);store.load(account);store.select(account);
  return {applied:true,...plan,preservedProgress:crypto.createHash('sha256').update(fs.readFileSync(path.join(destination,'profile','progress.json'))).digest('hex')===files[path.basename(stateFile)]};
 }catch(error){if(fs.existsSync(staging))fs.rmSync(staging,{recursive:true,force:true});if(!fs.existsSync(destination)&&preferenceDir)fs.rmSync(preferenceDir,{recursive:true,force:true});throw error;}finally{release();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const input={root:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')};for(let i=2;i<process.argv.length;i++){const flag=process.argv[i];if(flag==='--apply'){input.apply=true;continue;}const key={'--root':'root','--source-course':'sourceCourse','--state-file':'stateFile','--account':'account'}[flag];if(!key||!process.argv[i+1])throw Error('Параметры: --source-course PATH --state-file PATH --account ID [--root PATH] [--apply]. Без --apply только план.');input[key]=process.argv[++i];}console.log(JSON.stringify(await migrateLocalCourse(input),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
