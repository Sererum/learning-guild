import {isDeepStrictEqual} from 'node:util';
import {assertJsonShape,generationSchema,independentReviewSchema} from './schema.mjs';

const fail = message => {throw Error(`Материал не опубликован: ${message}`);};
const nonempty=(text,label)=>{if(typeof text!=='string'||!text.trim())fail(`${label}: нужен понятный текст`);return text;};
function safeJson(text,label) {
 let value;try{value=JSON.parse(text);}catch{fail(`${label}: некорректный JSON`);}
 const visit=(item,depth=0)=>{if(depth>8)fail(`${label}: слишком глубокие данные`);if(item&&typeof item==='object'){if(Object.keys(item).length>200)fail(`${label}: слишком большой набор`);for(const[key,v]of Object.entries(item)){if(['__proto__','constructor','prototype'].includes(key))fail(`${label}: недопустимый ключ`);visit(v,depth+1);}}};visit(value);
 if(value===null||typeof value!=='object'||Array.isArray(value))fail(`${label}: нужен объект переменных`);
 for(const name of Object.keys(value))if(!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name))fail(`${label}: небезопасное имя переменной`);
 return value;
}
function shapeFor(kind,requirements={}) {
 const shapes=requirements.materialShapes||{};
 return shapes[kind]||({lesson:{miniBlocks:3,tasksPerBlock:3,finalProjects:1},exam:{preparationBlocks:1,finalProjects:1},repair:{minTasks:1,maxTasks:3},reinforcement:{minTasks:3,maxTasks:6}}[kind]);
}

export function compileMaterials(output,{job,course,decision,nextTopic,branches}) {
 assertJsonShape(output,generationSchema);
 const expected=branches||['next',...(decision.practice?[decision.practice]:[])];
 if(output.materials.length!==expected.length||new Set(output.materials.map(m=>m.branch)).size!==expected.length||expected.some(branch=>!output.materials.some(m=>m.branch===branch)))fail('нужна следующая тема и только рекомендованная отдельная ветка практики');
 const artifacts=[];
 for(const material of output.materials){
  const kind=material.branch==='next'?(nextTopic.kind||'lesson'):material.branch;
  const shape=shapeFor(kind,course.adaptation?.requirements);
  const exact=kind==='lesson'?shape.miniBlocks*shape.tasksPerBlock+shape.finalProjects:kind==='exam'?shape.finalProjects:null;
  if(exact!==null&&material.tasks.length!==exact)fail(`${kind}: ожидалось ${exact} задач`);
  if(exact===null&&(material.tasks.length<shape.minTasks||material.tasks.length>shape.maxTasks))fail(`${kind}: неверное количество задач`);
  if(kind==='lesson'&&material.sections.length!==shape.miniBlocks)fail('новый урок должен содержать все мини-блоки');
  if(kind==='reinforcement'&&(material.sections.length<1||material.sections.length>2||material.tasks.length!==material.sections.length*3))fail('закрепление: один-два мини-блока, по три задачи в каждом');
  if((kind==='exam'||kind==='repair')&&material.sections.length!==1)fail('для короткого разбора или подготовки экзамена нужен один блок');
  if(!material.sections.length||material.sections.length>6)fail('нужны небольшие теоретические блоки');
  nonempty(material.title,'Название');nonempty(material.summary,'Смысл материала');
  if(!material.cheatsheet.length||!material.pitfalls.length)fail('нужны памятка и разбор типичной ошибки');
  const id=`adaptive-${job.materialKey||job.id}-${material.branch}`;
  const policy=course.adaptation?.rewards||{};
  for(const name of ['repair','exam','reinforcement','miniBlock','finalQualityCap','ordinaryQualityCap'])if(!Number.isSafeInteger(policy[name])||policy[name]<0)fail(`в курсе не задана награда ${name}`);
  const baseReward=job.curriculumTarget?.diagnostic?0:kind==='repair'?policy.repair:kind==='exam'?policy.exam:kind==='reinforcement'?policy.reinforcement*material.sections.length:policy.miniBlock*shape.miniBlocks;
  const topicId=material.branch==='next'?nextTopic.id:`${job.sourceTopicId||job.lessonId}-${material.branch}`;
  const tasks=material.tasks.map((task,index)=>{
   const taskId=`${id}-task-${index+1}`,tests=task.tests.map(test=>({label:nonempty(test.label,'Название теста'),inputs:safeJson(test.inputsJson,'Вход теста'),expected:safeJson(test.expectedJson,'Ответ теста'),...(test.hidden?{hidden:true}:{})}));
   if(tests.length<4||tests.length>10||tests.every(test=>test.hidden)||tests[0].hidden||!tests.some(test=>test.hidden))fail(`${taskId}: нужны 4–10 сценариев, первый видимый и хотя бы один скрытый`);
   const inputNames=Object.keys(tests[0].inputs).sort(),outputNames=Object.keys(tests[0].expected).sort();
   if(!inputNames.length||!outputNames.length||inputNames.some(name=>outputNames.includes(name)))fail(`${taskId}: входы и выходы должны быть названы отдельно`);
   for(const test of tests)if(!isDeepStrictEqual(Object.keys(test.inputs).sort(),inputNames)||!isDeepStrictEqual(Object.keys(test.expected).sort(),outputNames))fail(`${taskId}: имена переменных должны совпадать во всех сценариях`);
   if(new Set(tests.map(test=>JSON.stringify(test.inputs))).size!==tests.length)fail(`${taskId}: повтор входа вместо отдельной проверки`);
   if(task.examples.length<2)fail(`${taskId}: нужны минимум два объяснённых примера`);
   const answerExamples=task.examples.map(example=>({inputs:safeJson(example.inputsJson,'Вход примера'),expected:safeJson(example.expectedJson,'Ответ примера'),explanation:nonempty(example.explanation,'Объяснение примера')}));
   nonempty(task.name,'Название задачи');nonempty(task.description,'Условие');nonempty(task.starter,'Исходные данные');
   if(!task.hints.length||!task.audit.simplestSolution.trim()||!task.audit.shortcutAnalysis.trim()||!task.audit.transfer.trim())fail(`${taskId}: нет авторского разбора смысла и обходов`);
   const final=(kind==='exam'||kind==='lesson')&&index===material.tasks.length-1;
   const qualityCap=job.curriculumTarget?.diagnostic||kind==='repair'?0:final?policy.finalQualityCap:policy.ordinaryQualityCap;
   return {id:taskId,name:task.name,description:task.description,starter:task.starter,hints:task.hints,tests,answerExamples,
    statement:[{title:'Задача',text:task.description},{title:'Сохрани и выведи',text:outputNames.map(name=>'`'+name+'`').join(', ')},{title:'Примеры',text:'Сравни два небольших случая: что дано и почему получается такой ответ.',table:{headers:['Вход','Результат','Почему'],rows:answerExamples.map(example=>[JSON.stringify(example.inputs),JSON.stringify(example.expected),example.explanation])}}],
    reward:0,qualityCap,tag:material.title,constraints:{requiredPrintVariables:outputNames}};
  });
  const sections=material.sections.map((section,index)=>{
   if(!section.paragraphs.length||section.paragraphs.length>8||!section.table.headers.length||!section.table.rows.length)fail('теория должна включать короткое объяснение и таблицу');
   if(!section.example.steps.length||section.example.steps.length>20)fail('пример требует проверяемые ручные шаги');
   const assigned=kind==='lesson'?tasks.slice(index*shape.tasksPerBlock,(index+1)*shape.tasksPerBlock):kind==='exam'?[]:tasks.filter((_,taskIndex)=>Math.floor(taskIndex*material.sections.length/tasks.length)===index);
   const {output,...example}=section.example;
   return {id:`${id}-section-${index+1}`,title:'Теория · '+section.title.replace(/^Теория\s*[·:]\s*/,''),paragraphs:section.paragraphs,table:section.table,taskIds:assigned.map(task=>task.id),pause:'Можно сделать паузу и продолжить позже.',example:{code:example.code,steps:example.steps.map(({variablesJson,occurrence,...step})=>({...step,variables:safeJson(variablesJson,'Состояние примера')}))}};
  });
  const lesson={id,title:material.title,subtitle:material.summary,type:kind==='repair'?'repair':kind==='exam'?'exam':'lesson',adaptive:true,adaptiveBranch:job.curriculumTarget?.kind==='reinforcement'?'reinforcement':material.branch,...(job.curriculumTarget?.diagnostic?{diagnostic:true}:{}),adaptiveTopicId:topicId,sourceLessonId:job.lessonId,
   taskIds:tasks.map(task=>task.id),sections,reward:baseReward,qualityCap:tasks[0]?.qualityCap||0,qualityTotal:tasks.reduce((n,task)=>n+task.qualityCap,0),cheatsheet:material.cheatsheet,pitfalls:material.pitfalls,resources:[],...(kind==='lesson'||kind==='exam'?{finalTaskId:tasks.at(-1).id}:{})};
  artifacts.push({branch:material.branch,kind,topicId,lesson,tasks,source:material});
 }
 return artifacts;
}

const mismatch=result=>result.tests?.some(test=>test.mismatches?.length);
export async function hydrateExecutionTraces(artifacts,execute) {
 for(const artifact of artifacts){
  for(const [sectionIndex,section] of artifact.source.sections.entries()){
   const result=await execute({code:section.example.code,trace:true});
   if(!result.ok||result.output!==section.example.output)fail(`не совпал вывод примера «${section.title}»`);
   for(const step of section.example.steps){
    if(step.line<1||step.line>section.example.code.split('\n').length||step.occurrence<1)fail('неверный адрес шага');
    const frame=result.frames?.find(frame=>frame.line===step.line&&frame.occurrence===step.occurrence),expected=safeJson(step.variablesJson,'Состояние шага');
    if(!frame||!Object.keys(expected).length||Object.entries(expected).some(([key,value])=>!isDeepStrictEqual(frame.variables[key],value)))fail(`состояние ручного шага не совпадает с Python: ${section.title}, строка ${step.line}`);
   }
   // Only the trusted runner can certify a complete trace. Keep author-selected
   // steps for compatibility, and publish every observed Python state beside them.
   if(!result.executionTrace?.complete||!result.executionTrace.frames?.length)fail(`нет полной проверенной трассировки примера «${section.title}»`);
   artifact.lesson.sections[sectionIndex].example.executionTrace=structuredClone(result.executionTrace);
  }
 }
}
export async function verifyAuthoredMaterials(artifacts,execute) {
 await hydrateExecutionTraces(artifacts,execute);
 const audits=[];
 for(const artifact of artifacts){
  for(let index=0;index<artifact.tasks.length;index++){
   const task=artifact.tasks[index],privateTask=artifact.source.tasks[index];
   const starter=await execute({code:task.starter,tests:task.tests,inspectStarter:true});if(!starter.ok)fail(`${task.name}: в заготовке не только исходные данные — ${starter.error}`);
   const checked=await execute({code:privateTask.referenceCode,tests:task.tests,constraints:task.constraints});
   if(!checked.ok)fail(`${task.name}: эталон автора не прошёл тесты`);
   for(const sample of task.answerExamples){const check=await execute({code:privateTask.referenceCode,tests:[{label:'Пример условия',inputs:sample.inputs,expected:sample.expected}],constraints:task.constraints});if(!check.ok)fail(`${task.name}: пример условия даёт другой ответ`);}
   const wrong=await verifyWrongVariants(privateTask.wrongVariants,task,execute);
   audits.push({taskId:task.id,author:{...privateTask.audit,wrongVariants:wrong}});
  }
 }
 return audits;
}
async function verifyWrongVariants(variants,task,execute) {
 if(variants.length<2||variants.length>3||new Set(variants.map(variant=>variant.code)).size!==variants.length)fail(`${task.name}: нужны 2–3 различных естественных неверных решения`);
 const reports=[];
 for(const variant of variants){nonempty(variant.reason,'Смысл ошибки');const checked=await execute({code:variant.code,tests:task.tests,constraints:{}});if(checked.ok||!mismatch(checked))fail(`${task.name}: неверный вариант должен ошибаться по результату на реальном тесте`);reports.push({reason:variant.reason,distinguishingTests:checked.tests.filter(test=>test.mismatches?.length).map(test=>test.label)});}
 return reports;
}

export function independentReviewInput(artifacts) {
 return artifacts.map(({branch,kind,lesson,tasks})=>({branch,kind,lesson,tasks}));
}
export async function verifyIndependentReview(review,artifacts,execute) {
 assertJsonShape(review,independentReviewSchema);
 if(!review.approved||review.issues.length)fail('независимый рецензент нашёл проблемы; материал остался черновиком');
 const tasks=artifacts.flatMap(artifact=>artifact.tasks);
 if(review.taskAudits.length!==tasks.length||new Set(review.taskAudits.map(audit=>audit.taskId)).size!==tasks.length)fail('независимый разбор должен охватывать каждую задачу');
 const reports=[];
 for(const task of tasks){
  const audit=review.taskAudits.find(audit=>audit.taskId===task.id);
  if(!audit||!audit.clearForBeginner||!audit.meaningfulConditions||!audit.conclusion.trim())fail(`${task.name}: нет независимого подтверждения ясности и необходимости условий`);
  const checked=await execute({code:audit.independentReferenceCode,tests:task.tests,constraints:task.constraints});if(!checked.ok)fail(`${task.name}: независимое решение расходится с тестами автора`);
  reports.push({taskId:task.id,conclusion:audit.conclusion,wrongVariants:await verifyWrongVariants(audit.wrongVariants,task,execute)});
 }
 return reports;
}
