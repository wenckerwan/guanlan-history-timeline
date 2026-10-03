import fs from 'node:fs';
import path from 'node:path';
import type {Plugin} from 'vite';
/** Cache the built application only. PDF documents deliberately remain local-service resources. */
export function offlineApplication(outDir:string):Plugin{return {name:'history-offline-shell',apply:'build',closeBundle(){
 if(!fs.existsSync(path.join(outDir,'index.html')))return;
 const walk=(dir:string):string[]=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.relative(outDir,path.join(dir,e.name)).replaceAll('\\','/')]);
 const files=walk(outDir).filter(f=>!f.endsWith('.pdf') && f!=='sw.js');
 const token=Date.now().toString(36),urls=['/',...files.map(f=>'/'+f)];
 const worker=`const CACHE='history-shell-${token}';const URLS=${JSON.stringify(urls)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(URLS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('history-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!URLS.includes(u.pathname)||u.pathname.startsWith('/api/')||u.pathname.startsWith('/sources/'))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request).then(r=>r||Promise.reject(new Error('离线资源未预热')))));});`;
 fs.writeFileSync(path.join(outDir,'sw.js'),worker);
 const index=path.join(outDir,'index.html');fs.writeFileSync(index,fs.readFileSync(index,'utf8').replace('</body>',`<script>if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});</script></body>`));
}};}

