// Web feedback: server test results, difficulty / difficult step / hint.
export const taskFeedbackTemplate={
 version:'task-reflection-v2',
 difficulty:[{value:'1',label:'1 — слишком легко'},{value:'2',label:'2 — легко'},{value:'3',label:'3 — пришлось подумать'},{value:'4',label:'4 — сложно'},{value:'5',label:'5 — очень сложно'}],
 hardPart:[{value:'none',label:'Нигде — задача была лёгкой'},{value:'statement',label:'Понять условие'},{value:'algorithm',label:'Придумать шаги решения'},{value:'variables',label:'Разобраться с ролями переменных'},{value:'condition',label:'Составить условие / сравнение'},{value:'boundaries',label:'Проверить границы и крайние случаи'},{value:'syntax',label:'Записать идею на Python'},{value:'report',label:'Сохранить результат и вывести отчёт'},{value:'tests',label:'Понять, почему тест не прошёл'},{value:'other',label:'Другое'}],
 hintSource:[{value:'none',label:'Подсказки не понадобились'},{value:'task',label:'Подсказка в задании'},{value:'example',label:'Теория или разобранный пример'},{value:'ai',label:'Подсказка ИИ'},{value:'person',label:'Помощь человека'},{value:'several',label:'Несколько источников'}]
};
export function saveTaskFeedback(state,task,lesson,proof,checked,input){
 const author=input.author===undefined?null:validateFeedbackAuthor(input.author);
 const previous=state.taskFeedback?.[task.id]||[],existing=previous[0];
 // Navigation remains once-only. Revisions require the explicit edit action;
 // replacing a response never alters test proofs, claims or rewards.
 if(existing&&input.edit!==true)return {feedback:existing,already:true};
 if(input.edit===true&&input.skipped===true)throw Error('Чтобы пропустить отзыв, закрой форму без сохранения.');
 if(input.skipped===true){
  const feedback={templateVersion:taskFeedbackTemplate.version,lessonId:lesson.id,taskId:task.id,taskName:task.name,codeHash:proof.codeHash,allPassed:!!checked.ok,skipped:true,...(author?{author}:{}),savedAt:new Date().toISOString()};
  state.taskFeedback??={};state.taskFeedback[task.id]=[feedback];return {feedback,already:false};
 }
 if(!Number.isInteger(input.difficulty)||input.difficulty<1||input.difficulty>5)throw Error('Выбери сложность от 1 до 5.');
 for(const name of ['hardPart','hintSource'])if(!taskFeedbackTemplate[name].some(option=>option.value===input[name]))throw Error('Выбери, где пришлось подумать и какая помощь понадобилась.');
 const text=(name,max)=>{const value=input[name]??'';if(typeof value!=='string'||value.length>max)throw Error('Слишком длинный или некорректный ответ.');return value.trim();};
 const hardDetails=text('hardDetails',1200),hintDetails=text('hintDetails',1200);
 if(input.hardPart==='other'&&!hardDetails)throw Error('Напиши, в каком месте пришлось подумать.');
 if(input.hintSource!=='none'&&!hintDetails)throw Error('Коротко укажи, какая именно подсказка помогла.');
 const feedback={templateVersion:taskFeedbackTemplate.version,lessonId:lesson.id,taskId:task.id,taskName:task.name,codeHash:proof.codeHash,allPassed:!!checked.ok,
  tests:(checked.tests||[]).map(test=>({label:test.label,ok:!!test.ok})),testError:checked.error||null,
  difficulty:input.difficulty,hardPart:input.hardPart,hardDetails,hintSource:input.hintSource,hintDetails,...(author?{author}:{}),savedAt:new Date().toISOString()};
 if(input.edit===true){
  feedback.revision=(Number.isInteger(existing?.revision)?existing.revision:existing?1:0)+1;
  feedback.source='manual';
  feedback.createdAt=existing?.createdAt||existing?.savedAt||feedback.savedAt;
  if(existing){state.taskFeedbackHistory??={};state.taskFeedbackHistory[task.id]=[...(state.taskFeedbackHistory[task.id]||[]),structuredClone(existing)];}
 }
 state.taskFeedback??={};state.taskFeedback[task.id]=[feedback,...previous.slice(1)];return {feedback,already:false,updated:!!existing&&input.edit===true};
}

function validateFeedbackAuthor(author){
 if(!author||typeof author!=='object'||typeof author.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(author.id)||typeof author.name!=='string'||!author.name.trim()||author.name.length>80||!['learner','teacher'].includes(author.role))throw Error('Автор отзыва не зарегистрирован.');
 return {id:author.id,name:author.name.trim(),role:author.role};
}
