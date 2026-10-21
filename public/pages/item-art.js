// Each inventory object is a separate hand-painted image with real transparency.
export const paintedItemAssets = Object.freeze({
  "flower": "/assets/item-flower-v1.webp",
  "feather": "/assets/item-feather-v1.webp",
  "clock": "/assets/item-clock-v1.webp",
  "garden": "/assets/item-garden-v1.webp",
  "ink": "/assets/item-ink-v1.webp",
  "eternity": "/assets/item-eternity-v1.webp",
  "bloom": "/assets/item-bloom-v1.webp",
  "tide": "/assets/item-tide-v1.webp",
  "eclipse": "/assets/item-eclipse-v1.webp",
  "ribbon": "/assets/item-ribbon-v1.webp",
  "pin": "/assets/item-pin-v1.webp",
  "wreath": "/assets/item-wreath-v1.webp",
  "star": "/assets/item-star-v1.webp",
  "halo": "/assets/item-halo-v1.webp",
  "coral": "/assets/item-coral-v1.webp",
  "comet": "/assets/item-comet-v1.webp",
  "quill": "/assets/item-wanderer-sword-v1.png",
  "archive-quill": "/assets/item-amethyst-wand-v1.png",
  "moon-quill": "/assets/item-moonblade-v1.png",
  "dawn-quill": "/assets/item-dawn-staff-v1.png",
  "moon": "/assets/outfit-moon-v3.png",
  "aurora": "/assets/outfit-aurora-v3.png",
  "ember": "/assets/outfit-ember-v3.png",
  "peony": "/assets/outfit-peony-v3.png"
});
let artSerial = 0;
const safe = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function itemArt(item,{className='',decorative=false}={}) {
 const outfitOrder=['novice','tea','sea','violet','cloud','moon','peony','aurora','ember'];
 const outfitIndex=item.kind==='outfit'?outfitOrder.indexOf(item.id):-1;
 if(outfitIndex>=0&&!Object.hasOwn(paintedItemAssets,item.id)){
  const x=(outfitIndex%3)*418,y=Math.floor(outfitIndex/3)*418,clipId='outfit-crop-'+(++artSerial);
  return `<svg class="stellar-item-art ${safe(className)}" viewBox="0 0 400 400" ${decorative?'aria-hidden="true"':`role="img" aria-label="${safe(item.name)}"`} xmlns="http://www.w3.org/2000/svg"><title>${safe(item.name)}</title><defs><clipPath id="${clipId}"><rect width="400" height="400"/></clipPath></defs><g clip-path="url(#${clipId})"><svg x="0" y="0" width="400" height="400" viewBox="${x} ${y} 418 418" preserveAspectRatio="xMidYMid meet" overflow="hidden"><image href="/assets/outfit-collection-v1.png" width="1254" height="1254"/></svg></g></svg>`;
 }
 const asset=Object.hasOwn(paintedItemAssets,item.id)?paintedItemAssets[item.id]:paintedItemAssets.flower;
 return `<svg class="stellar-item-art ${safe(className)}" viewBox="0 0 400 400" ${decorative?'aria-hidden="true"':`role="img" aria-label="${safe(item.name)}"`} xmlns="http://www.w3.org/2000/svg"><title>${safe(item.name)}</title><image href="${asset}" width="400" height="400" preserveAspectRatio="xMidYMid meet"/></svg>`;
}
