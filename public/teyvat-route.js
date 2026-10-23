// Presentation only: never infer access, completion, rewards or prerequisites here.
export const TEYVAT_REGION_COUNT=8;
export const TEYVAT_PORTALS_PER_REGION=12;

const copy=value=>structuredClone(value);
const isBranch=node=>node.main===false&&Boolean(node.parentId);
const repairId=id=>'atlas-repair:'+encodeURIComponent(id);

/**
 * Map a program snapshot onto eight fixed geographic regions, with twelve slots each.
 * Coordinates are percentages. Region/block and node order come from their arrays.
 * Unoccupied slots are scenery; they do not become lessons or prerequisites.
 */
export function buildTeyvatRoute(data,atlasRegions,{pass:requestedPass=0}={}){
 if(!Array.isArray(atlasRegions)||atlasRegions.length!==TEYVAT_REGION_COUNT)throw new TypeError('The atlas needs exactly eight regions.');
 const regionIds=new Set();
 for(const region of atlasRegions){
  if(!region.id||regionIds.has(region.id)||!Array.isArray(region.portals)||region.portals.length!==TEYVAT_PORTALS_PER_REGION)throw new TypeError('Each atlas region needs a unique ID and twelve portals.');
  regionIds.add(region.id);
  for(const p of region.portals)if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>100||p.y<0||p.y>100)throw new TypeError('Portal coordinates must be percentages within the atlas.');
 }
 const program=data?.program||{},blocks=program.blocks||[],nodes=program.nodes||[];
 const hidden=new Set(program.excluded||[]);
 const visible=node=>!node.excluded&&!hidden.has(node.id);
 const blockFor=node=>node.blockId||blocks.find(block=>block.nodeIds?.includes(node.id))?.id;
 const passesCount=Math.max(1,Math.ceil(blocks.length/TEYVAT_REGION_COUNT));
 const pass=Math.min(passesCount-1,Math.max(0,Number.isInteger(requestedPass)?requestedPass:0));
 const nodeById=new Map(nodes.map(node=>[node.id,node]));
 const passFor=(node,visited=new Set())=>{
  // A practice branch follows its parent even when its own block field is absent.
  if(isBranch(node)&&nodeById.has(node.parentId)&&!visited.has(node.id))return passFor(nodeById.get(node.parentId),new Set(visited).add(node.id));
  const index=blocks.findIndex(block=>block.id===blockFor(node));
  return index<0?0:Math.floor(index/TEYVAT_REGION_COUNT);
 };
 const passes=Array.from({length:passesCount},(_,index)=>({index,label:'Проход '+(index+1)+(blocks.length?' · блоки '+(index*TEYVAT_REGION_COUNT+1)+'–'+Math.min(blocks.length,(index+1)*TEYVAT_REGION_COUNT):''),blockIds:blocks.slice(index*TEYVAT_REGION_COUNT,(index+1)*TEYVAT_REGION_COUNT).map(block=>block.id),nodeIds:nodes.filter(node=>visible(node)&&passFor(node)===index).map(node=>node.id)}));
 const regions=atlasRegions.map((region,index)=>{const block=blocks[pass*TEYVAT_REGION_COUNT+index];return {...copy(region),blockId:block?.id||null,blockTitle:block?.title||'',pointIds:[]};});
 const slots=regions.flatMap(region=>region.portals.map((p,index)=>({id:region.id+':portal:'+String(index+1).padStart(2,'0'),region:region.id,index,x:p.x,y:p.y,nodeId:null})));
 const points=[],overflow=[],mainOrder=[],handled=new Set();
 const overflowNode=(node,reason)=>{overflow.push({...copy(node),nodeId:node.id,overflowReason:reason});handled.add(node.id);};
 blocks.forEach((block,blockIndex)=>{
  if(Math.floor(blockIndex/TEYVAT_REGION_COUNT)!==pass)return;
  const regionIndex=blockIndex%TEYVAT_REGION_COUNT;
  // Excluded stages retain their empty slot, keeping later portal positions stable.
  const stages=nodes.filter(node=>!isBranch(node)&&blockFor(node)===block.id);
  stages.forEach((node,index)=>{
   if(!visible(node)){handled.add(node.id);return;}
   mainOrder.push(node.id);
   if(index>=TEYVAT_PORTALS_PER_REGION){overflowNode(node,'region-capacity');return;}
   const region=regions[regionIndex],slot=slots[regionIndex*TEYVAT_PORTALS_PER_REGION+index];
   const point={...copy(node),blockId:block.id,nodeId:node.id,region:region.id,slotId:slot.id,x:slot.x,y:slot.y,kind:node.kind||'lesson',current:node.id===program.nextId};
   slot.nodeId=node.id;region.pointIds.push(node.id);points.push(point);handled.add(node.id);
  });
 });
 const primaryPoints=[...points],pointById=new Map(points.map(point=>[point.id,point]));
 // One visible repair branch per lesson. Every underlying repair stays selectable.
 for(const parent of primaryPoints){
  const members=nodes.filter(node=>visible(node)&&isBranch(node)&&node.parentId===parent.id&&node.kind==='repair');
  if(!members.length)continue;
  const first=members[0],id=repairId(parent.id),allDone=members.every(node=>node.completed);
  const point={...copy(first),id,nodeId:first.id,title:members.length===1?first.title:'Разборы к теме «'+parent.title+'»',kind:'repair',parentId:parent.id,region:parent.region,slotId:null,x:Math.min(99,parent.x+1.3),y:Math.min(99,parent.y+1.5),members:copy(members),sourceNodeIds:members.map(node=>node.id),completed:allDone,status:allDone?'done':'repair',available:members.some(node=>node.available),current:members.some(node=>node.id===program.nextId)};
  points.push(point);regions.find(region=>region.id===parent.region).pointIds.push(id);
  members.forEach(node=>handled.add(node.id));
 }
 for(const node of nodes){
  if(!visible(node)||handled.has(node.id)||passFor(node)!==pass)continue;
  overflowNode(node,isBranch(node)?'side-branch':'unassigned');
 }
 // These are geographic itinerary edges, never the prerequisite graph.
 const routes=[];
 let previous=null,skipped=[];
 for(const id of mainOrder){
  const point=pointById.get(id);
  if(!point){skipped.push(id);continue;}
  if(previous)routes.push({from:previous.id,to:id,side:false,skippedNodeIds:[...skipped]});
  previous=point;skipped=[];
 }
 for(const point of points.filter(point=>point.kind==='repair'&&point.members))routes.push({from:point.parentId,to:point.id,side:true,skippedNodeIds:[]});
 return {regions,slots,points,routes,overflow,passesCount,pass,passes};
}
