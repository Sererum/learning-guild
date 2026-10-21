import {sourceCourse,adaptationFixtureProvider} from './adaptation-fixtures.mjs';
import {catalog,banners,gameInitialState} from '../shared/game-config.mjs';

// Synthetic contract fixture, deliberately separate from Alice's curriculum.
export function learningCourseFixture(){
 const course=sourceCourse();
 course.manifest={...course.manifest,schemaVersion:1,title:'Проверка адаптации',learnerName:'Тестовый профиль'};
 course.tasks=course.tasks.map(task=>({...task,reward:0,hints:[],tag:'Техническая проверка'}));
 course.lessons=course.lessons.map(lesson=>({...lesson,reward:0,cheatsheet:[],pitfalls:[],resources:[],sections:lesson.sections.map(section=>({...section,title:'Теория · Проверка результата',paragraphs:['Технический пример временного профиля. Сохрани `value` в `answer` и выведи результат.']}))}));
 course.engineConfig={catalog,banners,initialState:{...gameInitialState,name:'Тестовый профиль'},courseHistory:[],achievements:[],taskRules:{},
  taskRewards:Object.fromEntries(course.tasks.map(task=>[task.id,0])),rewardGroups:[],taskTopics:{},qualityCaps:{},recurringTasks:[],
  pointPrerequisites:{'source-point':null,'future-point':'source-point'},statuePrerequisites:{'future-point':['source-point']},
  courseMap:{...course.engineConfig.courseMap,routes:[{from:'start',to:'source-point'},{from:'source-point',to:'future-point'}],
   regions:[{id:'fixture',name:'Технический регион',x:40,y:15}],points:course.engineConfig.courseMap.points.map(point=>({...point,name:point.id==='source-point'?'Проверка исходного урока':'Будущий экзамен',kind:point.id==='source-point'?'teleport':'statue'}))}};
 return course;
}
export {adaptationFixtureProvider};
