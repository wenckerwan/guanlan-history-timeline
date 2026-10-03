import { offlineApplication } from '../../tools/offline-plugin.ts';
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
// Explicit document allowlist; never resolve request paths into the workspace filesystem.
const sourcePaths:Record<string,string>={
 '/sources/original.pdf':'F:/2027考研资料/考研政治/中国近现代史时间轴.pdf',
 '/sources/textbook.pdf':'F:/2027考研资料/考研政治/本科教材/《中国近现代史纲要》（2023版）.pdf'
};
function localDocuments():Plugin {
 const middleware=(req:any,res:any,next:any)=>{
  const url=(req.url??'').split('?')[0];
  const file=url==='/data/history.v1.json'?path.join(root,'data/history.v1.json'):sourcePaths[url];
  if(!file){if(url.startsWith('/sources/')){res.statusCode=404;res.end('未登记的源文档');return;}return next();}
  if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.end();return;}
  if(!fs.existsSync(file)){res.statusCode=404;res.end('本地源文档不可用');return;}
  const size=fs.statSync(file).size;res.setHeader('Content-Type',url.endsWith('.pdf')?'application/pdf':'application/json; charset=utf-8');
  res.setHeader('Accept-Ranges','bytes');let start=0,end=size-1;
  if(req.headers.range){const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!m){res.statusCode=416;res.end();return;}start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;if(start>end){res.statusCode=416;res.end();return;}res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);}
  res.setHeader('Content-Length',end-start+1);if(req.method==='HEAD'){res.end();return;}fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
 };
 return {name:'local-history-documents',configureServer(server){server.middlewares.use(middleware);},configurePreviewServer(server){server.middlewares.use(middleware);},generateBundle(){this.emitFile({type:'asset',fileName:'data/history.v1.json',source:fs.readFileSync(path.join(root,'data/history.v1.json'),'utf8')});}};
}
export default defineConfig({root:path.join(root,'apps/explorer'),plugins:[vue(),localDocuments(),offlineApplication(path.join(root,'dist/app'))],resolve:{alias:{'@history/core':path.join(root,'packages/history-core/src/index.ts'),'@history/adapters':path.join(root,'packages/adapters/src/index.ts'),'@history/ui':path.join(root,'packages/history-ui/src/index.ts')}},build:{outDir:path.join(root,'dist/app'),emptyOutDir:true}});



