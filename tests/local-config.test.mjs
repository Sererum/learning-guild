import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readLocalConfig,resolveCourseSettings,bindProfile,acquireProfileLock} from '../local-config.mjs';
import {createGuildServer} from '../server.mjs';
import starter from '../templates/starter-python/index.mjs';

const temporary = work => {const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-config-'));try{return work(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}};
test('Local paths stay machine-specific and changing course/profile ignores the previous save override',()=>temporary(root=>{
 fs.writeFileSync(path.join(root,'local.config.json'),JSON.stringify({courseId:'alice-python',profileId:'default',stateFile:'data/progress.json'}));
 assert.equal(readLocalConfig({root,env:{}}).stateFile,path.join(root,'data/progress.json'));
 for(const args of [['--course','starter-python'],['--profile','second']]) {
  const chosen=readLocalConfig({root,env:{},args});assert.equal(chosen.explicitStateFile,false);assert.match(chosen.stateFile,/profiles/);assert.ok(!chosen.stateFile.includes('data/progress.json'));
 }
 assert.throws(()=>readLocalConfig({root,env:{},args:['--profile','../outside']}));
 assert.throws(()=>readLocalConfig({root,env:{},args:['--port','bad']}));
 assert.throws(()=>readLocalConfig({root,env:{},args:['--unknown','x']}));
}));
test('External course paths use the actual loaded course ID for the default profile directory',()=>temporary(root=>{
 const chosen=readLocalConfig({root,env:{},args:['--course-dir','/tmp/my-course']});
 const resolved=resolveCourseSettings(chosen,{id:'statistics'});
 assert.match(resolved.stateFile,/profiles\/statistics\/default\/progress.json$/);assert.equal(resolved.courseId,'statistics');
 const explicit=readLocalConfig({root,env:{GUILD_STATE_FILE:path.join(root,'mine','progress.json')},args:['--course-dir','/tmp/my-course']});
 assert.equal(resolveCourseSettings(explicit,{id:'statistics'}).stateFile,explicit.stateFile);
}));
test('Profile binding rejects another course/profile without rewriting state',()=>temporary(root=>{
 const file=path.join(root,'progress.json');fs.writeFileSync(file,'unchanged');bindProfile(file,'alice-python','default');
 assert.throws(()=>bindProfile(file,'starter-python','default'),/другому/);assert.throws(()=>bindProfile(file,'alice-python','other'),/другому/);assert.equal(fs.readFileSync(file,'utf8'),'unchanged');
}));
test('A running profile admits one writer and releasing it admits the next',()=>temporary(root=>{
 const file=path.join(root,'progress.json'),release=acquireProfileLock(file);
 assert.throws(()=>acquireProfileLock(file),/уже открыт/);release();release();
 const again=acquireProfileLock(file);again();
}));
test('Server closes release the profile lock; a duplicate launch cannot persist an older state',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guild-profile-lock-')),stateFile=path.join(dir,'progress.json');
 let first,second;
 try{
  first=createGuildServer({course:starter,stateFile,reviewProvider:'off'});await new Promise(r=>first.listen(0,'127.0.0.1',r));
  assert.throws(()=>createGuildServer({course:starter,stateFile,reviewProvider:'off'}),/уже открыт/);
  await new Promise(r=>first.close(r));first=null;
  second=createGuildServer({course:starter,stateFile,reviewProvider:'off'});await new Promise(r=>second.listen(0,'127.0.0.1',r));
 }finally{if(first)await new Promise(r=>first.close(r));if(second)await new Promise(r=>second.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
