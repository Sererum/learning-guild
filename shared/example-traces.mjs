import {createHash} from 'node:crypto';

export const exampleCodeHash=code=>createHash('sha256').update(code).digest('hex');

// Only demonstrated examples are eligible. Task inputs, starters and private
// references are never executed or modified by this metadata attachment.
export function collectExamples(course) {
 const seen=new WeakSet(),examples=[];
 const skipped=new Set(['tasks','tests','starter','referenceCode','wrongVariants','executionTrace']);
 const visit=value=>{
  if(!value||typeof value!=='object'||seen.has(value))return;
  seen.add(value);
  if(value.example&&typeof value.example==='object'&&typeof value.example.code==='string'&&value.example.code.trim())examples.push(value.example);
  for(const [key,child]of Object.entries(value))if(!skipped.has(key))visit(child);
 };
 visit(course);
 return [...new Set(examples)];
}

function verifiedTrace(trace,code) {
 const lineCount=code.split('\n').length;
 return trace?.complete===true&&Array.isArray(trace.frames)&&trace.frames.length>0&&trace.frames.every(frame=>
  Number.isSafeInteger(frame.line)&&frame.line>=1&&frame.line<=lineCount&&
  Number.isSafeInteger(frame.occurrence)&&frame.occurrence>=1&&frame.event==='after'&&
  frame.variables&&typeof frame.variables==='object'&&!Array.isArray(frame.variables)&&typeof frame.output==='string');
}

export function attachExampleTraces(course,cache) {
 if(cache?.schemaVersion!==1||!cache.traces||typeof cache.traces!=='object')throw Error('Неизвестный формат проверенных трассировок примеров.');
 let attached=0,missing=0;
 for(const example of collectExamples(course)){
  const trace=cache.traces[exampleCodeHash(example.code)];
  if(!verifiedTrace(trace,example.code)){delete example.executionTrace;missing++;continue;}
  example.executionTrace=structuredClone(trace);
  attached++;
 }
 return {attached,missing};
}
