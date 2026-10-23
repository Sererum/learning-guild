// Shared painted cinema: the selected item is a separate layer, for every course and item kind.
export const WISH_CINEMA_DURATION=7200;
export const WISH_CINEMA_MEDIA=Object.freeze(Object.fromEntries([3,4,5].map(r=>[r,{video:'/assets/wish-anime-'+r+'star-v9.mp4',poster:'/assets/wish-anime-background-v5.png'}])));
export function cinemaMarkup({rarity,itemHtml,label,kind,count=1,preview=false}){
 const media=WISH_CINEMA_MEDIA[rarity]||WISH_CINEMA_MEDIA[3];
 return '<div class="wish-cinema wish-painted-cinema rarity-'+rarity+'" data-wish-cinema><video class="wish-painted-video" muted playsinline preload="auto" poster="'+media.poster+'" src="'+media.video+'" aria-hidden="true"></video><button type="button" class="wish-cinema-skip" data-wish-skip>Пропустить <span aria-hidden="true">›</span></button>'+(preview?'<span class="wish-preview-notice">Предпросмотр · без списания и награды</span>':'')+'<p class="wish-cinema-status" role="status">Звёзды отвечают на твою молитву…</p><div class="wish-painted-item">'+itemHtml+'</div><div class="wish-item-identity"><small>'+kind+'</small><h2>'+label+'</h2><span class="wish-reveal-stars">'+'★'.repeat(rarity)+'</span>'+(count>1?'<p>И ещё '+(count-1)+' находок</p>':'')+'</div></div>';
}
export function playCinema(dialog,markup){
 if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return Promise.resolve();
 dialog.className='stellar-modal wish-cinematic-modal';dialog.setAttribute('aria-label','Анимация молитвы');dialog.innerHTML=markup;
 const stage=dialog.querySelector('[data-wish-cinema]'),video=stage.querySelector('video'),skip=stage.querySelector('[data-wish-skip]');
 return new Promise(resolve=>{let settled=false,started=false,deadline=0,hold=0,frame=0;
 const update=()=>{const opacity=Math.max(0,Math.min(1,(video.currentTime-4.6)/.3));stage.querySelector('.wish-painted-item').style.opacity=String(opacity);stage.classList.toggle('is-revealed',video.currentTime>=4.6);stage.classList.toggle('is-identified',video.currentTime>=5.2);};
 const tick=()=>{update();if(!settled)frame=requestAnimationFrame(tick);};
 const finish=()=>{if(settled)return;settled=true;clearTimeout(deadline);clearTimeout(hold);cancelAnimationFrame(frame);video.pause();video.removeEventListener('loadeddata',start);video.removeEventListener('error',failed);video.removeEventListener('ended',ended);dialog.removeEventListener('close',finish);dialog.removeEventListener('cancel',cancel);resolve();};
 const cancel=e=>{e.preventDefault();finish();};
 const ended=()=>{update();clearTimeout(deadline);hold=setTimeout(finish,1200);};
 const failed=()=>{if(settled)return;stage.classList.add('is-playing','is-revealed','is-identified');stage.querySelector('.wish-painted-item').style.opacity='1';clearTimeout(deadline);hold=setTimeout(finish,1200);};
 function start(){if(started||settled)return;started=true;stage.dataset.startedAt=String(performance.now());stage.classList.add('is-playing');clearTimeout(deadline);deadline=setTimeout(finish,WISH_CINEMA_DURATION+3000);video.play().then(()=>{if(settled){video.pause();return;}tick();}).catch(failed);}
 skip.onclick=finish;dialog.addEventListener('close',finish,{once:true});dialog.addEventListener('cancel',cancel);video.addEventListener('loadeddata',start);video.addEventListener('error',failed,{once:true});video.addEventListener('ended',ended,{once:true});skip.focus();deadline=setTimeout(failed,6000);if(video.readyState>=2)start();
 });
}
