import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {inflateSync} from 'node:zlib';
import {catalog as currentCatalog} from '../shared/game-config.mjs';
import {equipmentManifest as currentManifest} from '../public/equipment-manifest.js';
import {resolveEquipmentLayers,renderEquipmentLayers} from '../public/equipment-scene.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const requireThat=(condition,message)=>{if(!condition)throw Error(message);};
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};

/** Inspect only; never rewrites or recompresses images. Solid bounds use alpha≥250. */
export function inspectRaster(buffer){
 if(buffer.length>=33&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){
  const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20),depth=buffer[24],color=buffer[25],alpha=[4,6].includes(color);
  requireThat(width>0&&height>0,'PNG имеет пустые размеры');
  let solidBounds=null,transparentPixels=null;
  if(alpha&&depth===8&&buffer[28]===0){
   const channels=color===6?4:2,stride=width*channels;
   requireThat((stride+1)*height<128*1024*1024,'PNG слишком велик для проверки');
   const chunks=[];for(let offset=8;offset+12<=buffer.length;){const length=buffer.readUInt32BE(offset);requireThat(offset+12+length<=buffer.length,'Повреждён PNG chunk');if(buffer.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(buffer.subarray(offset+8,offset+8+length));offset+=12+length;}
   const raw=inflateSync(Buffer.concat(chunks),{maxOutputLength:(stride+1)*height});requireThat(raw.length===(stride+1)*height,'Повреждены пиксели PNG');
   let previous=Buffer.alloc(stride);const bounds={x:width,y:height,right:-1,bottom:-1};transparentPixels=0;
   for(let y=0;y<height;y++){
    const offset=y*(stride+1),filter=raw[offset],row=Buffer.allocUnsafe(stride);requireThat(filter<=4,'Неизвестный PNG filter');
    for(let i=0;i<stride;i++){const a=i>=channels?row[i-channels]:0,b=previous[i],c=i>=channels?previous[i-channels]:0;row[i]=(raw[offset+1+i]+(filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c)))&255;}
    for(let x=0;x<width;x++){const a=row[x*channels+channels-1];if(a===0)transparentPixels++;if(a>=250){bounds.x=Math.min(bounds.x,x);bounds.y=Math.min(bounds.y,y);bounds.right=Math.max(bounds.right,x);bounds.bottom=y;}}
    previous=row;
   }
   requireThat(bounds.right>=0,'PNG не содержит непрозрачного предмета');solidBounds=bounds;
  }
  return {format:'png',width,height,alpha,solidBounds,transparentPixels};
 }
 if(buffer.length>=30&&buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP'){
  for(let offset=12;offset+8<=buffer.length;){
   const chunk=buffer.toString('ascii',offset,offset+4),length=buffer.readUInt32LE(offset+4),start=offset+8;requireThat(start+length<=buffer.length,'Повреждён WebP chunk');
   if(chunk==='VP8X')return {format:'webp',width:1+buffer.readUIntLE(start+4,3),height:1+buffer.readUIntLE(start+7,3),alpha:!!(buffer[start]&16),solidBounds:null};
   if(chunk==='VP8L'){requireThat(buffer[start]===47,'Повреждён WebP lossless');const bits=buffer.readUInt32LE(start+1);return {format:'webp',width:(bits&16383)+1,height:((bits>>>14)&16383)+1,alpha:!!((bits>>>28)&1),solidBounds:null};}
   offset=start+length+(length%2);
  }
 }
 throw Error('Нужен проверяемый PNG с alpha или WebP с alpha');
}

function sceneBounds(layer,bounds){
 const r=layer.angle*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
 const points=[[bounds.x,bounds.y],[bounds.right,bounds.y],[bounds.x,bounds.bottom],[bounds.right,bounds.bottom]].map(([x,y])=>{x=(x-layer.pivot[0])*layer.scale;y=(y-layer.pivot[1])*layer.scale;return {x:layer.x+x*c-y*s,y:layer.y+x*s+y*c};});
 return {x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))};
}

export function checkEquipmentArt({catalog=currentCatalog,manifest=currentManifest,appRoot=root,profileAssets}={}){
 const images=new Map(),ids=new Set(catalog.map(item=>item.id));requireThat(ids.size===catalog.length,'В каталоге повторяются ID');
 requireThat(manifest.schemaVersion===1&&manifest.poseId,'Неизвестная версия manifest или отсутствует poseId');
 requireThat(manifest.canvas?.width>0&&manifest.canvas?.height>0,'Не задан размер сцены');
 const outfits=catalog.filter(i=>i.kind==='outfit'),items=catalog.filter(i=>i.kind!=='outfit');
 for(const item of outfits){const entry=manifest.outfits[item.id];requireThat(entry?.poseId===manifest.poseId,item.id+': наряд не привязан к общей позе');requireThat(/^[A-Za-z0-9_-]+\.png$/.test(entry.asset),item.id+': небезопасный путь наряда');
  if(profileAssets){const image=inspectRaster(fs.readFileSync(path.join(profileAssets,entry.asset)));requireThat(image.width===manifest.portrait.width&&image.height===manifest.portrait.height&&image.alpha&&image.transparentPixels!==0,item.id+': портрет должен совпадать с размерами позы и иметь alpha');}
 }
 for(const item of items){
  const entry=manifest.items[item.id];requireThat(entry,item.id+': отсутствует надетый слой');requireThat(/^\/assets\/[A-Za-z0-9_/-]+\.(png|webp)$/.test(entry.asset)&&!entry.asset.includes('..'),item.id+': небезопасный путь');
  const anchor=manifest.anchors[entry.anchor];requireThat(finitePoint(anchor),item.id+': отсутствует точка крепления');
  requireThat(entry.width>0&&entry.height>0&&Array.isArray(entry.pivot)&&entry.pivot.length===2&&entry.pivot.every(Number.isFinite)&&Number.isFinite(entry.scale)&&entry.scale>0,item.id+': неверная геометрия');
  requireThat(entry.pivot[0]>=0&&entry.pivot[0]<=entry.width&&entry.pivot[1]>=0&&entry.pivot[1]<=entry.height,item.id+': pivot вне изображения');
  const image=inspectRaster(fs.readFileSync(path.join(appRoot,'public',entry.asset.slice(1))));requireThat(image.width===entry.width&&image.height===entry.height,item.id+': размеры изображения не совпадают с manifest');requireThat(image.alpha&&image.transparentPixels!==0,item.id+': отсутствует прозрачность');images.set(item.id,image);
  if(item.kind==='weapon')requireThat(entry.layer==='behind'&&entry.occlusion==='portrait-closed-fist'||entry.grip,item.id+': нет перекрытия рукояти рукой');
 }
 for(const id of Object.keys(manifest.items))requireThat(ids.has(id),id+': слой не соответствует предмету каталога');
 const slot=item=>item.kind==='artifact'?item.slot:item.kind;
 const slots=['weapon','flower','feather','clock','accessory'].map(name=>({name,items:items.filter(i=>slot(i)===name)}));
 for(const group of slots)requireThat(group.items.length,group.name+': пустой слот');
 let combinations=0,solidChecks=0;
 const inspect=(state)=>{
  const result=resolveEquipmentLayers(state,catalog,manifest);requireThat(!result.issues.length,'Сочетание не удалось собрать: '+JSON.stringify(result.issues));requireThat(result.layers.filter(l=>l.kind==='item').length===slots.length,'Пропал один из надетых предметов');
  for(const layer of result.layers){requireThat([layer.x,layer.y,layer.angle,layer.scale,...layer.pivot].every(Number.isFinite),'Нечисловой transform');const image=images.get(layer.id);if(image?.solidBounds){const b=sceneBounds(layer,image.solidBounds);requireThat(b.x>=0&&b.y>=0&&b.right<=manifest.canvas.width&&b.bottom<=manifest.canvas.height,layer.id+': непрозрачная часть за границами сцены '+JSON.stringify(b));solidChecks++;}}
  combinations++;
 };
 const visit=(index,equipped)=>{if(index===slots.length){inspect({equipped});return;}const group=slots[index];for(const item of group.items)visit(index+1,{...equipped,[group.name]:item.id});};
 for(const outfit of outfits)visit(0,{outfit:outfit.id});
 const sample={equipped:Object.fromEntries(slots.map(g=>[g.name,g.items[0].id]))};sample.equipped.outfit=outfits[0]?.id;
 const rendered=renderEquipmentLayers(sample,catalog,manifest,{portrait:'<g id="checked-portrait"/>'}),portraitAt=rendered.indexOf('id="checked-portrait"');
 for(const weapon of slots.find(g=>g.name==='weapon').items){const value=renderEquipmentLayers({...sample,equipped:{...sample.equipped,weapon:weapon.id}},catalog,manifest,{portrait:'<g id="checked-portrait"/>'});requireThat(value.indexOf(manifest.items[weapon.id].asset)<value.indexOf('id="checked-portrait"')||manifest.items[weapon.id].grip,weapon.id+': оружие должно перекрываться персонажем');}
 requireThat(portraitAt>=0,'Потерян портрет');
 return {catalogItems:catalog.length,outfits:outfits.length,wornItems:items.length,combinations,solidChecks,profilePortraits:profileAssets?outfits.length:0,limits:'Непрозрачные границы измерены для PNG; WebP проверены по заголовку. Визуальная проверка хвата и перекрытий нужна отдельно.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const args=process.argv.slice(2);requireThat(!args.length||args.length===2&&args[0]==='--profile-assets','Использование: node tools/check-equipment-art.mjs [--profile-assets /путь/к/assets]');const result=checkEquipmentArt({profileAssets:args[1]});console.log(JSON.stringify(result,null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
