import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startCodexReview} from '../codex-reviewer.mjs';

test('Adaptive Codex uses machine events without persisting model text; ordinary review keeps its launch mode',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-codex-events-'));
 fs.writeFileSync(path.join(directory,'package.json'),JSON.stringify({type:'module'}));
 fs.writeFileSync(path.join(directory,'exec'),`import fs from 'node:fs';
const args=process.argv.slice(2),out=args[args.indexOf('--output-last-message')+1];
fs.writeFileSync(out,JSON.stringify({ok:true}));
fs.writeFileSync(out+'.args',JSON.stringify(args));
if(args.includes('--json'))for(const event of [
 {type:'thread.started',thread_id:'private-thread'},
 {type:'item.completed',item:{type:'agent_message',text:'PRIVATE_MODEL_TEXT'}},
 {type:'item.completed',item:{type:'command_execution',command:'PRIVATE_COMMAND',aggregated_output:'PRIVATE_OUTPUT'}},
 {type:'turn.completed',usage:{input_tokens:42,output_tokens:7,reasoning_output_tokens:3,secret:'PRIVATE_USAGE'}}
])process.stdout.write(JSON.stringify(event)+'\\n');
process.stderr.write('PRIVATE_ERROR_BODY');
process.stdin.resume();
`);
 const launch=async jsonEvents=>{
  const name=jsonEvents?'adaptive':'ordinary',resultFile=path.join(directory,name+'.json'),statusFile=path.join(directory,name+'-status.json');
  const child=startCodexReview({executable:process.execPath,prompt:'Private learner data',effort:'medium',schema:{type:'object'},schemaFile:path.join(directory,name+'-schema.json'),resultFile,statusFile,cwd:directory,timeoutMs:4000,noTools:jsonEvents,jsonEvents});
  await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  return {status:JSON.parse(fs.readFileSync(statusFile)),args:JSON.parse(fs.readFileSync(resultFile+'.args'))};
 };
 try{
  const adaptive=await launch(true);assert.equal(adaptive.status.status,'complete');assert.equal(adaptive.args.includes('--json'),true);
  for(const feature of ['shell_tool','apps','plugins'])assert.ok(adaptive.args.some((arg,i)=>arg==='--disable'&&adaptive.args[i+1]===feature));
  assert.ok(adaptive.args.includes('web_search="disabled"'));assert.ok(adaptive.args.includes('mcp_servers={}'));
  assert.equal(adaptive.status.telemetry.eventCount,4);assert.equal(adaptive.status.telemetry.lastEvent,'turn.completed');
  assert.deepEqual(adaptive.status.telemetry.usage,{input_tokens:42,output_tokens:7,reasoning_output_tokens:3});
  assert.ok(adaptive.status.telemetry.elapsedMs>=0);assert.equal(JSON.stringify(adaptive.status).includes('PRIVATE_'),false);
  const ordinary=await launch(false);assert.equal(ordinary.status.status,'complete');assert.equal(ordinary.args.includes('--json'),false);assert.equal(ordinary.args.includes('--disable'),false);assert.equal(ordinary.status.telemetry,undefined);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
