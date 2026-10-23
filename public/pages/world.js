import {requiredBlockStages,finalBlockExam} from '../block-progress.js';
import {TEYVAT_TERRITORIES} from '../teyvat-territories.js';
import {mapIcon} from '../map-icons.js';
import {TEYVAT_ATLAS,ATLAS_REGIONS} from '../teyvat-atlas.js';
import {buildTeyvatRoute} from '../teyvat-route.js';

const labels={done:'Пройдено',repair:'Нужен разбор',ready:'Материал готов',future:'Впереди'};
const symbols={done:'✓',repair:'!',ready:'◆',future:'◇'};
const view={scope:null,pass:0,selected:null,drawerOpen:false,x:0,y:0,zoom:1,initialized:false};
const passCameras=new Map();
function switchPass(pass){
 passCameras.set(view.pass,{x:view.x,y:view.y,zoom:view.zoom,initialized:view.initialized});
 Object.assign(view,{pass,selected:null,drawerOpen:false},passCameras.get(pass)||{x:0,y:0,zoom:1,initialized:false});
}
const status=node=>Object.hasOwn(labels,node.status)?node.status:'future';
const pointPixels=p=>({x:p.x/100*TEYVAT_ATLAS.width,y:p.y/100*TEYVAT_ATLAS.height});
export function blockStatues(atlas){
 return atlas.regions.filter(r=>r.blockId).flatMap(r=>{
  const required=requiredBlockStages([...atlas.points,...atlas.overflow],r.blockId);if(!required.length)return [];
  const exam=finalBlockExam(required,r.blockId),complete=required.every(n=>n.completed),missing=required.filter(n=>n.id!==exam?.id&&!n.completed),examAvailable=!!exam?.available&&!missing.length&&!exam.blockMissing?.length;
  return [{...(exam||{}),id:'atlas-statue:'+r.blockId,kind:'statue',blockId:r.blockId,examNodeId:exam?.id||null,sourceNodeId:exam?.id||null,title:exam?'Итоговое испытание · '+r.blockTitle:'Завершение блока · '+r.blockTitle,region:r.id,x:r.x-3.5,y:r.y+3,completed:complete,status:complete?'done':examAvailable?'ready':'future',available:examAvailable||complete,materials:exam?(exam.materials||[]).map(m=>({...m,available:examAvailable||complete})):[],missing:missing.map(n=>n.id),description:complete?'Все обязательные этапы завершены. Статуя активирована.':missing.length?'Сначала пройди: '+missing.map(n=>n.title).join('; ')+'.':exam?'Предыдущие уроки пройдены. '+(examAvailable?'Можно начать итоговое испытание.':'Материал испытания пока не подготовлен. Подготовь его в программе.'):'В этой программе отдельное итоговое испытание не предусмотрено. Статуя активируется после обязательных уроков.'}];
 });
}
const allPoints=atlas=>{const itinerary=worldItinerary(atlas),exams=new Set(blockStatues(atlas).map(p=>p.examNodeId));return [...itinerary.points,...atlas.overflow.filter(p=>!exams.has(p.id))];};
function configure(data){
 const scope=data.course?.storageScope||data.account?.id||data.course?.id||'default';
 if(scope!==view.scope){
  passCameras.clear();
  const pass=buildTeyvatRoute(data,ATLAS_REGIONS).passes?.find(p=>p.nodeIds.includes(data.program?.nextId))?.index||0;
  Object.assign(view,{scope,pass,selected:null,drawerOpen:false,x:0,y:0,zoom:1,initialized:false});
 }
}
function routeFor(data){
 configure(data);
 return buildTeyvatRoute(data,ATLAS_REGIONS,{pass:view.pass});
}
function currentPoint(data,atlas){
 const points=worldItinerary(atlas).points;return points.find(n=>n.current)||points.find(n=>n.available&&!n.completed)||points[0];
}
function materialButtons(node,e){
 const members=node.members||[node];
 return members.map(member=>{
  const materials=member.materials?.length?member.materials:member.lessonId?[{lessonId:member.lessonId,pointId:member.pointId,title:member.title,available:member.available}]:[];
  return materials.filter(m=>m.available&&m.lessonId).map(m=>`<button type="button" class="button primary world-open" data-world-open="${e(m.lessonId)}" data-world-origin="${e(m.pointId||'')}">${e(materials.length>1||members.length>1?m.title:node.kind==='statue'?'Открыть итоговое испытание':member.completed?'Открыть пройденный урок':'Открыть урок')} →</button>`).join('');
 }).join('');
}
export function detailCard(ctx,node,atlas){
 const e=ctx.esc,region=atlas.regions.find(r=>r.id===node.region),plan=node.lessonPlan?.length?node.lessonPlan:node.learningGoals||[];
 const members=node.members||[node],buttons=materialButtons(node,e),reason=node.openReason||node.prepareReason;
 return `<article class="world-detail" data-topic-card="${e(node.id)}"><p class="eyebrow">${e(region?.name||'Продолжение программы')}${region?.blockTitle?' · '+e(region.blockTitle):''}</p><h2 id="world-topic-title">${e(node.title)}</h2><p class="world-detail-status is-${status(node)}"><span aria-hidden="true">${symbols[status(node)]}</span> ${node.kind==='statue'?(node.completed?'Блок завершён':!node.examNodeId?'Блок ещё не завершён':node.available?'Итоговое испытание доступно':'Итоговое испытание закрыто'):labels[status(node)]}</p>${node.kind==='statue'&&node.description?`<p class="world-detail-note">${e(node.description)}</p>`:''}${plan.length?`<section><h3>Что будет в уроке</h3><ol>${plan.map(item=>`<li>${e(item)}</li>`).join('')}</ol></section>`:node.description&&node.kind!=='statue'?`<p>${e(node.description)}</p>`:'<p class="muted">Подробности и пожелания к этой теме — в твоей программе.</p>'}${members.length>1?`<section><h3>Разборы к этой теме</h3><ul>${members.map(m=>`<li>${e(m.title)} · ${labels[status(m)]}</li>`).join('')}</ul></section>`:''}${reason?`<p class="world-detail-note">${e(reason)}</p>`:''}<div class="world-detail-actions">${buttons}<button type="button" class="button secondary" data-world-program>Моя программа →</button></div>${!buttons&&node.kind!=='statue'?'<p class="world-detail-note">Посмотреть план, подготовить материал или изменить маршрут можно в программе.</p>':''}</article>`;
}
// Statues close each block; a final exam appears only here, never twice.
export function worldItinerary(atlas){
 const statues=blockStatues(atlas),byBlock=new Map(statues.map(p=>[p.blockId,p])),aliases=new Map(statues.filter(p=>p.examNodeId).map(p=>[p.examNodeId,p.id]));
 const points=[...atlas.points.filter(p=>!aliases.has(p.id)),...statues],original=new Map(atlas.points.map(p=>[p.id,p])),routes=[];
 for(const edge of atlas.routes){
  const from=original.get(edge.from),to=original.get(edge.to);let a=aliases.get(edge.from)||edge.from,b=aliases.get(edge.to)||edge.to;
  if(!edge.side&&from&&to&&from.blockId!==to.blockId&&byBlock.has(from.blockId))a=byBlock.get(from.blockId).id;
  if(a!==b)routes.push({...edge,from:a,to:b});
 }
 for(const statue of statues){if(statue.examNodeId&&atlas.points.some(p=>p.id===statue.examNodeId))continue;const last=atlas.points.filter(p=>p.blockId===statue.blockId&&!p.parentId&&p.main!==false).at(-1);if(last)routes.push({from:last.id,to:statue.id,side:false,skippedNodeIds:[]});}
 return {points,routes};
}
export function roadLayer(atlas,e){
 const itinerary=worldItinerary(atlas),lookup=new Map(itinerary.points.map(p=>[p.id,p]));
 return '<svg class="world-roads" viewBox="0 0 '+TEYVAT_ATLAS.width+' '+TEYVAT_ATLAS.height+'" aria-hidden="true">'+itinerary.routes.map(route=>{
  const from=lookup.get(route.from),to=lookup.get(route.to);if(!from||!to)return '';
  const a=pointPixels(from),b=pointPixels(to),dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,bend=Math.min(25,len*.1),d='M '+a.x+' '+a.y+' Q '+((a.x+b.x)/2-dy/len*bend)+' '+((a.y+b.y)/2+dx/len*bend)+' '+b.x+' '+b.y;
  return '<path class="world-trail '+(route.side?'is-side':'')+' '+(to.completed?'is-done':'')+' '+(route.skippedNodeIds?.length?'has-continuation':'')+'" data-road-from="'+e(from.id)+'" data-road-to="'+e(to.id)+'" d="'+d+'" vector-effect="non-scaling-stroke"/>';
 }).join('')+'</svg>';
}
// Completion selects authored paths; no start clearing or procedural geometry.
export function fogReveals(atlas){
 const territories=[],completedRegions=[];
 for(const region of atlas.regions){
  const geography=TEYVAT_TERRITORIES[region.id];if(!geography||!region.blockId)continue;
  const required=requiredBlockStages([...atlas.points,...atlas.overflow],region.blockId);
  if(required.length&&required.every(n=>n.completed)){completedRegions.push(region.id);territories.push({id:region.id+':complete',region:region.id,path:geography.outline,clip:geography.outline});continue;}
  for(const point of atlas.points.filter(p=>p.region===region.id&&p.completed&&p.main!==false&&!p.parentId&&p.kind!=='exam')){
   const slot=atlas.slots.find(s=>s.id===point.slotId),territory=geography.territories[slot?.index];
   if(territory)territories.push({id:territory.portalId,region:region.id,path:territory.path,clip:geography.outline});
  }
 }
 return {territories,completedRegions};
}
export function fogLayer(atlas){
 const {territories}=fogReveals(atlas),w=TEYVAT_ATLAS.width,h=TEYVAT_ATLAS.height,scale='scale('+(w/100)+' '+(h/100)+')',regions=[...new Set(territories.map(t=>t.region))];
 return '<svg class="world-fog" data-explored-lessons="'+atlas.points.filter(p=>!p.parentId&&p.main!==false&&p.completed).length+'" data-open-territories="'+territories.length+'" viewBox="0 0 '+w+' '+h+'" aria-hidden="true"><defs>'+regions.map(id=>'<clipPath id="territory-clip-'+id+'"><path d="'+TEYVAT_TERRITORIES[id].outline+'"/></clipPath>').join('')+'<pattern id="atlas-dark-stars" width="180" height="160" patternUnits="userSpaceOnUse"><circle cx="23" cy="31" r=".7" fill="#9db6c5" opacity=".14"/><circle cx="131" cy="109" r=".8" fill="#9db6c5" opacity=".18"/></pattern><filter id="atlas-fog-feather" filterUnits="userSpaceOnUse" x="-20" y="-20" width="'+(w+40)+'" height="'+(h+40)+'"><feGaussianBlur stdDeviation="1.6"/></filter><mask id="atlas-fog-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="'+w+'" height="'+h+'"><rect width="100%" height="100%" fill="white"/><g filter="url(#atlas-fog-feather)"><g transform="'+scale+'" fill="black">'+territories.map(t=>'<path d="'+t.path+'" clip-path="url(#territory-clip-'+t.region+')"/>').join('')+'</g></g></mask></defs><g mask="url(#atlas-fog-mask)"><rect width="100%" height="100%" fill="#101a26"/><rect width="100%" height="100%" fill="url(#atlas-dark-stars)"/></g></svg>';
}
function portal(p,e,current,atlas){
 const selected=p.id===view.selected&&view.drawerOpen,repair=p.kind==='repair'&&p.members,locked=!p.available&&!p.completed,attention=!repair&&atlas.points.some(n=>n.parentId===p.id&&n.kind==='repair'&&n.available&&!n.completed);
 return `<button type="button" class="world-point is-${status(p)} ${repair?'is-repair-branch':''} ${attention?'has-available-repair':''} ${selected?'is-selected':''} ${p.id===current?.id?'is-current':''}" style="left:${p.x}%;top:${p.y}%" data-world-point="${e(p.id)}" data-point-status="${status(p)}" aria-label="${e(p.title)} · ${attention?'Доступна работа над ошибками':labels[status(p)]}" aria-pressed="${selected}" aria-controls="world-quest-drawer" aria-expanded="${selected}"><span class="world-portal" aria-hidden="true">${mapIcon(repair?'repair':'teleport',{active:repair?!p.completed:p.completed,attention})}${locked?'<b class="world-lock">⌑</b>':p.completed?'<b class="world-check">✓</b>':''}</span><span class="world-point-caption">${e(p.title)}${attention?'<small>Доступна работа над ошибками</small>':''}</span></button>`;
}
function landmarks(atlas,data,e){
 const statues=blockStatues(atlas).map(p=>`<button type="button" class="world-landmark world-statue ${p.completed?'is-active':''}" style="left:${p.x}%;top:${p.y}%" data-world-select="${e(p.id)}" aria-label="Статуя Архонтов · ${e(p.title)} · ${p.completed?'Блок завершён':'Блок ещё не завершён'}">${mapIcon('statue',{active:p.completed})}${p.examNodeId&&!p.available&&!p.completed?'<b class="world-statue-lock" aria-hidden="true">⌑</b>':''}<span class="world-landmark-caption">Статуя Архонтов</span></button>`).join('');
 const today=data.daily?.today,point=today&&worldItinerary(atlas).points.find(p=>p.id===today.topicId||p.examNodeId===today.topicId),daily=point?`<button type="button" class="world-landmark world-daily-marker" style="left:${point.x+2.2}%;top:${point.y+2.4}%" data-world-daily aria-label="Дэйлик дня: ${e(today.title)}${today.status==='claimed'?' · Награда получена':''}">${mapIcon('daily',{active:today.status!=='claimed'})}${today.status==='claimed'?'<b>✓</b>':''}<span class="world-landmark-caption">Дэйлик дня</span></button>`:'';
 return statues+daily;
}
function overflowList(atlas,e){
 if(!atlas.overflow.length)return '';
 return `<details class="world-continuation"><summary>Продолжение и дополнительная практика · ${atlas.overflow.length}</summary><p>Все эти темы входят в программу. Выбери любую, чтобы посмотреть план и материалы.</p><ol>${atlas.overflow.map(n=>`<li><button type="button" data-world-select="${e(n.id)}" class="world-overflow-row is-${status(n)}" aria-controls="world-quest-drawer"><span aria-hidden="true">${symbols[status(n)]}</span><span>${e(n.title)}<small>${labels[status(n)]}</small></span><span aria-hidden="true">→</span></button></li>`).join('')}</ol></details>`;
}
export function render(ctx){
 const {data,esc:e}=ctx,atlas=routeFor(data);
 if(!allPoints(atlas).some(n=>n.id===view.selected)){view.selected=null;view.drawerOpen=false;}
 const current=currentPoint(data,atlas),selected=allPoints(atlas).find(n=>n.id===view.selected),nodes=(data.program?.nodes||[]).filter(n=>!n.excluded&&n.main!==false),done=nodes.filter(n=>n.completed).length;
 return `<section class="world-page"><header class="world-heading"><div><p class="eyebrow">ТВОЙ УЧЕБНЫЙ МАРШРУТ</p><h1>Карта мира</h1></div><p class="world-progress">${done} / ${nodes.length} <span>пройдено</span></p><button type="button" class="button secondary" data-world-program>Моя программа →</button></header><div class="world-layout"><section class="world-atlas" aria-label="Атлас Тейвата"><div class="world-map-toolbar">${atlas.passesCount>1?`<label class="world-pass-picker">Путешествие <select data-world-pass aria-label="Выбрать путешествие">${atlas.passes.map(p=>`<option value="${p.index}" ${p.index===atlas.pass?'selected':''}>${e(p.label)}</option>`).join('')}</select></label>`:''}<label class="world-region-picker">Регион <select data-world-region aria-label="Перейти к региону">${atlas.regions.map(r=>`<option value="${e(r.id)}" ${r.id===current?.region?'selected':''}>${e(r.name)}${r.blockTitle?' · '+e(r.blockTitle):''}</option>`).join('')}</select></label><button type="button" data-world-daily class="world-daily-link">${mapIcon('daily',{active:data.daily?.today?.status!=='claimed'})} Дэйлик дня</button><button type="button" data-world-current class="world-current-link">К текущему уроку ↗</button></div><div class="world-viewport" tabindex="0" aria-label="Карта: перетаскивай для перемещения, колёсико для масштаба, стрелки для движения"><div class="world-canvas" style="width:${TEYVAT_ATLAS.width}px;height:${TEYVAT_ATLAS.height}px;transform:translate(${view.x}px,${view.y}px) scale(${view.zoom});--world-inverse:${1/view.zoom}"><img class="world-map-image" src="${e(TEYVAT_ATLAS.image)}" width="${TEYVAT_ATLAS.width}" height="${TEYVAT_ATLAS.height}" alt="Географическая карта Тейвата" draggable="false">${fogLayer(atlas)}${roadLayer(atlas,e)}${atlas.regions.map(r=>`<div class="world-region" style="left:${r.x}%;top:${r.y}%"><strong>${e(r.name)}</strong>${r.blockTitle?`<span>${e(r.blockTitle)}</span>`:''}</div>`).join('')}${atlas.slots.filter(s=>!s.nodeId).map(s=>`<span class="world-empty-slot" style="left:${s.x}%;top:${s.y}%" data-world-slot="${e(s.id)}" aria-hidden="true"></span>`).join('')}${worldItinerary(atlas).points.filter(p=>p.kind!=='statue').map(p=>portal(p,e,current,atlas)).join('')}${landmarks(atlas,data,e)}</div><div class="world-map-help" aria-hidden="true">Перетаскивай карту · меняй масштаб</div></div><div class="world-map-bottom"><div class="world-legend">${[['teleport',true,'Урок пройден'],['teleport',false,'Не пройден'],['teleport',true,'Есть разбор',true],['repair',true,'Разбор'],['daily',true,'Дэйлик']].map(([kind,active,label,attention])=>`<span>${mapIcon(kind,{active,attention})}${label}</span>`).join('')}</div><div class="world-controls"><button type="button" data-world-zoom="-1" aria-label="Отдалить карту">−</button><output data-world-scale aria-label="Масштаб карты">${Math.round(view.zoom*100)}%</output><button type="button" data-world-zoom="1" aria-label="Приблизить карту">+</button><button type="button" data-world-overview aria-label="Показать весь Тейват" title="Весь Тейват">⛶</button></div></div></section><aside class="world-quest-drawer" id="world-quest-drawer" aria-labelledby="world-topic-title" ${view.drawerOpen&&selected?'':'hidden'}><header><span class="eyebrow">ВЫБРАННАЯ ТЕМА</span><button type="button" data-world-drawer-close aria-label="Закрыть описание">×</button></header><div class="world-drawer-scroll">${selected?detailCard(ctx,selected,atlas):''}</div></aside></div>${nodes.length?'':'<p class="world-empty-message">Пока здесь только Тейват. Создай свою программу — и на карте появится твой путь.</p>'}${overflowList(atlas,e)}<footer class="world-attribution"><a href="${e(TEYVAT_ATLAS.sourceUrl)}" target="_blank" rel="noopener noreferrer">Карта: ${e(TEYVAT_ATLAS.sourceName)}</a><span>${e(TEYVAT_ATLAS.copyright)}</span></footer></section>`;
}

// Coordinates are image pixels. The aspect ratio never depends on viewport size.
export function clampCamera(camera,width,height){
 const mapWidth=TEYVAT_ATLAS.width*camera.zoom,mapHeight=TEYVAT_ATLAS.height*camera.zoom,padding=70;
 return {...camera,x:mapWidth<=width?(width-mapWidth)/2:Math.min(padding,Math.max(width-mapWidth-padding,camera.x)),y:mapHeight<=height?(height-mapHeight)/2:Math.min(padding,Math.max(height-mapHeight-padding,camera.y))};
}
export function zoomCamera(camera,nextZoom,anchor){
 const zoom=Math.max(.16,Math.min(2.8,nextZoom)),ratio=zoom/camera.zoom;
 return {...camera,zoom,x:anchor.x-(anchor.x-camera.x)*ratio,y:anchor.y-(anchor.y-camera.y)*ratio};
}
const bindings=new WeakMap();
export function bind(root,ctx){
 bindings.get(root)?.();
 const atlas=routeFor(ctx.data),viewport=root.querySelector('.world-viewport'),canvas=root.querySelector('.world-canvas'),drawer=root.querySelector('.world-quest-drawer');
 if(!viewport||!canvas)return;
 const controller=new AbortController(),listen=(el,name,fn,options={})=>el?.addEventListener(name,fn,{...options,signal:controller.signal});
 const apply=()=>{Object.assign(view,clampCamera(view,viewport.clientWidth,viewport.clientHeight));canvas.style.transform=`translate(${view.x}px,${view.y}px) scale(${view.zoom})`;canvas.style.setProperty('--world-inverse',1/view.zoom);root.querySelector('[data-world-scale]').textContent=Math.round(view.zoom*100)+'%';};
 const focusLocation=(point,zoom)=>{const pos=pointPixels(point);view.zoom=zoom;view.x=viewport.clientWidth/2-pos.x*zoom;view.y=viewport.clientHeight/2-pos.y*zoom;apply();};
 const focusCurrent=()=>{const p=currentPoint(ctx.data,atlas)||atlas.regions[0];focusLocation(p,viewport.clientWidth<600?1.05:1.25);root.querySelector('[data-world-region]').value=p.region||p.id;};
 if(!view.initialized&&viewport.clientWidth){view.initialized=true;focusCurrent();}else apply();
 const openMaterial=(id,origin)=>{const nodes=(ctx.data.program?.nodes||[]),allowed=nodes.some(n=>(!n.blockMissing?.length||n.completed)&&((n.materials||[]).some(m=>m.available&&m.lessonId===id&&(m.pointId||'')===origin)||n.available&&n.lessonId===id&&(n.pointId||'')===origin));if(allowed)ctx.openLesson(id,origin||undefined);};
 const bindDrawer=()=>{
  drawer.querySelectorAll('[data-world-open]').forEach(b=>{b.onclick=()=>openMaterial(b.dataset.worldOpen,b.dataset.worldOrigin);});
  drawer.querySelectorAll('[data-world-program]').forEach(b=>{b.onclick=()=>ctx.navigate('program');});
 };
 const updateSelection=()=>{root.querySelectorAll('[data-world-point]').forEach(b=>{const selected=view.drawerOpen&&b.dataset.worldPoint===view.selected;b.classList.toggle('is-selected',selected);b.setAttribute('aria-pressed',String(selected));b.setAttribute('aria-expanded',String(selected));});};
 const select=id=>{const node=allPoints(atlas).find(n=>n.id===id);if(!node)return;view.selected=id;view.drawerOpen=true;drawer.hidden=false;drawer.querySelector('.world-drawer-scroll').innerHTML=detailCard(ctx,node,atlas);drawer.querySelector('.world-drawer-scroll').scrollTop=0;updateSelection();bindDrawer();if(atlas.overflow.some(n=>n.id===id))drawer.scrollIntoView({block:'nearest',behavior:'instant'});drawer.querySelector('[data-world-drawer-close]').focus({preventScroll:true});};
 const close=()=>{view.drawerOpen=false;drawer.hidden=true;updateSelection();[...root.querySelectorAll('[data-world-point],[data-world-select]')].find(b=>(b.dataset.worldPoint||b.dataset.worldSelect)===view.selected)?.focus({preventScroll:true});};
 let suppressClick=false;
 root.querySelectorAll('[data-world-point],[data-world-select]').forEach(b=>listen(b,'click',e=>{if(suppressClick){e.preventDefault();return;}select(b.dataset.worldPoint||b.dataset.worldSelect);}));
 root.querySelectorAll('[data-world-daily]').forEach(b=>listen(b,'click',()=>ctx.navigate('daily')));
 root.querySelectorAll('.world-heading [data-world-program]').forEach(b=>listen(b,'click',()=>ctx.navigate('program')));
 listen(root.querySelector('[data-world-drawer-close]'),'click',close);bindDrawer();
 listen(drawer,'keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
 const zoomAt=(zoom,anchor={x:viewport.clientWidth/2,y:viewport.clientHeight/2})=>{Object.assign(view,zoomCamera(view,zoom,anchor));apply();};
 root.querySelectorAll('[data-world-zoom]').forEach(b=>listen(b,'click',()=>zoomAt(view.zoom*(Number(b.dataset.worldZoom)>0?1.25:.8))));
 listen(root.querySelector('[data-world-current]'),'click',()=>{
  const pass=atlas.passes?.find(p=>p.nodeIds.includes(ctx.data.program?.nextId))?.index||0;
  if(pass!==view.pass){switchPass(pass);view.initialized=false;root.innerHTML=render(ctx);bind(root,ctx);root.querySelector('[data-world-current]')?.click();return;}else focusCurrent();
  const next=atlas.overflow.find(n=>n.id===ctx.data.program?.nextId);if(next)select(next.id);
 });
 listen(root.querySelector('[data-world-pass]'),'change',e=>{switchPass(Number(e.target.value));root.innerHTML=render(ctx);bind(root,ctx);});
 listen(root.querySelector('[data-world-region]'),'change',e=>{const region=atlas.regions.find(r=>r.id===e.target.value);if(region)focusLocation(region,viewport.clientWidth<600?.8:1);});
 listen(root.querySelector('[data-world-overview]'),'click',()=>{view.zoom=Math.max(.16,Math.min(viewport.clientWidth/TEYVAT_ATLAS.width,viewport.clientHeight/TEYVAT_ATLAS.height));view.x=view.y=0;apply();});
 listen(viewport,'wheel',e=>{e.preventDefault();const box=viewport.getBoundingClientRect(),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?viewport.clientHeight:1);zoomAt(view.zoom*Math.exp(-delta*.0015),{x:e.clientX-box.left,y:e.clientY-box.top});},{passive:false});
 const pointers=new Map();let gesture=null;
 const snapshot=()=>{const p=[...pointers.values()],a=p[0],b=p[1];gesture=a?{x:view.x,y:view.y,zoom:view.zoom,cx:b?(a.x+b.x)/2:a.x,cy:b?(a.y+b.y)/2:a.y,distance:b?Math.hypot(b.x-a.x,b.y-a.y):0}:null;};
 listen(viewport,'pointerdown',e=>{if(e.button!==0&&e.pointerType==='mouse')return;suppressClick=false;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});snapshot();});
 listen(viewport,'pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const p=[...pointers.values()],a=p[0],b=p[1],cx=b?(a.x+b.x)/2:a.x,cy=b?(a.y+b.y)/2:a.y;if(Math.hypot(cx-gesture.cx,cy-gesture.cy)>5||b){suppressClick=true;viewport.setPointerCapture(e.pointerId);viewport.classList.add('is-dragging');}if(!suppressClick)return;if(b&&gesture.distance){const box=viewport.getBoundingClientRect(),next=zoomCamera(gesture,gesture.zoom*Math.hypot(b.x-a.x,b.y-a.y)/gesture.distance,{x:gesture.cx-box.left,y:gesture.cy-box.top});Object.assign(view,{zoom:next.zoom,x:next.x+cx-gesture.cx,y:next.y+cy-gesture.cy});}else{view.x=gesture.x+cx-gesture.cx;view.y=gesture.y+cy-gesture.cy;}apply();});
 const finish=e=>{pointers.delete(e.pointerId);snapshot();if(!pointers.size){viewport.classList.remove('is-dragging');setTimeout(()=>{suppressClick=false;},0);}};
 listen(viewport,'pointerup',finish);listen(viewport,'pointercancel',finish);listen(viewport,'lostpointercapture',finish);
 listen(viewport,'keydown',e=>{if(e.key==='Escape'&&view.drawerOpen){close();return;}if(e.target!==viewport)return;const movement={ArrowLeft:[70,0],ArrowRight:[-70,0],ArrowUp:[0,70],ArrowDown:[0,-70]}[e.key];if(movement){e.preventDefault();view.x+=movement[0];view.y+=movement[1];apply();}else if(['+','=','-'].includes(e.key)){e.preventDefault();zoomAt(view.zoom*(e.key==='-'?.8:1.25));}else if(e.key==='Home'){e.preventDefault();focusCurrent();}});
 const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{if(!root.isConnected){resize.disconnect();return;}apply();}):null;resize?.observe(viewport);
 bindings.set(root,()=>{controller.abort();resize?.disconnect();});
}
