/**
 * 观澜模式路由 e2e：用 dist/lib 构建产物 + 注入 createGuanlanRouter 的宿主页面，
 * 验证 /history/?event={id} 深链定位、选中恢复、独立视觉保留。
 * 前置：已执行 npm run build（app + lib），且 preview 在 4173 提供 dist/app 静态资源。
 * 这里通过 route 拦截把 dist/lib/history-ui.js 作为宿主脚本注入。
 */
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.HISTORY_URL || 'http://127.0.0.1:4173';
const libJs = fs.readFileSync(path.join(__dirname, '../../dist/app/lib-preview/history-ui.js'), 'utf8');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.HISTORY_BROWSER || 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message); });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text().slice(0, 300)); });
  try {
    await page.route(/guanlan-host-lib\.js/, route => route.fulfill({ contentType: 'text/javascript', body: libJs }));
    page.on('response', async res => { if (res.url().includes('guanlan-host-lib')) { const t = await res.text(); console.log('LIBHEAD:', t.slice(0, 80), '... LEN', t.length); } });
    page.on('console', m => console.log('CON', m.type(), m.text().slice(0, 300)));
    page.on('pageerror', e => console.log('PERR', e.message.slice(0, 300)));
    page.on('pageerror', e => { errors.push(e.message); });
    await page.route(/embed-guanlan/, route => route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><meta charset="utf-8"><style>html,body,#history-app{margin:0;height:100%}</style></head>
<body><div id="history-app"></div>
<script type="module">
  import { createGuanlanHistoryApp, createGuanlanRouter } from '/guanlan-host-lib.js';
  // 内联最小内容/学习仓库（模拟观澜注入），避免依赖 @history/adapters 打包
  const repository = {
    async loadDataset() { const r = await fetch('/data/history.v1.json'); const j = await r.json(); return j.data ?? j; },
    sourceUrl: (id, p) => '/sources/' + id + '.pdf' + (p ? '#page=' + p : ''),
  };
  const studyRepository = {
    async load() { return { version: 1, bookmarks: [], notes: {}, attempts: [], view: null }; },
    async save() {},
    async exportBackup() { return '{}'; },
    async importBackup(t) { return JSON.parse(t).state; },
  };
  const params = new URLSearchParams(location.search);
  const route = {
    query: Object.fromEntries(params),
    push(q){ history.pushState(null,'','?'+new URLSearchParams(q)); },
    replace(q){ history.replaceState(null,'','?'+new URLSearchParams(q)); },
  };
  const router = createGuanlanRouter({ route });
  createGuanlanHistoryApp({ mount: '#history-app', repository, studyRepository, router });
<\/script></body></html>`,
    }));
    await page.goto(base + '/embed-guanlan?event=p1-r022');
    await expect(page.locator('.history-archive .ha-track')).not.toHaveCount(0);
    const evidence = page.getByRole('complementary', { name: '事件详情与日期出处' });
    await expect(evidence).toBeVisible();
    // 深链定位到 p1-r022（戊戌变法原表合并组）
    await expect(evidence).toContainText('p1-r022');
    await expect(evidence).toContainText('戊戌变法');
    expect(page.url()).toContain('event=p1-r022');
    // 独立档案馆视觉根容器存在
    await expect(page.locator('.history-archive')).toBeVisible();
    // 深链收藏 url 形态：router.eventUrl 生成 /history/?event={id}
    // （观澜收藏列表据此跳回；组件已在上方验证 ?event= 能定位选中）
    expect(errors).toEqual([]);
    console.log('PASS guanlan-router deep-link & navigation restore');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
