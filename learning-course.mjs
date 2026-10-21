import {validateCourse} from './course-loader.mjs';
import {withRepairWorkbooks} from './shared/repair-workbooks.mjs';

const records = (base=[],extra=[],replace=false) => {
 const result=new Map(base.map(item=>[item.id,item]));
 for(const item of extra) {
  if(result.has(item.id)&&!replace)throw Error('Личный материал повторяет существующий ID: '+item.id);
  result.set(item.id,item);
 }
 return [...result.values()];
};
const routes = items => [...new Map(items.map(item=>[item.from+'\0'+item.to,item])).values()];

// Pure merge: a profile's new materials never modify the shared course package.
export function withLearningOverlay(base,overlay={},jobs=[],state={}) {
 const lessons=records(base.lessons,overlay.lessons),tasks=records(base.tasks,overlay.tasks);
 const old=base.engineConfig,points=records(old.courseMap.points,overlay.points,true);
 const generatedIds=new Set((overlay.points||[]).map(point=>point.id));
 const groups=(overlay.rewardGroups||[]).map(group=>({...group,kind:lessons.find(lesson=>lesson.id===group.id)?.type==='repair'?'repair':'lesson'}));
 const taskRewards={...old.taskRewards,...Object.fromEntries((overlay.tasks||[]).map(task=>[task.id,task.reward||0]))};
 const taskRules={...old.taskRules,...Object.fromEntries((overlay.tasks||[]).map(task=>[task.id,{exam:lessons.some(lesson=>lesson.type==='exam'&&lesson.taskIds.includes(task.id)),crystals:1}]))};
 const presentation={...base.presentation,points:{...base.presentation?.points,...overlay.presentation?.points},previous:{...old.pointPrerequisites,...base.presentation?.previous,...overlay.pointPrerequisites}};
 for(const point of overlay.points||[]) {
  const lesson=lessons.find(lesson=>lesson.id===point.lessonId);
  // A suggested recovery branch is optional. Opening either branch gives no credit.
  presentation.points[point.id]={...presentation.points[point.id],phase:'available',available:true,archived:false,lessonId:point.lessonId,
   description:lesson?.subtitle||point.summary||'',note:point.kind==='repair'?'Отдельная практика по отправленной работе. Можно разобрать сложное место или вернуться к основной теме.':'Подготовлено по твоей работе и личным настройкам обучения.'};
 }
 const latest=jobs.filter(job=>job.status==='ready'&&job.branches?.length).sort((a,b)=>(b.updatedAt||b.createdAt).localeCompare(a.updatedAt||a.createdAt))[0];
 if(latest) {
  const unfinished=branch=>{const lesson=lessons.find(item=>item.id===branch.lessonId);return lesson&&(lesson.taskIds.some(id=>state.contentNeedsRecheck?.includes(id))||!state.lessonClaims?.[lesson.id]&&!lesson.taskIds.every(id=>state.claims?.[id]));};
  const preferred=latest.branches.find(branch=>branch.kind!=='next'&&unfinished(branch))||latest.branches.find(unfinished)||latest.branches.find(branch=>branch.kind==='next')||latest.branches[0];
  if(points.some(point=>point.id===preferred.pointId)) {presentation.currentPointId=preferred.pointId;presentation.currentLessonId=preferred.lessonId;}
 }
 const earned=(overlay.lessons||[]).filter(lesson=>lesson.type!=='repair').map(lesson=>({id:'achievement-'+lesson.id,name:lesson.title,topic:lesson.title,symbol:'✦',requires:lesson.taskIds,description:'Завершить самостоятельные задачи этого материала.'}));
 const engineConfig={...old,taskRewards,taskRules,
  courseMap:{...old.courseMap,points,regions:records(old.courseMap.regions,overlay.regions,true),routes:routes([...(old.courseMap.routes||[]),...(overlay.routes||[]).map(route=>({...route,side:points.find(point=>point.id===route.to)?.kind==='repair'||!!route.side}))])},
  rewardGroups:records(old.rewardGroups,groups),taskTopics:{...old.taskTopics,...overlay.taskTopics},qualityCaps:{...old.qualityCaps,...overlay.qualityCaps},
  pointPrerequisites:{...old.pointPrerequisites,...overlay.pointPrerequisites},
  statuePrerequisites:Object.fromEntries(Object.entries(old.statuePrerequisites||{}).filter(([id])=>!generatedIds.has(id))),
  achievements:records(old.achievements,earned)};
 const result={...base,lessons,tasks,presentation,engineConfig,repairPoints:records(base.repairPoints,overlay.repairPoints,true)};
 return validateCourse(withRepairWorkbooks(result));
}
