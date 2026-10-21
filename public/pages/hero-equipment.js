import {itemArt} from './item-art.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

// Keep each painting intact: equipment has its own display, not a pasted-on grip.
export function equipmentDisplay(state,catalog) {
 const weapon=catalog.find(item=>item.id===state.equipped?.weapon);
 if(!weapon)return '';
 return `<figure class="hero-weapon-display" data-display-item="${escape(weapon.id)}" data-display-slot="weapon"><span class="hero-display-label">Оружие</span><div class="hero-weapon-painting">${itemArt(weapon,{decorative:true})}</div><figcaption>${escape(weapon.name)}</figcaption></figure>`;
}
export function relicDisplay(state,catalog) {
 const slots=[['accessory','Украшение'],['flower','Цветок'],['feather','Перо'],['clock','Часы']];
 const items=slots.map(([slot,label])=>{const item=catalog.find(candidate=>candidate.id===state.equipped?.[slot]);return item?`<figure data-display-item="${escape(item.id)}" data-display-slot="${slot}" title="${escape(item.name)}"><span class="hero-relic-art">${itemArt(item,{decorative:true})}</span><figcaption><span>${label}</span><b>${escape(item.name)}</b></figcaption></figure>`:'';}).join('');
 return items?`<div class="hero-relic-shelf" aria-label="Украшение и артефакты выбранного комплекта">${items}</div>`:'';
}

/** A course-neutral dressed avatar when no private portrait has been supplied. */
export function neutralCharacter({outfitColor, hairColor, skinColor, id}) {
  return `<g class="hero-neutral-portrait"><defs><linearGradient id="${id}-cloth" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${escape(outfitColor)}"/><stop offset="1" stop-color="#26394d"/></linearGradient></defs><ellipse cx="240" cy="690" rx="100" ry="10" fill="#10263d" opacity=".22"/><path d="M209 568 209 662 Q200 685 214 690 L237 690 238 568 M252 568 253 668 Q249 689 266 690 L286 690 Q291 683 275 667 L274 568" fill="#584c4a" stroke="#c9b388" stroke-width="2"/><path d="M224 115 217 149 263 149 257 115" fill="${escape(skinColor)}"/><path d="M181 68 Q176 7 237 12 302 6 304 77 L305 192 Q267 215 175 192Z" fill="${escape(hairColor)}"/><ellipse cx="241" cy="76" rx="43" ry="53" fill="${escape(skinColor)}"/><path d="M195 65 Q192 11 247 17 Q291 16 290 62 Q267 52 254 31 Q239 58 195 65Z" fill="${escape(hairColor)}"/><path d="M222 82 Q226 79 230 82 M252 82 Q256 79 260 82 M235 106 Q242 111 249 106" stroke="#765b54" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M211 137 184 148 Q173 201 158 256 L122 346 139 356 194 264 210 202 M269 137 295 148 Q309 201 321 255 L352 345 337 356 286 264 271 202" fill="#f5eddd" stroke="#d5c6a3" stroke-width="2"/><path d="M122 341 Q113 351 117 368 Q122 378 126 365 L133 354 137 365 Q143 369 142 359 L138 345 M340 342 Q354 344 356 359 Q357 372 351 368 L345 358 345 372 Q338 378 335 365 L334 352" fill="${escape(skinColor)}"/><path d="M210 137 271 137 282 218 Q304 316 343 445 L365 578 Q241 636 117 578 L137 445 Q178 315 198 218Z" fill="url(#${id}-cloth)" stroke="#e4cc95" stroke-width="3"/><path d="M239 150 221 219 191 566 Q241 582 291 566 L259 219Z" fill="#f8f0df" stroke="#d0bb8c" stroke-width="2"/><path d="M210 137 187 148 160 246 196 229 222 164 M271 137 294 148 322 246 285 229 258 164" fill="${escape(outfitColor)}" stroke="#e4cc95" stroke-width="3"/><path d="M199 219 Q239 233 281 219 L285 236 Q240 249 194 236Z" fill="#6b5747" stroke="#d1b273" stroke-width="2"/><path d="M240 243 240 563 M162 506 Q180 522 194 525 M289 525 Q308 522 322 506" stroke="#b79b62" stroke-width="2" fill="none"/><image href="/assets/nav-hero.svg" x="225" y="140" width="30" height="30"/></g>`;
}
