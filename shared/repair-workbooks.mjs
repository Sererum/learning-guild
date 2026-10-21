// A single learner-facing workbook per source lesson. Original records remain
// available for saved links, feedback, reward ledgers and content versions.
export function withRepairWorkbooks(course) {
 const originals=course.lessons.filter(l=>!l.repairParts);
 const points=[...(course.engineConfig.courseMap.points||[]),...(course.repairPoints||[])];
 const roadmap=course.adaptation?.roadmap||[],groups=new Map();
 for(const lesson of originals.filter(l=>l.type==='repair')) {
  const point=points.find(p=>p.lessonId===lesson.id||lesson.taskIds.includes(p.task));
  const parent=roadmap.find(n=>point?.topic&&(course.program?.nodes?.[n.id]?.pointIds||[n.pointId]).includes(point.topic))
   ||roadmap.find(n=>lesson.sourceLessonId&&(n.lessonId===lesson.sourceLessonId||n.id===lesson.sourceLessonId)||lesson.evidenceId&&n.id===lesson.evidenceId);
  const parentId=parent?.id||lesson.sourceLessonId;
  if(!parentId)continue;
  if(!groups.has(parentId))groups.set(parentId,{parent,lessons:[]});
  groups.get(parentId).lessons.push(lesson);
 }
 const aliases=new Map(),workbooks=[];
 for(const [parentId,{parent,lessons}] of groups) {
  if(lessons.length<2)continue;
  const id='repair-workbook-'+parentId;
  if(originals.some(l=>l.id===id))throw Error('Повтор ID общей работы над ошибками: '+id);
  const unique=items=>[...new Set(items)];
  // Preserve unambiguous section IDs and retain origins for old reading marks.
  const counts=new Map();for(const l of lessons)for(const s of l.sections)counts.set(s.id,(counts.get(s.id)||0)+1);
  const repairSectionOrigins={};
  const sections=lessons.flatMap(l=>l.sections.map(s=>{
   const id=counts.get(s.id)>1?l.id+':'+s.id:s.id;
   repairSectionOrigins[id]={lessonId:l.id,sectionId:s.id};return {...s,id};
  }));
  const source=originals.find(l=>l.id===parentId);
  workbooks.push({id,type:'repair',sourceLessonId:parent?.lessonId||parentId,
   title:'Работа над ошибками · '+(parent?.title||source?.title||parentId),
   subtitle:'Все сложные места этого урока в одном разборе',
   minutes:lessons.reduce((sum,l)=>sum+(l.minutes||0),0),
   reward:lessons.reduce((sum,l)=>sum+(l.reward||0),0),qualityCap:0,
   taskIds:unique(lessons.flatMap(l=>l.taskIds)),sections,
   cheatsheet:unique(lessons.flatMap(l=>l.cheatsheet||[])),
   pitfalls:lessons.flatMap(l=>l.pitfalls||[]),resources:lessons.flatMap(l=>l.resources||[]),
   errorExamples:lessons.flatMap(l=>l.errorExamples||[]),repairParts:lessons.map(l=>l.id),repairSectionOrigins});
  for(const lesson of lessons)aliases.set(lesson.id,id);
 }
 return {...course,lessons:[...workbooks,...originals.map(l=>({...l,repairWorkbookId:aliases.get(l.id)}))]};
}
