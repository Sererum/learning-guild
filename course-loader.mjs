import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const bundledCoursesRoot=fileURLToPath(new URL('./courses/',import.meta.url));
const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const identifier=/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const unsafeKeys=new Set(['__proto__','prototype',...Object.getOwnPropertyNames(Object.prototype)]);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const fail=message=>{throw new Error(`Некорректный пакет курса: ${message}`);};
const within=(root,candidate)=>candidate===root||candidate.startsWith(root+path.sep);
function records(value,label){if(!Array.isArray(value))fail(`${label} должен быть массивом`);return value;}
function safeId(id,label){if(typeof id!=='string'||!identifier.test(id)||unsafeKeys.has(id))fail(`${label}: небезопасный id ${String(id)}`);}
function unique(items,label){const ids=new Set();for(const item of items){if(!object(item))fail(`${label}: ожидалась запись`);safeId(item.id,label);if(ids.has(item.id))fail(`${label}: повтор id ${item.id}`);ids.add(item.id);}return ids;}
function reward(value,label){if(value!==undefined&&(!Number.isFinite(value)||value<0))fail(`${label}: награда должна быть неотрицательным числом`);}
function references(ids,known,label,kind='задание'){const seen=new Set();for(const id of records(ids,label)){safeId(id,label);if(!known.has(id))fail(`${label}: неизвестное ${kind} ${id}`);if(seen.has(id))fail(`${label}: повтор ссылки ${id}`);seen.add(id);}}
const taskReferences=(ids,taskIds,label)=>references(ids,taskIds,label);
function jsonValue(value,label,seen=new Set()){
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'){if(!Number.isFinite(value))fail(`${label}: JSON не поддерживает ${value}`);return;}
 if(typeof value!=='object')fail(`${label}: значение не представимо в JSON`);
 if(seen.has(value))fail(`${label}: циклическая ссылка`);
 if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)fail(`${label}: ожидается простой JSON объект`);
 seen.add(value);for(const[key,item]of Object.entries(value)){if(unsafeKeys.has(key))fail(`${label}: небезопасный ключ ${key}`);jsonValue(item,`${label}.${key}`,seen);}seen.delete(value);
}

// Course modules are trusted author code, loaded on the server. This validation
// checks the content contract; it is not a sandbox for third-party modules.
export function validateCourse(course){
 if(!object(course))fail('ожидался объект');
 const manifest=course.manifest;
 if(!object(manifest)||manifest.schemaVersion!==1)fail('course.json: schemaVersion должен быть 1');
 if(typeof manifest.id!=='string'||!slug.test(manifest.id)||course.id!==manifest.id)fail('id должен быть ASCII slug и совпадать с course.json');
 safeId(manifest.id,'course.json');
 if(typeof manifest.title!=='string'||!manifest.title.trim())fail('course.json: требуется title');
 if(manifest.runtime!=='basic-python')fail(`неподдерживаемый runtime ${manifest.runtime}; подключите отдельный проверенный исполнитель`);
 const tasks=records(course.tasks,'tasks'),taskIds=unique(tasks,'tasks');
 const lessons=records(course.lessons,'lessons'),lessonIds=unique(lessons,'lessons');
 const config=course.engineConfig;if(!object(config))fail('engineConfig отсутствует');
 jsonValue(config,'engineConfig');
 const catalog=records(config.catalog,'catalog'),itemIds=unique(catalog,'catalog');
 const banners=records(config.banners,'banners'),bannerIds=unique(banners,'banners');
 for(const item of catalog){if(![3,4,5].includes(item.rarity))fail(`catalog.${item.id}: редкость должна быть 3, 4 или 5`);if(!Number.isFinite(item.power)||item.power<0)fail(`catalog.${item.id}: требуется неотрицательная сила`);}
 for(const banner of banners){const pool=catalog.filter(item=>item.kind===banner.id&&item.wishable!==false&&!(config.wishExcludedItems||[]).includes(item.id));for(const rarity of [3,4,5])if(!pool.some(item=>item.rarity===rarity))fail(`banners.${banner.id}: нет предмета редкости ${rarity}`);}
 for(const id of Object.keys(config.initialState?.inventory||{}))references([id],itemIds,'initialState.inventory','предмет');
 for(const id of Object.values(config.initialState?.equipped||{}))if(id!==null)references([id],itemIds,'initialState.equipped','предмет');
 for(const key of ['currency','gold','books','petals','crystals'])reward(config.initialState?.[key],`initialState.${key}`);
 for(const[key,limit]of [['pity',19],['pityFour',4]])for(const[id,count]of Object.entries(config.initialState?.[key]||{})){references([id],bannerIds,`initialState.${key}`,'баннер');if(!Number.isInteger(count)||count<0||count>limit)fail(`initialState.${key}.${id}: ожидается целое число от 0 до ${limit}`);}
 for(const task of tasks){reward(task.reward,`tasks.${task.id}`);reward(task.qualityCap,`tasks.${task.id}.qualityCap`);if(!Array.isArray(task.tests)||!task.tests.length)fail(`tasks.${task.id}: нужны серверные tests`);if(typeof task.starter!=='string')fail(`tasks.${task.id}: требуется starter`);}
 for(const lesson of lessons){taskReferences(lesson.taskIds,taskIds,`lessons.${lesson.id}.taskIds`);reward(lesson.reward,`lessons.${lesson.id}`);reward(lesson.qualityCap,`lessons.${lesson.id}.qualityCap`);unique(records(lesson.sections,`lessons.${lesson.id}.sections`),`lessons.${lesson.id}.sections`);for(const section of lesson.sections)if(section.taskIds)taskReferences(section.taskIds,taskIds,`sections.${section.id}.taskIds`);}
 const map=config.courseMap;if(!object(map)||!object(map.start)||!map.start.id)fail('courseMap.start отсутствует');
 const points=records(map.points,'courseMap.points'),pointIds=unique(points,'courseMap.points');
 safeId(map.start.id,'courseMap.start');if(pointIds.has(map.start.id))fail('courseMap.start.id совпадает с точкой');
 const regionIds=unique(records(map.regions,'courseMap.regions'),'courseMap.regions');
 for(const point of points){if(point.region&&!regionIds.has(point.region))fail(`точка ${point.id}: неизвестный регион ${point.region}`);if(point.task&&!taskIds.has(point.task))fail(`точка ${point.id}: неизвестное задание ${point.task}`);if(point.lessonId&&!lessonIds.has(point.lessonId))fail(`точка ${point.id}: неизвестный урок ${point.lessonId}`);if(point.topic&&!pointIds.has(point.topic))fail(`точка ${point.id}: неизвестная тема ${point.topic}`);for(const key of ['x','y'])if(!Number.isFinite(point[key]))fail(`точка ${point.id}: требуется координата ${key}`);}
 const routeIds=new Set([map.start.id,...pointIds]);for(const route of records(map.routes,'courseMap.routes'))if(!routeIds.has(route.from)||!routeIds.has(route.to))fail(`маршрут ${route.from} → ${route.to}: неизвестная точка`);
 for(const [id,amount]of Object.entries(config.taskRewards||{})){if(!taskIds.has(id))fail(`taskRewards: неизвестное задание ${id}`);reward(amount,`taskRewards.${id}`);}
 for(const [id,amount]of Object.entries(config.qualityCaps||{})){if(!taskIds.has(id))fail(`qualityCaps: неизвестное задание ${id}`);reward(amount,`qualityCaps.${id}`);}
 unique(config.rewardGroups||[],'rewardGroups');const groupedTasks=new Set();for(const group of config.rewardGroups||[]){taskReferences(group.taskIds,taskIds,`rewardGroups.${group.id}.taskIds`);if(group.reward===undefined)fail(`rewardGroups.${group.id}: требуется reward`);reward(group.reward,`rewardGroups.${group.id}`);for(const id of group.taskIds){if(groupedTasks.has(id))fail(`rewardGroups: задание ${id} входит в несколько групп`);groupedTasks.add(id);}for(const key of ['completedTopics','visitedPoints'])if(group[key])references(group[key],pointIds,`rewardGroups.${group.id}.${key}`,'тема');}
 for(const [id,topics]of Object.entries(config.taskTopics||{})){if(!taskIds.has(id))fail(`taskTopics: неизвестное задание ${id}`);for(const topic of records(topics,`taskTopics.${id}`))if(!pointIds.has(topic))fail(`taskTopics.${id}: неизвестная точка ${topic}`);}
 for(const[id,previous]of Object.entries(config.pointPrerequisites||{})){if(!pointIds.has(id))fail(`pointPrerequisites: неизвестная точка ${id}`);if(previous!==null)references([previous],pointIds,`pointPrerequisites.${id}`,'тема');}
 for(const[id,previous]of Object.entries(config.statuePrerequisites||{})){if(!pointIds.has(id))fail(`statuePrerequisites: неизвестная точка ${id}`);references(previous,pointIds,`statuePrerequisites.${id}`,'тема');}
 for(const id of Object.keys(config.pointPrerequisites||{})){const visited=new Set([id]);let previous=config.pointPrerequisites[id];while(previous){if(visited.has(previous))fail(`pointPrerequisites: цикл у ${id}`);visited.add(previous);previous=config.pointPrerequisites[previous];}}
 for(const[id,rule]of Object.entries(config.taskRules||{})){if(!taskIds.has(id))fail(`taskRules: неизвестное задание ${id}`);if(rule.requiresClaims)taskReferences(rule.requiresClaims,taskIds,`taskRules.${id}.requiresClaims`);if(rule.coveredBy)taskReferences([rule.coveredBy],taskIds,`taskRules.${id}.coveredBy`);if(rule.gate&&!Object.hasOwn(config.gates||{},rule.gate))fail(`taskRules.${id}: неизвестный gate ${rule.gate}`);}
 for(const point of points)if(point.requires)taskReferences([point.requires],taskIds,`courseMap.${point.id}.requires`);
 const historyIds=new Set();
 for(const label of ['historyCatalog','courseHistory']){
  for(const id of unique(config[label]||[],label))historyIds.add(id);
  for(const entry of config[label]||[]){reward(entry.reward,`${label}.${entry.id}`);for(const key of ['points','closed','closedPoints','studiedPoints'])if(entry[key])references(entry[key],pointIds,`${label}.${entry.id}.${key}`,'тема');}
 }
 for(const[id,gate]of Object.entries(config.gates||{})){for(const key of ['anyClaims','allClaims'])if(gate[key])taskReferences(gate[key],taskIds,`gates.${id}.${key}`);if(gate.anyCredits)references(gate.anyCredits,historyIds,`gates.${id}.anyCredits`,'историческое задание');}
 unique(config.achievements||[],'achievements');for(const item of config.achievements||[])if(item.requires)taskReferences(item.requires,taskIds,`achievements.${item.id}.requires`);
 taskReferences(config.recurringTasks||[],taskIds,'recurringTasks');
 unique(course.repairPoints||[],'repairPoints');for(const point of course.repairPoints||[]){if(point.task&&!taskIds.has(point.task))fail(`repairPoints.${point.id}: неизвестное задание ${point.task}`);if(point.lessonId&&!lessonIds.has(point.lessonId))fail(`repairPoints.${point.id}: неизвестный урок ${point.lessonId}`);if(point.topic&&!pointIds.has(point.topic))fail(`repairPoints.${point.id}: неизвестная тема ${point.topic}`);}
 return course;
}

export async function loadCourse({courseId='alice-python',courseDir,coursesRoot=bundledCoursesRoot}={}){
 if(!courseDir&&(typeof courseId!=='string'||!slug.test(courseId)))fail('courseId должен быть ASCII slug');
 const directory=await fs.realpath(courseDir?path.resolve(courseDir):path.join(coursesRoot,courseId));
 if(!courseDir&&!within(await fs.realpath(coursesRoot),directory))fail('courseId выходит за настроенную директорию courses');
 const manifest=JSON.parse(await fs.readFile(path.join(directory,'course.json'),'utf8'));
 if(typeof manifest.entry!=='string'||path.isAbsolute(manifest.entry)||path.extname(manifest.entry)!=='.mjs')fail('course.json: entry должен указывать локальный .mjs');
 const entry=await fs.realpath(path.resolve(directory,manifest.entry));if(!within(directory,entry))fail('entry выходит за директорию курса');
 const module=await import(pathToFileURL(entry).href);
 const descriptor=module.default||module.course;
 if(!object(descriptor))fail('entry должен экспортировать default объект курса');
 if(descriptor.id!==manifest.id)fail('id в entry не совпадает с course.json');
 let presentation=descriptor.presentation||{};try{presentation=JSON.parse(await fs.readFile(path.join(directory,'presentation.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const course={...descriptor,id:manifest.id,manifest,presentation};
 if(!courseDir&&courseId!==course.id)fail('courseId не совпадает с course.json');
 return validateCourse(course);
}
