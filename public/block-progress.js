// Shared interpretation of mandatory block stages. No course or learner IDs.
export function requiredBlockStages(nodes,blockId){return nodes.filter(n=>n.blockId===blockId&&n.main!==false&&!n.parentId&&!n.excluded);}
export function finalBlockExam(nodes,blockId){const stages=requiredBlockStages(nodes,blockId),last=stages.at(-1);return last&&last.kind==='exam'?last:null;}
export function blockAccessRequirements(nodes,blocks,node){
 if(node.main===false||node.parentId||node.kind==='diagnostic')return [];
 const index=blocks.findIndex(b=>b.id===node.blockId),required=[];
 for(let i=index-1;i>=0;i--){const previous=requiredBlockStages(nodes,blocks[i].id);if(!previous.length)continue;const final=finalBlockExam(nodes,blocks[i].id);required.push(...(final?[final.id]:previous.map(n=>n.id)));break;}
 if(finalBlockExam(nodes,node.blockId)?.id===node.id)required.push(...requiredBlockStages(nodes,node.blockId).filter(n=>n.id!==node.id).map(n=>n.id));
 return [...new Set(required)];
}
