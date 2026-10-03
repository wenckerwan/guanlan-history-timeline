import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const selfContained = process.env.HISTORY_LIB_SELF_CONTAINED === '1';
export default defineConfig({plugins:[vue()],define:selfContained?{'process.env.NODE_ENV':'"production"'}:undefined,resolve:{alias:{'@history/core':path.join(root,'packages/history-core/src/index.ts'),'@history/adapters':path.join(root,'packages/adapters/src/index.ts')}},build:{outDir:selfContained?path.join(root,'dist/app/lib-preview'):path.join(root,'dist/lib'),emptyOutDir:true,lib:{entry:path.join(root,'packages/history-ui/src/index.ts'),name:'HistoryUI',formats:['es'],fileName:'history-ui'},rollupOptions:selfContained?{}:{external:['vue','vue-router']}}});
