import test from 'node:test';
import assert from 'node:assert/strict';

test('opening another lesson from the map survives reload and preserves unrelated address settings', async () => {
 const saved={window:globalThis.window,location:globalThis.location,history:globalThis.history};
 const storage=new Map(),state={panel:'map'};
 const data={course:{id:'routing-course'},lessons:[{id:'first',title:'Первый урок',taskIds:['first-task']},{id:'next',title:'Следующий урок',taskIds:['next-task']}],courseMap:{points:[{id:'next-point',lessonId:'next'}]}};
 const before=JSON.stringify(data);
 try {
  globalThis.window={guildStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}};
  globalThis.location=new URL('http://localhost/?lesson=first&task=first-task&settings=personal#world');
  globalThis.history={state,replaceState:(value,unused,url)=>{assert.equal(value,state);globalThis.location=new URL(url);}};
  const first=await import('../public/pages/lesson.js?routing-before');
  first.selectLesson('next-task','next-point',data);
  assert.equal(location.searchParams.get('lesson'),'next');
  assert.equal(location.searchParams.get('task'),'next-task');
  assert.equal(location.searchParams.get('settings'),'personal');
  assert.equal(location.hash,'#world');
  const reloaded=await import('../public/pages/lesson.js?routing-after');
  const html=reloaded.renderLesson({data,esc:String});
  assert.match(html,/lesson=next&task=next-task&point=next-point/);
  assert.equal(JSON.stringify(data),before);
 } finally {
  for(const [key,value] of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
 }
});

test('a deep link never selects a task belonging to a different lesson', async () => {
 const saved={window:globalThis.window,location:globalThis.location};
 try {
  globalThis.window={guildStorage:{getItem:()=>null,setItem(){}}};
  globalThis.location=new URL('http://localhost/?lesson=next&task=first-task#lesson');
  const module=await import('../public/pages/lesson.js?routing-foreign-task');
  const data={course:{id:'another-routing-profile'},lessons:[{id:'next',title:'Следующий урок',taskIds:['next-task']}],courseMap:{points:[{id:'next-point',lessonId:'next'}]}};
  const html=module.renderLesson({data,esc:String});
  assert.match(html,/lesson=next&task=next-task&point=next-point/);
  assert.doesNotMatch(html,/first-task/);
 } finally {
  for(const [key,value] of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;
 }
});
