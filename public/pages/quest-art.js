// Painted 2D Guild assets generated individually with imagegen. Prompts: docs/book-icon-art.md.
const icons = new Set(['book','sun','feather','history','check','lock','arrow','pin','search','crown','flower','tower','empty']);
export function icon(name,cls='') {
 if(name==='gem')return `<img class="primogem-icon quest-icon ${cls}" src="/assets/primogem.svg" width="24" height="24" alt="" aria-hidden="true">`;
 const asset=icons.has(name)?name:'book';
 return `<img class="quest-icon quest-painted-icon ${cls}" src="/assets/book-${asset}-v1.png" width="25" height="25" alt="" aria-hidden="true" decoding="async">`;
}
const achievementArt={variables:'book',math:'sun',conditions:'arrow',strings:'feather',while:'history',dict:'lock',set:'flower',frequencies:'tower',algorithms:'pin'};
export function medal(id,earned=true,cls='') {
 const asset=achievementArt[id]||'empty';
 return `<img class="quest-medallion quest-medallion-painted ${earned?'':'quest-medallion-muted'} ${cls}" src="/assets/book-${asset}-v1.png" width="100" height="112" alt="" aria-hidden="true" decoding="async">`;
}
export function journalArt(){return '<img class="quest-cover-art" src="/assets/book-landscape-v1.png" width="1200" height="400" alt="" aria-hidden="true" decoding="async">';}
