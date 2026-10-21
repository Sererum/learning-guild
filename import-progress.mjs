// Only explicit copied saves are accepted. Never reads the demo's live data directory.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createEngine} from './shared/engine-core.mjs';
import defaultCourse from './courses/alice-python/index.mjs';
import {loadCourse} from './course-loader.mjs';
import {readLocalConfig,resolveCourseSettings,profileStateFile,bindProfile,acquireProfileLock} from './local-config.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
export function validateSave(value,course=defaultCourse){
 if(!value||value.version!==1||!Number.isFinite(value.currency)||value.currency<0||!Number.isFinite(value.gold)||value.gold<0||!Number.isInteger(value.level)||value.level<1||!value.inventory||Array.isArray(value.inventory)||!value.equipped||!value.claims||!Array.isArray(value.history)||!value.pity)throw Error('Это не совместимое сохранение Гильдии v1');
 const next=structuredClone(value);createEngine(course).normalizeState(next);return next;
}
export function importCopiedSave(source,destination=profileStateFile(defaultCourse.id),{course=defaultCourse,profileId='default'}={}){
 const resolved=fs.realpathSync(source),demoData=path.resolve(root,'../../demos/python-guild/data');
 if(resolved===demoData||resolved.startsWith(demoData+path.sep))throw Error('Сначала сделай отдельную копию progress.json вне папки data демо. Импорт принимает только копию.');
 if(fs.existsSync(destination))throw Error('Сохранение новой версии уже существует. Импорт не перезаписывает прогресс.');
 const sourceProfile=path.join(path.dirname(resolved),'profile.json');
 if(fs.existsSync(sourceProfile)&&JSON.parse(fs.readFileSync(sourceProfile,'utf8')).courseId!==course.id)throw Error('Копия сохранения принадлежит другому курсу.');
 const state=validateSave(JSON.parse(fs.readFileSync(resolved,'utf8')),course);
 bindProfile(destination,course.id,profileId);const release=acquireProfileLock(destination);
 try{fs.writeFileSync(destination,JSON.stringify(state,null,2),{flag:'wx',mode:0o600});return state;}finally{release();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(!process.argv[2])throw Error('Укажи путь к отдельной копии progress.json. Сервер должен быть остановлен.');const selected=readLocalConfig({args:process.argv.slice(3)}),course=await loadCourse(selected),settings=resolveCourseSettings(selected,course);importCopiedSave(process.argv[2],settings.stateFile,{course,profileId:settings.profileId});console.log('Копия импортирована в выбранный профиль Гильдии. Исходник не изменён.');}catch(error){console.error(error.message);process.exitCode=1;}
}
