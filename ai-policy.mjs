// Application-local, per-request settings. Never writes global Codex configuration.
export const aiEffortPolicy=Object.freeze({lesson:'xhigh',program:'xhigh',tutor:'medium'});
export const aiEffortLabels=Object.freeze({low:'Low',medium:'Medium',high:'High',xhigh:'Extra high'});
export const aiRoles=Object.freeze([
 {id:'tutorHint',label:'Подсказка по коду',defaultEffort:'medium'},
 {id:'tutorReview',label:'Ревью решения',defaultEffort:'medium'},
 {id:'personalization',label:'Анализ отзывов и персонализация',defaultEffort:'xhigh'},
 {id:'lessonGeneration',label:'Создание урока',defaultEffort:'xhigh'},
 {id:'lessonReview',label:'Независимая проверка урока',defaultEffort:'xhigh'},
 {id:'program',label:'Изменение программы: анализ, подготовка и проверка',defaultEffort:'xhigh'},
 {id:'sharedRuleReview',label:'Независимая проверка общего правила',defaultEffort:'medium'}
].map(Object.freeze));
export const defaultAiEfforts=Object.freeze(Object.fromEntries(aiRoles.map(role=>[role.id,role.defaultEffort])));
export function validateAiEffort(value){if(typeof value!=='string'||!Object.hasOwn(aiEffortLabels,value))throw Error('Выберите уровень ИИ: Low, Medium, High или Extra high.');return value;}
export function normalizeAiEfforts(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Некорректные настройки тщательности ИИ.');
 const result={...defaultAiEfforts};
 for(const [role,effort]of Object.entries(value)){if(!Object.hasOwn(defaultAiEfforts,role))throw Error('Неизвестный тип работы ИИ.');result[role]=validateAiEffort(effort);}
 return result;
}
export function effortForTask(role,settings={}){
 if(role==='lesson')role='lessonGeneration';
 if(role==='tutor')role='tutorReview';
 if(!Object.hasOwn(defaultAiEfforts,role))throw Error('Неизвестный тип работы ИИ.');
 return normalizeAiEfforts(settings)[role];
}
export function effortRoleForStage(stage,programRequest=false){
 if(!['personalize','generate','review'].includes(stage))throw Error('Неизвестный этап работы ИИ.');
 return programRequest?'program':({personalize:'personalization',generate:'lessonGeneration',review:'lessonReview'})[stage];
}
export function aiEffortPreset(preset){
 if(preset==='defaults')return {...defaultAiEfforts};
 if(!['medium','xhigh'].includes(preset))throw Error('Неизвестный набор настроек ИИ.');
 return Object.fromEntries(aiRoles.map(role=>[role.id,preset]));
}
