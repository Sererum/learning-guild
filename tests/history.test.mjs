import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {syntheticEngine,writeSyntheticCourseProfile} from './course-profile-fixture.mjs';
const {initialState,importCourseHistory,courseHistory,earnedAchievements,pointRevealed,courseMap,act}=syntheticEngine();
import {createGuildServer} from '../server.mjs';

test('История: 7 обычных уроков и 6 корректирующих: импорт2.1a/2.3 без полного зачёта тем',()=>{
 const s=initialState();
 assert.equal(courseHistory.filter(x=>x.kind==='lesson').length,7);
 assert.equal(courseHistory.filter(x=>x.kind==='repair').length,6);
 assert.equal(importCourseHistory(s),1360);assert.equal(s.currency,1360);
 assert.equal(Object.keys(s.courseCredits).length,13);
 assert.deepEqual(s.visited,['variables','math','conditions','clean','index','for','accumulator','while']);
 assert.deepEqual(earnedAchievements(s).map(x=>x.id),['variables','math','conditions']);
 for(const id of s.visited)assert.equal(pointRevealed(s,courseMap.points.find(p=>p.id===id)),true);
 for(const id of ['keys','safe-get','frequency','unique','algorithms']){
  assert.equal(s.visited.includes(id),false);assert.equal(pointRevealed(s,courseMap.points.find(p=>p.id===id)),false);
 }
 assert.deepEqual(s.claims,{});assert.deepEqual(s.statues,[]);
});

test('Повторный перенос после трат и восстановления сохранения не выдаёт наград',()=>{
 const s=initialState();s.currency=73;s.visited=['keys'];s.claims.lesson=true;
 const inventory=structuredClone(s.inventory),claims=structuredClone(s.claims);
 importCourseHistory(s);assert.equal(s.currency,1433);
 act(s,{type:'wish',banner:'outfit'},'2026-10-16',()=>0);
 const restored=JSON.parse(JSON.stringify(s));assert.equal(importCourseHistory(restored),0);
 assert.equal(restored.currency,1273);assert.deepEqual(restored.claims,claims);
 assert.equal(restored.inventory.novice.count>=inventory.novice.count,true);
 assert.equal(restored.visited.includes('keys'),true);
 const partial=initialState();const entry=courseHistory[0];
 partial.courseCredits={[entry.id]:{reward:entry.reward}};
 assert.equal(importCourseHistory(partial),1200);
});

test('Сервер сохраняет перенос сразу и не повторяет его после перезапуска',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-history-'));const file=path.join(dir,'progress.json');
 const s=initialState();s.currency=29;s.inventory.flower.level=2;s.history=[{id:'old-drop'}];
 fs.writeFileSync(file,JSON.stringify(s));
 writeSyntheticCourseProfile(file);
 try{
  for(let i=0;i<2;i++){
   const server=createGuildServer({stateFile:file});
   await new Promise(r=>server.listen(0,'127.0.0.1',r));
   try{
    const state=(await(await fetch('http://127.0.0.1:'+server.address().port+'/api/state')).json()).state;
    assert.equal(state.currency,29);assert.equal(state.visited.length,8);assert.equal(Object.keys(state.courseCredits).length,13);
    assert.equal(state.inventory.flower.level,2);assert.deepEqual(state.history,[{id:'old-drop'}]);
    assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),state);
   }finally{await new Promise(r=>server.close(r));}
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
