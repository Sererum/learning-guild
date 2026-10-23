import test from 'node:test';
import assert from 'node:assert/strict';
import {lessonRewardAccess,describePoint} from '../public/journey.js';
import {createEngine} from '../shared/engine-core.mjs';
import {learningCourseFixture} from './learning-course-fixture.mjs';
import {renderSettings,bindSettings} from '../public/pages/settings.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('preview notice agrees with reward engine for all/any claims and course credits',()=>{
 const course=learningCourseFixture(),taskId=course.lessons[0].taskIds[0],lessonId=course.lessons[0].id;
 course.engineConfig.gates={entry:{allClaims:['required'],anyClaims:['exam'],anyCredits:['prior'],message:'Нужен предыдущий экзамен.'}};
 course.engineConfig.taskRules={[taskId]:{gate:'entry'}};
 const engine=createEngine(course);
 for(const claims of [{},{required:true},{exam:true},{required:true,exam:true}])for(const courseCredits of [{},{prior:{reward:0}}]){
  const state={claims,courseCredits},data={gameRules:course.engineConfig,lessons:course.lessons,state};
  const before=JSON.stringify(data),access=lessonRewardAccess(data,lessonId);
  assert.equal(access.preview,!engine.canStudyGate(state,'entry'));
  assert.deepEqual(access.messages,access.preview?['Нужен предыдущий экзамен.']:[]);
  assert.equal(JSON.stringify(data),before);
 }
 const data={gameRules:course.engineConfig,lessons:course.lessons,state:{claims:{}},presentation:{currentPointId:'p',points:{p:{available:true,number:'1'}}},tasks:[],courseMap:{regions:[{id:'r'}],points:[{id:'p',kind:'teleport',name:'Первый урок',region:'r',lessonId}],routes:[]}};
 const description=describePoint({data,rules:course.engineConfig},data.courseMap.points[0]);
 assert.equal(description.actionLabel,'Открыть предпросмотр 1');
 assert.match(description.status,/наград/);
});

test('AI help deep link opens real settings section; tab selection keeps selected account',()=>{
 const savedLocation=globalThis.location,savedHistory=globalThis.history;
 const address=new URL('http://127.0.0.1:55555/?account=practice&settings=generation#settings');
 globalThis.location={href:address.href,search:address.search};
 let destination;
 globalThis.history={state:null,replaceState(_state,_unused,url){destination=new URL(url);globalThis.location={href:destination.href,search:destination.search};}};
 try{
  const data={course:{title:'Тестовый курс',profileId:'default'},program:{enabled:false},reviewer:{enabled:false},settings:{}};
  const html=renderSettings({data,esc});
  assert.match(html,/aria-label="Подключение ИИ"/);
  assert.match(html,/Что делать, если ИИ недоступен/);
  assert.doesNotMatch(html,/профиль default/);
  const button={dataset:{settingsTab:'about'}},root={querySelector:()=>null,querySelectorAll:s=>s==='[data-settings-tab]'?[button]:[]};
  bindSettings(root,{data,refresh(){}});button.onclick();
  assert.equal(destination.searchParams.get('account'),'practice');
  assert.equal(destination.searchParams.get('settings'),'about');
  assert.match(renderSettings({data,esc}),/Личные интересы/);
 }finally{
  if(savedLocation===undefined)delete globalThis.location;else globalThis.location=savedLocation;
  if(savedHistory===undefined)delete globalThis.history;else globalThis.history=savedHistory;
 }
});
