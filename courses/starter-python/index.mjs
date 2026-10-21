import fs from 'node:fs';
import {catalog,banners,gameInitialState} from '../../shared/game-config.mjs';
export const manifest=JSON.parse(fs.readFileSync(new URL('./course.json',import.meta.url),'utf8'));
// A contract fixture, not a prepared ML curriculum or a learner assessment.
export const tasks=[{
 id:'starter-total',name:'Проверка подключения курса',tag:'Техническая проверка',minutes:1,reward:160,qualityCap:10,
 description:'В values находится список чисел. Сохрани их сумму в total и выведи total. Для пустого списка результат 0.',
 starter:'values = [2, 3]\n\n# Сохрани сумму в total и выведи её:\n',hints:['Используй уже знакомый способ сложения элементов списка.'],
 tests:[{label:'Два числа',inputs:{values:[2,3]},expected:{total:5}},{label:'Пустой список',inputs:{values:[]},expected:{total:0}},{label:'Отрицательное число',inputs:{values:[-2,7]},expected:{total:5}}],constraints:{requiredPrintVariables:['total']}
}];
export const lessons=[{
 id:'starter-lesson',title:'Технический пример',subtitle:'Проверка отдельного пакета',minutes:1,reward:160,qualityCap:10,
 taskIds:['starter-total'],sections:[{id:'starter-theory',title:'Теория · Отдельный пакет курса',paragraphs:['Этот технический пример проверяет загрузку чужого набора уроков, карты и наград одним приложением. Это не программа обучения ML.'],taskIds:['starter-total']}],cheatsheet:[],pitfalls:[],resources:[]
}];
export const repairPoints=[];
export const engineConfig={
 catalog,banners,initialState:{...gameInitialState,name:manifest.learnerName},
 courseMap:{start:{id:'start',name:'Начало',x:15,y:50},regions:[{id:'starter-region',name:'Технический регион',subtitle:'Проверка пакета',x:50,y:15}],routes:[{from:'start',to:'starter-point'}],points:[{id:'starter-point',kind:'teleport',region:'starter-region',name:'Проверка подключения курса',x:50,y:50,task:'starter-total',lessonId:'starter-lesson',summary:'Одна техническая задача для проверки загрузчика.'}]},
 taskRewards:{'starter-total':160},taskRules:{'starter-total':{}},rewardGroups:[],courseHistory:[],achievements:[],taskTopics:{'starter-total':['starter-point']},pointPrerequisites:{'starter-point':null},statuePrerequisites:{},gates:{},qualityCaps:{'starter-total':10},recurringTasks:[]
};
export default {id:manifest.id,manifest,engineConfig,tasks,lessons,repairPoints,activeLesson:lessons[0]};
