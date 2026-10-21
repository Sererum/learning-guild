export function hiddenCase(task,index){return task.tests[index]?.hidden===true||!!task.hiddenTests?.includes(index);}
export function caseDetails(task,index,revealed={}){const test=task.tests[index],hidden=hiddenCase(task,index)&&!revealed[task.id]?.includes(index);return {label:test.label,hidden,...(!hidden?{inputs:test.inputs,expected:test.expected}:{})};}
export function publicTestResult(task,result,revealed={}){
 return {...result,tests:result.tests?.map((test,index)=>{const details=caseDetails(task,index,revealed);return details.hidden?{label:test.label,ok:test.ok,hidden:true}:{...test,...details};})};
}
