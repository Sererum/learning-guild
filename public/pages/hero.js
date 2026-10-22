import {itemArt} from './item-art.js';
import {neutralCharacter} from './hero-equipment.js';
import {renderEquipmentLayers,isSafeEquipmentAssetUrl} from '../equipment-scene.js';
import {equipmentManifest} from '../equipment-manifest.js';
import {bindResourceGuide} from './resource-guide.js';
let heroSection = 'attributes';
let inventoryFilter = 'all';
let selectedItem = null;
let wardrobeType = 'outfit';
let onlyOwned = true;
let trainingTarget = 'character';
let selectedBanner = 'outfit';
let portraitCounter = 0;
const labels = {outfit:'Наряды',artifact:'Артефакты',accessory:'Украшения',weapon:'Оружие'};
const stars = n => '★'.repeat(n);
const slotNames = {weapon:'Оружие',outfit:'Наряд',accessory:'Украшение',flower:'Цветок',feather:'Перо',clock:'Часы'};
const tabs = [['attributes','Характеристики','attributes'],['weapon','Оружие','quill'],['artifacts','Артефакты','flower'],['wardrobe','Гардероб','novice']];
const artPath = '/assets/alice-scholar-v1.png';
const safe = value => String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const profileImage = (state,name) => {
 const url=state.profileAssets?.[name];
 return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}\.png$/.test(name)&&isSafeEquipmentAssetUrl(url)&&url.split('?')[0]==='/assets/'+name?url:null;
};
const neutralPortrait = () => '<g class="hero-neutral-portrait"><circle cx="240" cy="320" r="157" fill="#f7f1df" fill-opacity=".12" stroke="#d9bd83" stroke-opacity=".55"/><path d="M135 394 204 227 337 350 135 394 290 446 337 350" fill="none" stroke="#d9bd83" stroke-opacity=".7" stroke-width="2"/><g fill="#d9bd83"><circle cx="135" cy="394" r="5"/><circle cx="204" cy="227" r="5"/><circle cx="337" cy="350" r="5"/><circle cx="290" cy="446" r="5"/></g><circle cx="240" cy="320" r="68" fill="#f7f1df"/><image href="/assets/nav-hero.svg" x="192" y="272" width="96" height="96"/></g>';

const paintedIcon = (asset,className='') => `<img class="hero-painted-icon ${className}" src="/assets/${asset}" alt="" aria-hidden="true">`;
const heroTabIcon = (key,catalog) => ['attributes','appearance'].includes(key)?paintedIcon('nav-hero-painted-v1.png'):itemArt(catalog.find(x=>x.id===key),{decorative:true});
const materialArt = (m,catalog) => m.id==='books'?paintedIcon('heros-wit.png'):m.id.startsWith('fodder:')?itemArt(catalog.find(x=>x.id===m.id.slice(7)),{decorative:true}):paintedIcon('item-'+m.id+'-v1.webp');

const slotOf = item => item.kind==='artifact'?item.slot:item.kind;
const itemLevel = (s,item) => (s.inventory[item.id]?.level||0)+(item.kind==='artifact'?0:1);

const itemIcon = (item,state) => {
 const portrait=item.kind==='outfit'&&state?profileImage(state,equipmentManifest.outfits[item.id]?.asset):null;
 return `<span class="hero-item-icon" style="--item-color:${item.color}">${portrait?'<img class="hero-outfit-thumbnail" src="'+safe(portrait)+'" alt="" aria-hidden="true">':itemArt(item,{className:'hero-item-art',decorative:true})}</span>`;
};

// The sheet has unequal cell bounds. Nested SVGs crop it without modifying assets.
const wardrobeOrder=['novice','tea','sea','violet','cloud','moon','peony','aurora','ember'];
function wardrobeArt(state,cropId) {
 const source=profileImage(state,'alice-wardrobe-v2.png');
 if(!source)return null;
 const index=wardrobeOrder.indexOf(state.equipped?.outfit);
 if(index<0)return null;
 const x=(index%3)*1024/3,y=Math.floor(index/3)*512;
 return `<svg class="hero-wardrobe-crop" x="0" y="0" width="480" height="700" viewBox="${x} ${y} ${1024/3} 512" preserveAspectRatio="xMidYMax meet" overflow="hidden"><defs><clipPath id="${cropId}"><rect x="${x+14}" y="${y}" width="${1024/3-28}" height="512"/></clipPath><linearGradient id="${cropId}-edge" gradientUnits="userSpaceOnUse" x1="${x}" x2="${x+1024/3}"><stop offset=".05" stop-color="black"/><stop offset=".11" stop-color="white"/><stop offset=".89" stop-color="white"/><stop offset=".95" stop-color="black"/></linearGradient><mask id="${cropId}-edge-mask"><rect x="${x}" y="${y}" width="${1024/3}" height="512" fill="url(#${cropId}-edge)"/></mask></defs><image href="${safe(source)}" width="1024" height="1536" clip-path="url(#${cropId})" mask="url(#${cropId}-edge-mask)"/></svg>`;
}
function portraitArt(state) {
 const base=profileImage(state,artPath.slice('/assets/'.length));
 return base?`<image href="${safe(base)}" width="480" height="700" preserveAspectRatio="xMidYMax meet"/>`:neutralPortrait();
}

/** One consistent appearance; saved legacy appearance choices remain untouched. */
export function avatar(state,catalog,mini=false) {
 const id='profile-art-'+(++portraitCounter),outfit=catalog.find(x=>x.id===state.equipped?.outfit);
 const outfitColor=outfit?.color||'#829b87';
 const source=outfit?profileImage(state,equipmentManifest.outfits[outfit.id]?.asset):null;
 const dressed=source?`<image class="hero-painted-outfit" data-outfit="${safe(outfit.id)}" href="${safe(source)}" width="480" height="700" preserveAspectRatio="xMidYMax meet"/>`:null;
 const portrait=dressed||wardrobeArt(state,id+'-wardrobe')||portraitArt(state);
 const neutral=portrait.includes('hero-neutral-portrait');
 const figure=neutral?neutralCharacter({outfitColor,hairColor:'#a77a5a',skinColor:'#e7ba98',id}):portrait;
 const manifest=neutral?{...equipmentManifest,anchors:equipmentManifest.neutralAnchors}:equipmentManifest;
 const scene=source||neutral?renderEquipmentLayers(state,catalog,manifest,{portrait:figure}):figure;
 return `<svg class="hero-avatar${mini?' hero-avatar-mini':''}" viewBox="0 -20 480 740" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Персонаж · ${safe(outfit?.name||'Базовый наряд')}"><ellipse cx="240" cy="697" rx="125" ry="12" fill="#122038" opacity=".22"/>${scene}</svg>`;
}

function activeItem(ctx) {
  const {state:s,catalog}=ctx.data;
  const kind=heroSection==='weapon'?'weapon':heroSection==='artifacts'?'artifact':wardrobeType;
  const candidates=catalog.filter(x=>x.kind===kind&&(heroSection!=='artifacts'||inventoryFilter==='all'||x.slot===inventoryFilter));
  return candidates.find(x=>x.id===selectedItem)||candidates.find(x=>Object.values(s.equipped).includes(x.id))||candidates[0];
}
function equipmentCard(ctx,item) {
  const s=ctx.data.state,own=s.inventory[item.id],equipped=Object.values(s.equipped).includes(item.id);
  return `<button class="hero-inventory-card hero-rarity-${item.rarity}${selectedItem===item.id?' is-selected':''}${own?'':' is-locked'}" data-item="${item.id}" aria-pressed="${selectedItem===item.id}" aria-label="${ctx.esc(item.name)}${equipped?', надето':own?'':', пока нет в коллекции'}">${equipped?'<span class="hero-card-equipped">Надето</span>':''}${itemIcon(item,s)}<span class="hero-stars">${stars(item.rarity)}</span><b>${ctx.esc(item.name)}</b><span class="hero-card-level">${own?`${item.kind==='artifact'?'+':'Ур. '}${itemLevel(s,item)}${own.count>1?' · ×'+own.count:''}`:'Не получено'}</span></button>`;
}
function inventory(ctx) {
  const {state:s,catalog}=ctx.data;
  const kind=heroSection==='weapon'?'weapon':heroSection==='artifacts'?'artifact':wardrobeType;
  const all=catalog.filter(x=>x.kind===kind&&(heroSection!=='artifacts'||inventoryFilter==='all'||x.slot===inventoryFilter));
  const items=all.filter(x=>!onlyOwned||s.inventory[x.id]);
  return `<section class="hero-bag"><div class="hero-bag-heading"><div><p class="hero-overline">Коллекция</p><h3>${labels[kind]}</h3></div><span>${all.filter(x=>s.inventory[x.id]).length} / ${all.length}</span></div><div class="hero-bag-tools">${heroSection==='artifacts'?`<div class="hero-slot-filters" role="group" aria-label="Тип артефакта">${[['all','Все'],['flower','Цветок'],['feather','Перо'],['clock','Часы']].map(([id,label])=>`<button data-slot-filter="${id}" aria-pressed="${inventoryFilter===id}">${label}</button>`).join('')}</div>`:heroSection==='wardrobe'?`<div class="hero-slot-filters" role="group" aria-label="Категория гардероба"><button data-wardrobe="outfit" aria-pressed="${wardrobeType==='outfit'}">Наряды</button><button data-wardrobe="accessory" aria-pressed="${wardrobeType==='accessory'}">Украшения</button></div>`:'<span class="hero-bag-caption">Мечи, палочки и посохи</span>'}<label class="hero-owned-toggle"><input id="hero-owned-only" type="checkbox"${onlyOwned?' checked':''}> Только полученные</label></div><div class="hero-inventory">${items.length?items.map(x=>equipmentCard(ctx,x)).join(''):'<p class="hero-empty-inventory">В этом слоте пока нет находок. Сними фильтр, чтобы посмотреть коллекцию.</p>'}</div></section>`;
}
function statRows(ctx) {
  const {state:s,catalog}=ctx.data;
  const slots=['weapon','outfit','flower','feather','clock'];
  const base=s.level*2,stage=s.stage*10;
  return `<dl class="hero-stats"><div class="hero-stat-total"><dt>Резонанс</dt><dd>${ctx.rules.power(s)}</dd></div><div><dt>Уровень героини</dt><dd>${s.level} <small>/ ${s.stage?40:20}</small></dd></div><div><dt>Возвышение</dt><dd>${s.stage} <small>/ 1</small></dd></div><div><dt>Темы освоены</dt><dd>${ctx.rules.learnedPoints(s).length}</dd></div><div><dt>Вещей в коллекции</dt><dd>${catalog.filter(x=>s.inventory[x.id]).length}</dd></div></dl><details class="hero-stat-details"><summary>Подробные характеристики</summary><dl><div><dt>Базовый резонанс · уровень × 2</dt><dd>${base}</dd></div><div><dt>Возвышение</dt><dd>+${stage}</dd></div>${slots.map(slot=>{const x=catalog.find(x=>x.id===s.equipped[slot]);return `<div><dt>${ctx.esc(x?.name||slotNames[slot])}</dt><dd>+${ctx.rules.itemPower(s,x?.id)}</dd></div>`;}).join('')}</dl><p>Резонанс — сумма уровня, возвышения и надетых вещей. Украшения меняют образ.</p></details>`;
}
function panel(ctx) {
  const {state:s,catalog}=ctx.data,esc=ctx.esc;
  if(heroSection==='attributes')return `<p class="hero-overline">Странница знаний</p><h2>${esc(s.name)}</h2><span class="hero-stars">★★★★★</span><p class="hero-description">Внимательная исследовательница, которая превращает вопросы в понятные решения.</p>${statRows(ctx)}<div class="hero-exp-line"><span>Опыт героини</span><b>${s.characterXp||0} / 500</b><progress value="${s.characterXp||0}" max="500"></progress></div><button class="button hero-primary" data-train="character">${s.level>=(s.stage?40:20)?'Предел уровня':'Повысить уровень'}</button><button class="button hero-secondary" data-open-ascend>${s.stage?'Возвышение открыто':'Возвысить героиню'}</button><button class="button hero-secondary" data-resource-guide>Где взять материалы?</button>`;
  const item=activeItem(ctx);
  if(!item)return '<h2>Коллекция пуста</h2>';
  const own=s.inventory[item.id],equipped=s.equipped[slotOf(item)]===item.id;
  return `<p class="hero-overline">${slotNames[slotOf(item)]}</p><div class="hero-featured-item hero-rarity-${item.rarity}">${itemIcon(item,s)}</div><h2>${esc(item.name)}</h2><span class="hero-stars">${stars(item.rarity)}</span><dl class="hero-stats"><div><dt>Резонанс вещи</dt><dd>${own?ctx.rules.itemPower(s,item.id):item.power}</dd></div><div><dt>Уровень</dt><dd>${own?`${item.kind==='artifact'?'+':''}${itemLevel(s,item)}`:'—'}</dd></div><div><dt>Количество</dt><dd>${own?.count||0}</dd></div><div><dt>Слот</dt><dd>${slotNames[slotOf(item)]}</dd></div></dl><p class="hero-description">${item.kind==='outfit'?'Примерь наряд на персонаже. Чтобы сохранить выбор, нажми «Надеть». Усиление добавляет резонанс.':item.kind==='accessory'?'Личный штрих образа. Украшение закрепляется на волосах или одежде и не расходует материалы.':item.kind==='weapon'?'Мечи, палочки и посохи усиливают резонанс. Примерь оружие и нажми «Надеть», чтобы сохранить выбор. Усиление рудой увеличивает его резонанс.':'Реликвия путешествий. Усиление пылью или свободными обычными артефактами увеличивает резонанс.'}</p>${own?`<button class="button hero-primary" data-equip="${item.id}"${equipped?' disabled':''}>${equipped?'✓ Сейчас надето':'Надеть'}</button>${item.kind!=='accessory'?`<button class="button hero-secondary" data-train="${item.id}">Усилить</button>`:''}`:'<span class="hero-unowned-note">Эта вещь ещё не получена</span><button class="button hero-primary" data-to-wishes>Открыть молитвы ↗</button>'}`;
}
function upgradeDialog(ctx) {
  const {state:s}=ctx.data;
  const target=ctx.rules.enhancementTarget(s,trainingTarget);
  const mats=ctx.rules.materialOptions(s,trainingTarget);
  const atCap=target.level>=target.cap;
  return `<dialog class="hero-upgrade-dialog" id="hero-upgrade-dialog" aria-labelledby="hero-upgrade-title"><header><div><p class="hero-overline">${target.kind==='character'?'Повышение уровня':'Усиление снаряжения'}</p><h2 id="hero-upgrade-title">${ctx.esc(target.name)}</h2></div><button class="hero-dialog-close" data-close-dialog aria-label="Закрыть">×</button></header><div class="hero-upgrade-body"><section class="hero-upgrade-materials"><div class="hero-material-heading"><h3>Материалы опыта</h3><button class="hero-text-button" id="hero-auto-materials"${atCap?' disabled':''}>До следующего уровня</button></div><p class="hero-description">Выбери количество. Материалы и монеты спишутся после подтверждения.</p><div class="hero-material-grid">${mats.map(m=>`<label class="hero-material-card${m.count?'':' is-empty'}"><span class="hero-material-art">${materialArt(m,ctx.data.catalog)}</span><b>${ctx.esc(m.name)}</b><small>Опыт +${m.xp} · есть ${m.count}</small><input type="number" data-material="${m.id}" aria-label="Количество: ${ctx.esc(m.name)}" min="0" max="${Math.min(999,m.count)}" step="1" value="0"${!m.count||atCap?' disabled':''}></label>`).join('')}</div><button type="button" class="hero-text-button" data-resource-guide>Где взять материалы и мору?</button><p class="hero-material-protection">Экипированные артефакты и одна копия выбранной реликвии защищены от расхода.</p></section><section class="hero-upgrade-preview" id="hero-enhance-preview" aria-live="polite"><p class="hero-overline">Результат усиления</p><div class="hero-level-change">${target.level+target.offset}<span>→</span>${target.level+target.offset}</div><p>${atCap?target.kind==='character'&&!s.stage?'Достигнут предел. Открой возвышение, чтобы продолжить.':'Достигнут текущий предел уровня.':'Выбери материалы, чтобы увидеть новый уровень и точную стоимость.'}</p></section></div><footer><span><img class="resource-icon mora-icon" src="/assets/mora.png" width="24" height="24" alt="" aria-hidden="true"> Монеты: <b>${s.gold}</b></span><button class="button hero-secondary" data-close-dialog>Отмена</button><button class="button hero-primary" id="hero-confirm-enhance" disabled>Подтвердить усиление</button></footer></dialog>`;
}
function ascendDialog(ctx) {
  const s=ctx.data.state;
  const ready=s.level>=20&&s.crystals>=1&&s.petals>=2&&s.gold>=300&&!s.stage;
  return `<dialog class="hero-ascend-dialog hero-upgrade-dialog" id="hero-ascend-dialog" aria-labelledby="hero-ascend-title"><header><div><p class="hero-overline">Первое возвышение</p><h2 id="hero-ascend-title">За пределами знакомого</h2></div><button class="hero-dialog-close" data-close-dialog aria-label="Закрыть">×</button></header><div class="hero-ascend-body"><div class="hero-ascend-star">${paintedIcon('item-crystal-v1.webp')}</div><h3>${s.stage?'Возвышение уже открыто':'Предел уровня 20 → 40'}</h3><p>Возвышение добавляет 10 резонанса и звёздную ауру. Текущий уровень сохранится.</p><div class="hero-ascend-costs">${[[s.level,20,'Уровень'],[s.crystals,1,'Кристалл ясности'],[s.petals,2,'Лепестки памяти'],[s.gold,300,'Монеты']].map(([have,need,label])=>`<div class="${have>=need?'is-ready':''}"><span>${label}</span><b>${have} <small>/ ${need}</small></b><span>${have>=need?'✓ Достаточно':'Ещё нужно '+(need-have)}</span></div>`).join('')}</div><button type="button" class="hero-text-button" data-resource-guide>Где взять кристаллы, лепестки и мору?</button></div><footer><button class="button hero-secondary" data-close-dialog>Назад</button><button class="button hero-primary" id="hero-confirm-ascend"${ready?'':' disabled'}>${s.stage?'Открыто':'Возвысить · 300 монет'}</button></footer></dialog>`;
}
export function renderHero(ctx) {
  const {state:s,catalog}=ctx.data;
  if(trainingTarget!=='character'&&!s.inventory[trainingTarget])trainingTarget='character';
  const item=['weapon','artifacts','wardrobe'].includes(heroSection)?activeItem(ctx):null;
  if(item)selectedItem=item.id;
  const previewState={...s,equipped:{...s.equipped}};
  if(item)previewState.equipped[slotOf(item)]=item.id;
  const outfit=catalog.find(x=>x.id===previewState.equipped.outfit);
  return `<div class="hero-page hero-game${item?' is-equipping':''}" style="--hero-accent:${outfit?.color||'#74d8ed'}"><header class="hero-game-header"><div class="hero-character-title"><span class="hero-element-mark">${paintedIcon('nav-brand-painted-v1.png')}</span><div><p>Библиотека созвездий / Героиня</p><h1>${ctx.esc(s.name)}</h1></div></div></header><div class="hero-game-layout"><nav class="hero-inner-nav" aria-label="Разделы героини">${tabs.map(([id,label,icon])=>`<button data-hero-section="${id}" class="${heroSection===id?'is-active':''}" aria-current="${heroSection===id?'page':'false'}"><i>${heroTabIcon(icon,catalog)}</i><span>${label}</span>${heroSection===id?'<b class="hero-nav-selected" aria-hidden="true">•</b>':''}</button>`).join('')}<div class="hero-navigation-foot"><span>${paintedIcon('item-crystal-v1.webp')} ${s.stage?'I':'0'}</span><p>Возвышение<br><b>${s.stage?'Звёздный архив':'Первый путь'}</b></p></div></nav><section class="hero-stage" aria-label="Портрет героини"><div class="hero-stage-constellation" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div><div class="hero-stage-ring"></div><div class="hero-portrait-art"><div class="hero-showroom"><div class="hero-outfit-display">${avatar(previewState,catalog)}</div></div></div>${item?`<div class="hero-wearing-label ${s.equipped[slotOf(item)]===item.id?'is-equipped':'is-preview'}" role="status"><b>${s.equipped[slotOf(item)]===item.id?'✓ Надето':'Примерка · не надето'}</b><span>${ctx.esc(item.name)}</span>${s.equipped[slotOf(item)]!==item.id?`<small>Сейчас надето: ${ctx.esc(catalog.find(x=>x.id===s.equipped[slotOf(item)])?.name||'ничего')}</small>`:''}</div>`:''}<div class="hero-stage-caption"><p>${heroSection==='wardrobe'?'Гардероб странницы':heroSection==='artifacts'?'Реликвии путешествий':'Исследовательница кода'}</p><span>Уровень ${s.level} / ${s.stage?40:20}</span></div></section>${item?`<aside class="hero-loadout-console" aria-label="Выбор и примерка экипировки">${inventory(ctx)}<section class="hero-detail-panel" aria-label="Выбранный предмет">${panel(ctx)}</section></aside>`:`<aside class="hero-detail-panel">${panel(ctx)}</aside>`}</div>${upgradeDialog(ctx)}${ascendDialog(ctx)}</div>`;
}
const heroBindings=new WeakMap();
export function bindHero(root,ctx) {
  const game=root.querySelector('.hero-page');
  if(!heroBindings.has(game))bindResourceGuide(game,ctx);
  heroBindings.get(game)?.abort();const controller=new AbortController();heroBindings.set(game,controller);
  const listen=(element,event,handler)=>element?.addEventListener(event,handler,{signal:controller.signal});
  const rerender=()=>{
    const page=document.getElementById('page'),top=page.scrollTop,y=window.scrollY;
    const positions=['.hero-loadout-console','.hero-bag','.hero-inventory','.hero-detail-panel'].map(selector=>({selector,x:game.querySelector(selector)?.scrollLeft||0,y:game.querySelector(selector)?.scrollTop||0}));
    game.outerHTML=renderHero(ctx);bindHero(root,ctx);
    for(const p of positions){const element=root.querySelector(p.selector);if(element){element.scrollLeft=p.x;element.scrollTop=p.y;}}
    page.scrollTop=top;window.scrollTo({top:y,behavior:'instant'});
  };
  const preview=()=>{
    const page=document.getElementById('page'),top=page.scrollTop,y=window.scrollY,template=document.createElement('template');template.innerHTML=renderHero(ctx);
    for(const selector of ['.hero-outfit-display','.hero-wearing-label','.hero-detail-panel']){
      const old=game.querySelector(selector),next=template.content.querySelector(selector);if(old&&next)old.replaceWith(next);
    }
    for(const card of game.querySelectorAll('[data-item]')){const active=card.dataset.item===selectedItem;card.classList.toggle('is-selected',active);card.setAttribute('aria-pressed',String(active));}
    bindHero(root,ctx);page.scrollTop=top;window.scrollTo({top:y,behavior:'instant'});
  };
  const run=async action=>{
    const page=document.getElementById('page'),top=page.scrollTop,y=window.scrollY;
    const positions=['.hero-bag','.hero-inventory','.hero-detail-panel'].map(selector=>({selector,x:game.querySelector(selector)?.scrollLeft||0,y:game.querySelector(selector)?.scrollTop||0}));
    try{
      const result=await ctx.api(action);
      const next=document.getElementById('page');
      if(next?.querySelector('.hero-game')){
        for(const p of positions){const element=next.querySelector(p.selector);if(element){element.scrollLeft=p.x;element.scrollTop=p.y;}}
        next.scrollTop=top;window.scrollTo({top:y,behavior:'instant'});
      }
      return result;
    }catch(error){ctx.toast(error.message);return null;}
  };
  game.querySelectorAll('[data-hero-section]').forEach(b=>listen(b,'click',()=>{heroSection=b.dataset.heroSection;selectedItem=null;rerender();}));
  game.querySelectorAll('[data-item]').forEach(b=>listen(b,'click',()=>{selectedItem=b.dataset.item;preview();}));
  game.querySelectorAll('[data-slot-filter]').forEach(b=>listen(b,'click',()=>{inventoryFilter=b.dataset.slotFilter;selectedItem=null;rerender();}));
  game.querySelectorAll('[data-wardrobe]').forEach(b=>listen(b,'click',()=>{wardrobeType=b.dataset.wardrobe;selectedItem=null;rerender();}));
  listen(game.querySelector('#hero-owned-only'),'change',e=>{onlyOwned=e.target.checked;rerender();});
  game.querySelectorAll('[data-equip]').forEach(b=>listen(b,'click',()=>run({type:'equip',id:b.dataset.equip})));
  listen(game.querySelector('[data-to-wishes]'),'click',()=>ctx.navigate('wishes'));
  game.querySelectorAll('[data-train]').forEach(b=>listen(b,'click',()=>{trainingTarget=b.dataset.train;rerender();const fresh=root.querySelector('#hero-upgrade-dialog');fresh.showModal();}));
  listen(game.querySelector('[data-open-ascend]'),'click',()=>game.querySelector('#hero-ascend-dialog').showModal());
  game.querySelectorAll('[data-close-dialog]').forEach(b=>listen(b,'click',()=>b.closest('dialog').close()));
  game.querySelectorAll('dialog').forEach(d=>listen(d,'click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}));
  const dialog=game.querySelector('#hero-upgrade-dialog');
  const selection=()=>Object.fromEntries([...dialog.querySelectorAll('[data-material]')].map(x=>[x.dataset.material,Number(x.value)]));
  let plan=null;
  const update=()=>{const preview=dialog.querySelector('#hero-enhance-preview'),confirm=dialog.querySelector('#hero-confirm-enhance');try{plan=ctx.rules.enhancementPlan(ctx.data.state,trainingTarget,selection());const t=plan.target;preview.innerHTML=`<p class="hero-overline">Результат усиления</p><h3>${ctx.esc(t.name)}</h3><div class="hero-level-change">${plan.before.level+t.offset}<span>→</span>${plan.after.level+t.offset}</div><dl class="hero-stats"><div><dt>Получено опыта</dt><dd>+${plan.xp}</dd></div><div><dt>Опыт на уровне</dt><dd>${plan.after.xp}/${t.step}</dd></div><div><dt>Резонанс героини</dt><dd>${plan.before.power} → ${plan.after.power}</dd></div><div><dt>Резонанс ${t.kind==='character'?'героини':'вещи'}</dt><dd>${plan.before.itemPower} → ${plan.after.itemPower}</dd></div></dl><p class="hero-material-receipt">${plan.used.map(x=>ctx.esc(x.name)+' ×'+x.count).join('<br>')}</p><div class="hero-cost-total">К оплате <b><img class="resource-icon mora-icon" src="/assets/mora.png" width="24" height="24" alt="" aria-hidden="true"> ${plan.coins}</b></div>`;confirm.disabled=false;confirm.textContent='Усилить · '+plan.coins+' монет';}catch(error){plan=null;confirm.disabled=true;confirm.textContent='Подтвердить усиление';preview.innerHTML=`<p class="hero-overline">Материалы ещё не потрачены</p><div class="hero-preview-glyph">${paintedIcon('item-crystal-v1.webp')}</div><p>${ctx.esc(error.message.replace('в демо',''))}</p>`;}};
  dialog.querySelectorAll('[data-material]').forEach(x=>listen(x,'input',update));
  listen(dialog.querySelector('#hero-confirm-enhance'),'click',async e=>{if(!plan)return;e.currentTarget.disabled=true;const result=await run({type:'enhance',target:trainingTarget,materials:selection()});if(!result)e.target.disabled=false;});
  listen(dialog.querySelector('#hero-auto-materials'),'click',()=>{const s=ctx.data.state,t=ctx.rules.enhancementTarget(s,trainingTarget),options=ctx.rules.materialOptions(s,trainingTarget);let needed=t.step-t.xp;const selected={};for(const m of [...options].sort((a,b)=>a.xp-b.xp)){const count=Math.min(m.count,Math.ceil(needed/m.xp),999);if(count>0){selected[m.id]=count;needed-=count*m.xp;}if(needed<=0)break;}dialog.querySelectorAll('[data-material]').forEach(x=>x.value=selected[x.dataset.material]||0);update();});
  listen(game.querySelector('#hero-confirm-ascend'),'click',async e=>{e.currentTarget.disabled=true;const result=await run({type:'ascend'});if(!result)e.target.disabled=false;});
}

export function renderWishes(ctx) {
  const {state:s,catalog,banners}=ctx.data,{esc,rules}=ctx;
  const banner=banners.find(x=>x.id===selectedBanner)||banners[0];
  const featured=rules.activeBanner(s,banner.id);
  const future=catalog.filter(x=>x.kind===banner.id&&x.rarity===5);
  const previewState={...s,equipped:{...s.equipped}};
  if(featured)previewState.equipped[featured.kind==='artifact'?featured.slot:featured.kind]=featured.id;
  return `<div class="wish-page"><div class="hero-heading"><div><p class="eyebrow">Обсерватория желаний</p><h2>Выбери свою звезду</h2></div><span class="hero-rank"><img class="primogem-icon" src="/assets/primogem.svg" width="24" height="24" alt="" aria-hidden="true"> ${s.currency} примогемов</span></div><div class="hero-tabs wish-tabs" role="tablist" aria-label="Баннеры">${banners.map(b=>`<button role="tab" aria-selected="${b.id===banner.id}" data-banner="${b.id}">${esc(b.name)}</button>`).join('')}</div>
  <section class="panel wish-banner" style="--banner-color:${featured?.color||'#8ba786'}"><div class="wish-art"><div class="wish-ring"></div>${avatar(previewState,catalog)}<span class="wish-art-caption">${featured?'Образ с наградой баннера':'Коллекция собрана'}</span></div><div class="wish-copy"><p class="eyebrow">${esc(banner.title)}</p><span class="hero-stars">★★★★★</span><h2>${featured?esc(featured.name):'Все звёзды уже с тобой'}</h2><p>${featured?'Именно эта вещь выпадет при следующей находке 5★. Затем баннер сменится на следующую несобранную легендарную вещь.':'Ты собрала все легендарные вещи этого баннера. Открой другую коллекцию.'}</p><div class="wish-guarantees"><div><strong>${20-(s.pity[banner.id]||0)}</strong><span>молитв максимум<br>до 5★</span><progress max="20" value="${s.pity[banner.id]||0}"></progress></div><div><strong>${5-(s.pityFour?.[banner.id]||0)}</strong><span>молитв максимум<br>до 4★ или выше</span><progress max="5" value="${s.pityFour?.[banner.id]||0}"></progress></div></div><div class="wish-actions"><button class="button" data-wish="1"${!featured||s.currency<160?' disabled':''}>Помолиться ×1 <span><img class="primogem-icon" src="/assets/primogem.svg" width="24" height="24" alt="" aria-hidden="true"> 160</span></button><button class="button wish-ten" data-wish="10"${!featured||s.currency<1600?' disabled':''}>Помолиться ×10 <span><img class="primogem-icon" src="/assets/primogem.svg" width="24" height="24" alt="" aria-hidden="true"> 1600</span></button></div><p class="wish-small">${featured&&s.currency<160?'За новым светом — к учебным поручениям. ':''}5★ без повторов. Гарант отдельный для каждого баннера и сохраняется при смене его награды.</p><button class="wish-link" data-wish-book>Открыть книгу поручений ↗</button></div></section>
  <section class="panel wish-lineup"><div><p class="eyebrow">Путь коллекционера</p><h2>Легендарные находки</h2></div><div class="wish-legendary-list">${future.map(x=>`<div class="wish-legendary${s.inventory[x.id]?' wish-owned':''}${featured?.id===x.id?' wish-featured':''}">${itemIcon(x)}<b>${esc(x.name)}</b><span>${s.inventory[x.id]?'✓ В коллекции':featured?.id===x.id?'Сейчас на баннере':'Следующий баннер'}</span></div>`).join('')}</div></section><div class="wish-bottom"><section class="panel"><p class="eyebrow">Как устроена удача</p><h2>Прозрачные правила</h2><ul class="wish-rules"><li>Одна молитва стоит 160 примогемов. Десять — 1600.</li><li>Базовый шанс 5★ — 10%; 4★ — 25%. Пятая молитва без 4★ или выше гарантирует такую находку, двадцатая без 5★ гарантирует легендарную.</li><li>Повтор наряда или украшения превращается в 60 монет. Повтор артефакта остаётся материалом для прокачки.</li><li>Если при десяти молитвах коллекция закончится, оставшиеся молитвы не оплачиваются.</li></ul></section><section class="panel"><p class="eyebrow">Последние 12 находок</p><h2>История молитв</h2><div class="wish-history">${s.history.length?s.history.map(x=>`<div><span class="hero-stars">${stars(x.rarity)}</span><b>${esc(x.name)}</b><small>${x.converted?'Повтор → 60 монет':x.duplicate?'Ещё один артефакт':'Новая находка'}</small></div>`).join(''):'<p class="muted">Здесь начнётся история твоих находок. Примогемы для молитв приходят за учебные поручения.</p>'}</div></section></div></div>`;
}

export function bindWishes(root,ctx) {
  root.querySelectorAll('[data-banner]').forEach(button=>button.addEventListener('click',()=>{selectedBanner=button.dataset.banner;root.querySelector('.wish-page').outerHTML=renderWishes(ctx);bindWishes(root,ctx);}));
  root.querySelector('[data-wish-book]').addEventListener('click',()=>ctx.navigate('book'));
  root.querySelectorAll('[data-wish]').forEach(button=>button.addEventListener('click',async()=>{
    root.querySelectorAll('[data-wish]').forEach(x=>x.disabled=true);
    try {
      const response=await ctx.api({type:'wish',banner:selectedBanner,count:Number(button.dataset.wish)});
      const result=response?.result||response;
      const drops=result?.drops||(result?.drop?[result.drop]:[]);
      if(!drops.length)return;
      const dialog=document.createElement('dialog');dialog.className='wish-reveal';dialog.setAttribute('aria-label','Результат молитв');
      dialog.innerHTML=`<button class="wish-close" aria-label="Закрыть">×</button><p class="eyebrow">Звёзды ответили</p><h2>${drops.length===1?'Твоя находка':'Твои находки'}</h2><div class="wish-reveal-grid">${drops.map((drop,i)=>{const item=ctx.data.catalog.find(x=>x.id===drop.id);return `<article class="hero-item hero-rarity-${drop.rarity}" style="animation-delay:${i*.09}s">${item?itemIcon(item):''}<span class="hero-stars">${stars(drop.rarity)}</span><h3>${ctx.esc(drop.name)}</h3><p>${drop.converted?'Повтор → +60 монет':drop.duplicate?'Ещё один артефакт':'Новая находка'}</p></article>`;}).join('')}</div><p class="muted">Всё уже сохранено в твоей коллекции.</p><button class="button" data-close-reveal>Продолжить</button>`;
      document.body.append(dialog);dialog.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>dialog.close()));dialog.addEventListener('close',()=>dialog.remove());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});dialog.showModal();
    }catch(error){ctx.toast(error.message);root.querySelectorAll('[data-wish]').forEach(x=>x.disabled=ctx.data.state.currency<Number(x.dataset.wish)*160);}
  }));
}
