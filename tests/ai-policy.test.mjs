import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {aiEffortPolicy,effortForTask} from '../ai-policy.mjs';
import {createGenerationControl} from '../generation-control.mjs';
import {startCodexReview} from '../codex-reviewer.mjs';

test('Lesson authors and curriculum planners use Extra high; tutors keep Medium without rewriting personal settings',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-ai-policy-'));
 try{
  const file=path.join(directory,'generation-settings.json');fs.writeFileSync(file,JSON.stringify({dailyCalls:7,dailyTokens:250000,custom:'preserve'}));const before=fs.readFileSync(file);
  const policy=createGenerationControl(directory).management().modelPolicy;
  assert.equal(aiEffortPolicy.lesson,'xhigh');assert.equal(aiEffortPolicy.program,'xhigh');assert.equal(aiEffortPolicy.tutor,'medium');
  assert.equal(policy.lessonEffort,'xhigh');assert.equal(policy.programEffort,'xhigh');assert.equal(policy.tutorEffort,'medium');
  assert.deepEqual(fs.readFileSync(file),before);assert.throws(()=>effortForTask('arbitrary'),/Неизвестный/);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('The requested effort is passed to the actual child process, with independent read-only execution and tools disabled',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-effort-cli-'));
 fs.writeFileSync(path.join(directory,'package.json'),JSON.stringify({type:'module'}));
 fs.writeFileSync(path.join(directory,'exec'),`import fs from 'node:fs';const args=process.argv.slice(2),out=args[args.indexOf('--output-last-message')+1];fs.writeFileSync(out,JSON.stringify({args}));process.stdin.resume();`);
 try{
  for(const role of ['low','medium','high','xhigh']){
   const resultFile=path.join(directory,role+'.json'),statusFile=path.join(directory,role+'-status.json');
   const child=startCodexReview({executable:process.execPath,prompt:'Synthetic temporary QA only',effort:role,schema:{type:'object'},schemaFile:path.join(directory,role+'-schema.json'),resultFile,statusFile,cwd:directory,noTools:true,timeoutMs:4000});
   await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
   const status=JSON.parse(fs.readFileSync(statusFile)),{args}=JSON.parse(fs.readFileSync(resultFile));
   assert.equal(status.status,'complete');assert.equal(status.effort,role);assert.ok(args.includes('model_reasoning_effort="'+role+'"'));assert.ok(args.includes('read-only'));assert.ok(args.includes('mcp_servers={}'));assert.ok(args.includes('web_search="disabled"'));
  }
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
