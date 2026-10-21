// One course-supplied roadmap drives both map and book. No learner IDs live here.
const presentation=ctx=>ctx.data.presentation||{};
const settings=(ctx,p)=>({...presentation(ctx).roadmap?.[p.id],...presentation(ctx).points?.[p.id]});
export const isTaskClaimed=(ctx,id)=>!!ctx.data.state.claims?.[ctx.data.course?.recurringTasks?.includes(id)?id+':'+ctx.data.day:id];
const claimed=isTaskClaimed;
const lessonFor=(ctx,p)=>{const spec=settings(ctx,p);return ctx.data.lessons?.find(l=>l.id===(p.repairWorkbookId||spec.lessonId||p.lessonId)||l.taskIds?.includes(p.task));};
export function previousRepairs(ctx,p){return (ctx.rules.courseHistory||[]).filter(r=>r.kind==='repair'&&r.points?.includes(p.id)&&ctx.data.state.courseCredits?.[r.id]);}
export function journeyPoints(ctx){
 const base=ctx.data.courseMap?.points||[];
 const repairs=(ctx.data.repairPoints||[]).flatMap(spec=>{const parent=base.find(p=>p.id===spec.topic);if(!parent||settings(ctx,parent).phase!=='partial'||(spec.evidenceId&&!ctx.data.state.courseCredits?.[spec.evidenceId]))return [];return [{...spec,x:parent.x+(spec.offset?.[0]||0),y:parent.y+(spec.offset?.[1]||0)}];});
 const seen=new Set();
 return [...base,...repairs.filter(point=>!base.some(existing=>existing.id===point.id))].flatMap(point=>{
  const original=ctx.data.lessons?.find(l=>l.id===point.lessonId),workbook=ctx.data.lessons?.find(l=>l.id===original?.repairWorkbookId);
  if(point.kind!=='repair'||!workbook)return [point];
  if(seen.has(workbook.id))return [];seen.add(workbook.id);
  return [{...point,lessonId:workbook.id,repairWorkbookId:workbook.id,task:workbook.id,name:workbook.title}];
 });
}
export function lessonProgress(ctx,lessonId){
 const lesson=ctx.data.lessons?.find(l=>l.id===lessonId),ids=lesson?.taskIds||[];
 if(lesson?.repairParts?.length){
  const parts=lesson.repairParts.map(id=>lessonProgress(ctx,id));
  const sum=field=>parts.reduce((total,p)=>total+p[field],0);
  return {...Object.fromEntries(['completedTasks','totalTasks','baseTotal','basePaid','baseRemaining','qualityTotal','qualityPaid','qualityRemaining','remaining'].map(field=>[field,sum(field)])),started:parts.some(p=>p.started)};
 }
 const completedTasks=ids.filter(id=>claimed(ctx,id)).length,totalTasks=ids.length,baseTotal=Number(lesson?.reward||0),recurring=ids.length>0&&ids.every(id=>ctx.data.course?.recurringTasks?.includes(id)),claim=recurring?null:ctx.data.state.lessonClaims?.[lessonId];
 const point=journeyPoints(ctx).find(p=>lessonFor(ctx,p)?.id===lessonId),legacyField=point&&settings(ctx,point).legacyRewardField;
 const basePaid=recurring?(completedTasks===totalTasks?baseTotal:0):claim?Number(claim.gems??baseTotal):legacyField?Number(ctx.data.state[legacyField]||0):totalTasks&&completedTasks===totalTasks?baseTotal:0;
 const baseRemaining=claim?0:Math.max(0,baseTotal-basePaid);
 const qualityTotal=['repair','daily'].includes(lesson?.type)?0:ids.reduce((sum,id)=>sum+Number(ctx.data.tasks?.find(t=>t.id===id)?.qualityCap??(id===lesson?.finalTaskId||lesson?.type==='exam'?20:10)),0);
 const qualityPaid=ids.reduce((sum,id)=>sum+Number(ctx.data.state.qualityClaims?.[id]?.gems||0),0),qualityRemaining=Math.max(0,qualityTotal-qualityPaid);
 return {completedTasks,totalTasks,started:completedTasks>0||ids.some(id=>ctx.data.state.testProofs?.[id]),baseTotal,basePaid,baseRemaining,qualityTotal,qualityPaid,qualityRemaining,remaining:baseRemaining+qualityRemaining};
}
export function visibleRegions(ctx){const spec=presentation(ctx);return (ctx.data.courseMap?.regions||[]).filter(r=>!spec.visibleRegionIds||spec.visibleRegionIds.includes(r.id)).map(r=>({...r,...spec.regions?.[r.id]}));}
function prerequisiteIds(ctx,p){const spec=settings(ctx,p);if(spec.prerequisites)return spec.prerequisites;if(p.prerequisites)return p.prerequisites;if(['daily','repair'].includes(p.kind)&&p.topic)return [p.topic];const prior=presentation(ctx).previous?.[p.id];return prior?(Array.isArray(prior)?prior:[prior]):[];}
function completion(ctx,p,visited=new Set()){
 if(!p||visited.has(p.id))return false;visited.add(p.id);const spec=settings(ctx,p),lesson=lessonFor(ctx,p);
 if(ctx.data.state.contentNeedsRecheckPoints?.includes(p.id)||lesson?.taskIds?.some(id=>ctx.data.state.contentNeedsRecheck?.includes(id)))return false;
 if(spec.phase==='mastered')return true;
 if(p.kind==='daily')return claimed(ctx,p.task);
 if(lesson?.taskIds?.length&&(!spec.phase||spec.lessonId||p.lessonId||p.kind==='repair'))return !lesson.taskIds.some(id=>ctx.data.state.contentNeedsRecheck?.includes(id))&&(!!ctx.data.state.lessonClaims?.[lesson.id]||lesson.taskIds.every(id=>claimed(ctx,id)));
 if(['daily','repair'].includes(p.kind))return claimed(ctx,p.task);
 if((ctx.data.repairPoints||[]).some(r=>r.topic===p.id&&completion(ctx,r,new Set(visited))))return true;
 return !spec.phase&&((ctx.data.state.completedTopics||[]).includes(p.id)||(p.task&&claimed(ctx,p.task)));
}
function currentPointId(ctx){
 const spec=presentation(ctx),list=journeyPoints(ctx),regions=new Set(visibleRegions(ctx).map(r=>r.id));
 const main=p=>!['daily','repair'].includes(p.kind)&&regions.has(p.region);
 const open=p=>{const entry=settings(ctx,p);if(entry.available!==undefined)return entry.available;return !(entry.archived??['mastered','partial','archive'].includes(entry.phase))&&!!lessonFor(ctx,p)&&prerequisiteIds(ctx,p).every(id=>completion(ctx,list.find(other=>other.id===id))||(ctx.data.state.completedTopics||[]).includes(id));};
 const pinned=list.find(p=>p.id===spec.currentPointId)||(spec.currentLessonId?list.find(p=>lessonFor(ctx,p)?.id===spec.currentLessonId):null);
 if(pinned){
  if(!completion(ctx,pinned))return pinned.id;
  // Follow declared learning edges only. Optional practice must not replace the next lesson.
  const routes=journeyRoutes(ctx).filter(r=>!r.side),visited=new Set([pinned.id]),queue=[pinned.id],candidates=[];
  while(queue.length){const id=queue.shift();for(const p of list.filter(p=>main(p)&&(routes.some(r=>r.from===id&&r.to===p.id)||prerequisiteIds(ctx,p).includes(id)))){
   if(visited.has(p.id))continue;visited.add(p.id);
   if(!completion(ctx,p)){if(open(p))candidates.push(p);continue;}
   queue.push(p.id);
  }}
  return candidates.length===1?candidates[0].id:pinned.id;
 }
 return (list.find(p=>main(p)&&open(p)&&!completion(ctx,p))||list.find(p=>main(p)&&open(p)))?.id;
}
export function describePoint(ctx,p){
 const spec=settings(ctx,p),isRepair=p.kind==='repair'&&!!(p.evidenceId||p.adaptive),isDaily=p.kind==='daily',lesson=lessonFor(ctx,p),completed=completion(ctx,p),current=p.id===currentPointId(ctx);
 const phase=spec.phase||(current?'current':'future'),archived=spec.archived??['mastered','partial','archive'].includes(phase);
 const requirements=prerequisiteIds(ctx,p).map(id=>{const other=journeyPoints(ctx).find(x=>x.id===id);return {id,name:other?.name||id,completed:completion(ctx,other)||(ctx.data.state.completedTopics||[]).includes(id)};});
 const available=spec.available??(isRepair||(!archived&&!!lesson&&requirements.every(r=>r.completed)));
 const taskId=current?lesson?.id||p.task:p.task||lesson?.id||null,task=(ctx.data.tasks||[]).find(t=>t.id===p.task||t.id===taskId),progress=lesson?lessonProgress(ctx,lesson.id):null;
 let amount=progress?.baseTotal??(task?Number(task.reward)||0:null),earned=completed,label=completed?'Награда получена':isRepair?'За завершение работы над ошибками':'За завершение урока';
 if(p.known){const records=(ctx.rules.courseHistory||[]).filter(e=>e.points?.includes(p.id)&&ctx.data.state.courseCredits?.[e.id]);if(records.length){amount=records.reduce((sum,e)=>sum+Number(ctx.data.state.courseCredits[e.id].reward??e.reward??0),0);earned=true;label='Уже начислено за прошлые работы';}}
 else if(progress){earned=progress.baseRemaining===0;label=progress.remaining?'Осталось получить':'Все награды получены';}
 const status=available?(isDaily?(completed?'На сегодня выполнено · завтра снова':'Сегодня доступно · около 5 минут'):completed?'Урок пройден · можно вернуться':isRepair?'Можно разобрать':progress?.started?'В процессе · '+progress.completedTasks+' / '+progress.totalTasks+' задач':current?'Следующий урок · можно начать':'Можно начать'):archived?(completed?'Пройдено · архив':phase==='partial'?'Изучали · практика частично':'Временно недоступно'):'Откроется позже';
 if(isDaily){amount=progress?.baseRemaining??(completed?0:Number(task?.reward)||0);earned=completed;label=completed?'Награда получена сегодня':'За сегодняшнее повторение';}
 return {completed,available,archived,current,isRepair,isDaily,lessonId:lesson?.id,phase:completed&&phase==='partial'?'mastered':phase,number:spec.number||p.number||'',status,progress,
 note:isDaily?spec.note||p.summary||'':progress?.started&&!completed?'Твой прогресс сохранён: '+progress.completedTasks+' / '+progress.totalTasks+' задач. Можно продолжить урок или вернуться к материалам.':completed&&phase==='partial'?'Работа над ошибками по этой теме прошла все тесты. Сложное место закрыто; материалы можно повторить.':spec.note||p.summary||'',description:spec.description||lesson?.description||task?.description||p.summary||'',requirements:available?[]:requirements,
 repairs:journeyPoints(ctx).filter(x=>x.kind==='repair'&&(x.evidenceId||x.adaptive)&&x.topic===p.id).map(x=>({id:x.id,name:x.name})),previousRepairs:previousRepairs(ctx,p),
 unlocks:journeyPoints(ctx).filter(x=>prerequisiteIds(ctx,x).includes(p.id)).map(x=>({id:x.id,name:x.name})),reward:{amount,earned,label,...(progress?{remaining:progress.remaining}:{})},taskId,
 actionLabel:spec.actionLabel||(available?(isDaily?(completed?'Повторить без награды':'Начать дэйлик'):completed?'Вернуться к материалам':isRepair?(progress?.started?'Продолжить разбор':'Разобрать ошибки'):progress?.started?'Продолжить урок'+(spec.number?' '+spec.number:''):'Начать урок'+(spec.number?' '+spec.number:'')):archived?'Архив · временно недоступно':'Урок ещё недоступен')};
}
export function journeyRoutes(ctx){const overrides=presentation(ctx).routeOverrides||{},routes=(ctx.data.courseMap?.routes||[]).filter(r=>!(overrides.remove||[]).some(([a,b])=>r.from===a&&r.to===b));return [...new Map([...routes,...(overrides.add||[]),...journeyPoints(ctx).filter(p=>p.kind==='repair'&&(p.evidenceId||p.adaptive)&&p.topic).map(p=>({from:p.topic,to:p.id,side:true}))].map(route=>[route.from+'|'+route.to,route])).values()];}
export function discoveredJourneyZones(ctx){return journeyPoints(ctx).filter(p=>{const d=describePoint(ctx,p);return p.kind==='teleport'&&(['mastered','partial'].includes(d.phase)||d.completed)||p.kind==='statue'&&d.completed;}).map(p=>({id:p.id,x:p.x*10,y:p.y*6.5,radius:p.kind==='statue'?225:92,kind:p.kind}));}
export function currentJourneyPoint(ctx){const points=journeyPoints(ctx);return points.find(p=>describePoint(ctx,p).current)||points.find(p=>{const d=describePoint(ctx,p);return d.available&&!d.completed;})||points.find(p=>describePoint(ctx,p).available)||points[0];}

export function lessonQualityText(ctx,lessonId){
 const lesson=ctx.data.lessons?.find(l=>l.id===lessonId);if(!lesson)return '';if(lesson.type==='daily')return lesson.reward+' примогемов и материалы за первое успешное повторение сегодня. Повторная проверка в тот же день не даёт награду.';if(lesson.type==='repair')return lesson.reward+' за выполненный разбор, без дополнительного бонуса.';
 const caps=(lesson.taskIds||[]).map(id=>Number(ctx.data.tasks?.find(t=>t.id===id)?.qualityCap??(id===lesson.finalTaskId||lesson.type==='exam'?20:lesson.qualityCap??10)));
 const ordinary=caps.filter((_,i)=>lesson.taskIds[i]!==lesson.finalTaskId),final=lesson.finalTaskId?caps[lesson.taskIds.indexOf(lesson.finalTaskId)]:null;
 if(final&&ordinary.length&&new Set(ordinary).size===1)return 'За качество — до '+ordinary[0]+' за обычную задачу и до '+final+' за мини-проект.';
 return caps.length?'За качество — до '+Math.max(...caps)+(caps.length===1?' за решение.':' за каждую задачу (смотри лимит в редакторе).'):'';
}
