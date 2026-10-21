import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createGuildServer} from '../server.mjs';
import {equipmentManifest} from '../public/equipment-manifest.js';
import {browserOptions} from '../tests/browser-runtime.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const usage='Usage: node tools/render-equipment-preview.mjs --profile-assets /absolute/approved/assets --out /absolute/qa-output';

function argumentsFor(args){
 const values={};
 for(let i=0;i<args.length;i+=2){const key=args[i];if(!['--profile-assets','--out'].includes(key)||!args[i+1]||values[key])throw Error(usage);values[key]=args[i+1];}
 if(!values['--profile-assets']||!values['--out'])throw Error(usage);
 return {assets:path.resolve(values['--profile-assets']),out:path.resolve(values['--out'])};
}

function copyApprovedAssets(source,destination){
 const approved=new Set(Object.values(equipmentManifest.outfits).filter(x=>x.private).map(x=>x.asset));
 for(const grip of Object.values(equipmentManifest.grips||{}))if(grip.private)approved.add(grip.asset);
 fs.mkdirSync(destination,{recursive:true});
 for(const name of approved){
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}\.png$/.test(name))throw Error('Unsafe approved asset name: '+name);
  const file=path.join(source,name),stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink())throw Error('Expected an ordinary PNG file: '+name);
  fs.copyFileSync(file,path.join(destination,name));
 }
 return [...approved];
}

export async function renderEquipmentPreview({assets,out}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'guild-equipment-preview-')),stateFile=path.join(directory,'progress.json');
 let server,browser;
 try{
  const copied=copyApprovedAssets(assets,path.join(directory,'assets'));
  server=createGuildServer({stateFile,profileId:'equipment-preview',importHistory:false,reviewProvider:'off',learningProvider:'off',sharedReviewProvider:'off'});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  const {chromium}=createRequire(import.meta.url)('playwright');browser=await chromium.launch(browserOptions());
  const page=await browser.newPage({viewport:{width:1640,height:950},deviceScaleFactor:1}),errors=[],failed=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)failed.push(response.status()+' '+new URL(response.url()).pathname);});
  await page.goto(origin+'/#hero');await page.locator('.hero-avatar').waitFor();
  const snapshot=await(await page.request.get(origin+'/api/state')).json(),outfits=snapshot.catalog.filter(x=>x.kind==='outfit');
  const groups=[['weapons','Оружие',snapshot.catalog.filter(x=>x.kind==='weapon')],['artifacts','Артефакты',snapshot.catalog.filter(x=>x.kind==='artifact')],['accessories','Украшения',snapshot.catalog.filter(x=>x.kind==='accessory')]];
  const files=[],counts={outfits:outfits.length};
  fs.mkdirSync(out,{recursive:true});

  async function draw(name,title,cells,{columns=outfits.length,closeup=false}={}){
   await page.evaluate(async({title,cells,columns,closeup,state,catalog})=>{
    const {avatar}=await import('/pages/hero.js');
    const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    document.body.innerHTML='<style>html,body{margin:0;background:#17263c;color:#f6ecd5;font:12px system-ui;max-width:none}*{box-sizing:border-box}.qa-sheet{padding:16px;width:fit-content}.qa-sheet h1{font:22px Georgia,serif;margin:0 0 7px}.qa-sheet p{color:#aebfd3;margin:0 0 14px}.qa-grid{display:grid;grid-template-columns:repeat('+columns+','+(closeup?'270':'174')+'px);gap:6px}.qa-cell{border:1px solid #69829566;background:radial-gradient(ellipse at 50% 45%,#344b61,#1c2e46);border-radius:6px;text-align:center;overflow:hidden}.qa-cell header{min-height:32px;padding:6px 3px;color:#dfcb9a;line-height:1.3}.qa-body{height:'+(closeup?'240':'258')+'px;overflow:hidden;position:relative}.hero-avatar{display:block;position:relative;width:100%;height:100%;margin:0;filter:none}.qa-close .hero-avatar{position:absolute;width:960px;height:1480px;max-width:none;left:-670px;top:-450px}.qa-cell footer{min-height:26px;padding:5px;color:#bbcedd;font-size:10px}</style><main class="qa-sheet"><h1>'+escape(title)+'</h1><p>Проверка слоёв настоящим рендерером персонажа · временный профиль</p><section class="qa-grid">'+cells.map(cell=>'<article class="qa-cell"><header>'+escape(cell.item||'Комплект')+'</header><div class="qa-body '+(closeup?'qa-close':'')+'">'+avatar({...state,equipped:cell.equipped},catalog)+'</div><footer>'+escape(cell.outfit)+'</footer></article>').join('')+'</section></main>';
    await document.fonts.ready;
    const urls=[...new Set([...document.querySelectorAll('svg image')].map(image=>image.getAttribute('href')).filter(Boolean))];
    await Promise.all(urls.map(url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=resolve;image.onerror=()=>reject(Error('Image did not load: '+url));image.src=url;})));
   },{title,cells,columns,closeup,state:snapshot.state,catalog:snapshot.catalog});
   await page.locator('.qa-sheet').screenshot({path:path.join(out,name+'.png')});files.push(name+'.png');
  }

  for(const [name,title,items]of groups){
   counts[name]=items.length;
   const cells=items.flatMap(item=>outfits.map(outfit=>({item:item.id,outfit:outfit.id,equipped:{outfit:outfit.id,[item.kind==='artifact'?item.slot:item.kind]:item.id}})));
   await draw(name,title+' × наряды',cells);
  }
  const bySlot=slot=>snapshot.catalog.filter(item=>(item.kind==='artifact'?item.slot:item.kind)===slot);
  await draw('all-slots','Полные комплекты · все слоты одновременно',outfits.map((outfit,index)=>{
   const equipped={outfit:outfit.id};for(const slot of ['weapon','accessory','flower','feather','clock']){const options=bySlot(slot);if(options.length)equipped[slot]=options[index%options.length].id;}
   return {item:Object.values(equipped).filter(id=>id!==outfit.id).join(' · '),outfit:outfit.id,equipped};
  }));
  const weapons=bySlot('weapon'),first=outfits[0];
  await draw('grips-closeup','Крупный план хвата · оружие за пальцами',weapons.map(item=>({item:item.id,outfit:first.id,equipped:{outfit:first.id,weapon:item.id}})),{columns:Math.min(weapons.length,4),closeup:true});
  if(errors.length||failed.length)throw Error(JSON.stringify({errors,failed}));
  const report={renderer:'public/pages/hero.js:avatar',profile:'isolated temporary equipment-preview',canvas:equipmentManifest.canvas||{width:480,height:700},counts,approvedAssetCount:copied.length,files,errors,failed};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({out,...report},null,2));return report;
 }finally{
  await browser?.close();
  if(server)await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections?.();});
  fs.rmSync(directory,{recursive:true,force:true});
 }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{await renderEquipmentPreview(argumentsFor(process.argv.slice(2)));}catch(error){console.error(error.message);process.exitCode=1;}
}
