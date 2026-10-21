// Synthetic QA evidence only: no submitted work, learner feedback or personal dates.
// Tests opt into this checkpoint explicitly; production never imports it.
import fs from 'node:fs';
import path from 'node:path';
import alice from '../courses/alice-python/index.mjs';
import {applyCourseProfile} from '../shared/course-profile.mjs';
import {createEngine} from '../shared/engine-core.mjs';

export function syntheticCourseProfile(course=alice,{profileId='default'}={}){
 const catalog=course.engineConfig.historyCatalog||course.engineConfig.courseHistory||[];
 const known=new Set(course.engineConfig.courseMap.points.map(point=>point.id));
 const completedTopics=['variables','math','conditions'].filter(id=>known.has(id));
 const history=catalog.map(entry=>({id:entry.id,points:[...(entry.points||[])],...(entry.studiedPoints?{studiedPoints:[...entry.studiedPoints]}:{}),...(entry.points?.some(id=>completedTopics.includes(id))?{closed:entry.points.filter(id=>completedTopics.includes(id))}:{})}));
 const roadmap=Object.fromEntries(course.engineConfig.courseMap.points.map(point=>[point.id,{phase:completedTopics.includes(point.id)?'mastered':point.id===course.presentation.currentPointId?'current':point.kind==='teleport'?'partial':course.presentation.roadmap?.[point.id]?.phase||'archive',note:'Synthetic checkpoint for an isolated automated test.'}]));
 return {schemaVersion:1,courseId:course.id,profileId,history,presentation:{currentLessonId:course.presentation.currentLessonId,currentPointId:course.presentation.currentPointId,roadmap},normalization:{completedTopics}};
}
export function writeSyntheticCourseProfile(stateFile,course=alice,{profileId='default'}={}){
 const filename=path.join(path.dirname(stateFile),'course-state.json');fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,JSON.stringify(syntheticCourseProfile(course,{profileId}),null,2));return filename;
}
export function syntheticCourse(course=alice,options={}){return applyCourseProfile(course,syntheticCourseProfile(course,options),options);}
export function syntheticEngine(course=alice,options={}){return createEngine(syntheticCourse(course,options));}
