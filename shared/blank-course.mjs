import {catalog,banners,gameInitialState} from './game-config.mjs';

// A genuinely empty course. The application never supplies a learner's curriculum.
export function blankCourse({id='new-course',title='Новый курс',learnerName='Ученик',goal='',subject=''}={}) {
 return {id,manifest:{schemaVersion:1,id,title,learnerName,subject,runtime:'basic-python'},tasks:[],lessons:[],repairPoints:[],presentation:{},
  program:{schemaVersion:1,title,finish:goal,blocks:[],nodes:{}},adaptation:{schemaVersion:1,roadmap:[],rewards:{miniBlock:160,repair:40,reinforcement:160,exam:640,ordinaryQualityCap:10,finalQualityCap:20}},
  engineConfig:{catalog:structuredClone(catalog),banners:structuredClone(banners),initialState:{...structuredClone(gameInitialState),name:learnerName,currency:0,gold:0,books:0,petals:0,crystals:0},
   courseMap:{start:{id:'start',name:'Начало пути',x:10,y:50},regions:[{id:'learning-path',name:'Учебный путь',x:50,y:15}],points:[],routes:[]},taskRewards:{},taskRules:{},rewardGroups:[],historyCatalog:[],courseHistory:[],achievements:[],taskTopics:{},pointPrerequisites:{},statuePrerequisites:{},gates:{},qualityCaps:{},recurringTasks:[]}};
}
export default blankCourse();
