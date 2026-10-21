import http from 'node:http';
const target='http://127.0.0.1:4327';
const server=http.createServer((req,res)=>{
 if(req.method!=='GET'||req.url.startsWith('/api/')){res.writeHead(409,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify({error:'Демо объединено с проектом. Обнови страницу — откроется общая Гильдия.'}));return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
 res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Гильдия Python</title><p>Открываем единую Гильдию и сохраняем черновики…</p><a href="${target}/">Перейти в проект</a><iframe id="migration" src="${target}/legacy-drafts.html" hidden title="Перенос учебных черновиков"></iframe><script>
 const target=${JSON.stringify(target)},frame=document.querySelector('iframe'),routes={practice:'lesson',course:'lesson',tasks:'book',tree:'world',character:'hero',inventory:'hero',achievements:'achievements',wishes:'wishes',world:'world',book:'book',hero:'hero',lesson:'lesson'},old=location.hash.slice(1)||location.pathname.slice(1);const next=()=>location.replace(target+'/#'+(routes[old]||'world'));const timeout=setTimeout(next,4000);
 window.addEventListener('message',event=>{if(event.origin!==target||event.source!==frame.contentWindow)return;if(event.data?.type==='guild-drafts-ready'){let drafts={},selected;try{drafts=JSON.parse(localStorage.getItem('alice-guild-drafts-v1')||'{}');selected=JSON.parse(localStorage.getItem('alice-guild-workspace-v1')||'{}').task;}catch{}frame.contentWindow.postMessage({type:'guild-migrate-drafts',drafts,selected},target);}if(event.data?.type==='guild-drafts-migrated'){clearTimeout(timeout);next();}});
 </script></html>`);
});
server.listen(4317,'127.0.0.1',()=>console.log('Старые ссылки 4317 ведут в единый проект '+target));
