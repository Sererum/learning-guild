// Equipment is attached in the character's coordinate space. Catalogue icons
// are deliberately not a fallback: an unprepared worn sprite is not wearable art.
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;
// Private images carry the account in their URL so simultaneous course tabs
// cannot accidentally fetch the other course's portrait. No other query is allowed.
export function isSafeEquipmentAssetUrl(value){
 if(typeof value!=='string'||value.includes('..'))return false;
 const match=/^\/assets\/[A-Za-z0-9_/-]+\.(?:png|webp|svg)(?:\?account=([a-z0-9]+(?:-[a-z0-9]+)*))?$/.exec(value);
 return !!match&&(!match[1]||match[1].length<=64);
}
const slotOf=item=>item.kind==='artifact'?item.slot:item.kind;
const layerOrder={behind:0,body:20,front:40,hand:80};
const layerValue=(value,fallback)=>layerOrder[value]??finite(value,fallback);

function placement(definition,anchor,resolveAsset){
 if(!definition||!anchor||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y))return null;
 const asset=resolveAsset(definition.asset,definition),width=finite(definition.width,0),height=finite(definition.height,0);
 if(!isSafeEquipmentAssetUrl(asset)||width<=0||height<=0)return null;
 const pivot=definition.pivot||[width/2,height/2];
 if(!Array.isArray(pivot)||pivot.length!==2||!pivot.every(Number.isFinite))return null;
 const scale=finite(definition.scale,1)*finite(anchor.scale,1);
 if(scale<=0)return null;
 return {asset,width,height,pivot,scale,x:anchor.x,y:anchor.y,
  angle:finite(anchor.angle,0)+finite(definition.rotation,0),layer:layerValue(definition.layer,20)};
}

/** Pure resolution allows art QA to inspect every outfit/item combination. */
export function resolveEquipmentLayers(state,catalog,manifest,{outfitId=state.equipped?.outfit,resolveAsset=(value,entry)=>entry.private?state.profileAssets?.[value]:value}={}){
 const outfit=manifest?.outfits?.[outfitId]||{},anchors={...manifest?.anchors,...outfit.anchors};
 const layers=[],issues=[],equipped=state.equipped||{};
 for(const [slot,id] of Object.entries(equipped)){
  if(slot==='outfit'||!id)continue;
  const item=catalog.find(candidate=>candidate.id===id&&slotOf(candidate)===slot);
  if(!item)continue;
  const definition=manifest?.items?.[id],anchorName=definition?.anchor||slot,anchor=anchors[anchorName];
  const placed=placement(definition,anchor,resolveAsset);
  if(!placed){issues.push({id,slot,reason:'missing-worn-art-or-anchor'});continue;}
  let hand=null;
  if(definition.grip){
   const gripDefinition=manifest?.grips?.[definition.grip],gripAnchor=anchors[gripDefinition?.anchor||anchorName],grip=placement(gripDefinition,gripAnchor,resolveAsset);
   if(grip)hand={...grip,id,slot,kind:'grip',anchor:gripDefinition.anchor||anchorName,layer:layerValue(gripDefinition.layer,80)};
   else {issues.push({id,slot,reason:'missing-grip-art'});continue;}
  }
  layers.push({...placed,id,slot,kind:'item',anchor:anchorName});
  if(hand)layers.push(hand);
 }
 layers.sort((a,b)=>a.layer-b.layer);
 return {layers,issues};
}

/** SVG children for an existing 480×700 character SVG; no layout CSS required. */
export function renderEquipmentLayers(state,catalog,manifest,options={}){
 const draw=layer=>{
  const [px,py]=layer.pivot;
  return `<g class="hero-worn-${layer.kind}" data-equipped-item="${escape(layer.id)}" data-equipped-slot="${escape(layer.slot)}" data-equipment-anchor="${escape(layer.anchor)}" transform="translate(${layer.x} ${layer.y}) rotate(${layer.angle}) scale(${layer.scale}) translate(${-px} ${-py})"><image href="${escape(layer.asset)}" width="${layer.width}" height="${layer.height}" preserveAspectRatio="xMidYMid meet"/></g>`;
 };
 const {layers}=resolveEquipmentLayers(state,catalog,manifest,options);
 return layers.filter(layer=>layer.layer<layerOrder.body).map(draw).join('')+(options.portrait||'')+layers.filter(layer=>layer.layer>=layerOrder.body).map(draw).join('');
}
