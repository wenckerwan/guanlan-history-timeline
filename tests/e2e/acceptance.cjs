const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const data=JSON.parse(fs.readFileSync('data/history.v1.json','utf8'));
const base=process.env.HISTORY_URL||'http://127.0.0.1:4173';
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.HISTORY_BROWSER==='chromium'?{}:{channel:process.env.HISTORY_BROWSER||'msedge'})});
 const context=await browser.newContext({viewport:{width:1440,height:960},acceptDownloads:true});
 const page=await context.newPage(),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(e.message));
 const check=(name)=>{checks.push(name);console.log('PASS',name);};
 try{
 await page.goto(base);await expect(page.getByRole('heading',{name:'在时间中，读懂历史'})).toBeVisible();await expect(page.locator('.ha-explore-intro')).toContainText('103');check('published content loaded');
 await page.screenshot({path:'artifacts/desktop-overview.png',fullPage:true});
 await page.getByRole('button',{name:'思想与著作',exact:true}).click();await expect(page.locator('.ha-track')).toHaveCount(1);await page.getByRole('button',{name:'全部主题',exact:true}).click();
 await page.getByRole('button',{name:'十年',exact:true}).click();const beforeDrag=page.url();const area=await page.locator('.ha-timeline').boundingBox();if(!area)throw Error('timeline drag area missing');await page.mouse.move(area.x+area.width*.65,area.y+12);await page.mouse.down();await page.mouse.move(area.x+area.width*.4,area.y+12,{steps:6});await page.mouse.up();await expect.poll(()=>page.url()).not.toBe(beforeDrag);await page.getByRole('button',{name:'总览',exact:true}).click();check('topic tracks and direct timeline dragging');
 await page.getByRole('searchbox',{name:'搜索事件'}).fill('五四运动');await expect(page.locator('.ha-node')).toHaveCount(1);await page.locator('.ha-node').click();
 const evidence=page.getByRole('complementary',{name:'事件详情与日期出处'});await expect(evidence).toContainText('1919年5月4日');await expect(evidence).toContainText('PDF 第 106 页');await expect(evidence).toContainText('1919.5.4');
 const source=evidence.getByRole('link').filter({hasText:'2023版'});expect(await source.getAttribute('href')).toContain('/sources/textbook.pdf#page=106');
 const pdf=await context.request.get(base+'/sources/textbook.pdf',{headers:{Range:'bytes=0-31'}});expect(pdf.status()).toBe(206);expect((await pdf.body()).toString().startsWith('%PDF')).toBeTruthy();
 expect((await context.request.head(base+'/sources/original.pdf')).status()).toBe(200);check('dual dates with real PDF source range');
 await evidence.getByRole('button',{name:'收藏',exact:true}).click();await evidence.getByRole('textbox',{name:'事件个人笔记'}).fill('验收笔记：学生与工人运动');await evidence.getByRole('textbox',{name:'事件个人笔记'}).blur();await expect(evidence).toContainText('已保存在本机');
 await evidence.getByRole('button',{name:'加入比较'}).click();const firstUrl=page.url();await page.reload();await expect(evidence.getByRole('textbox',{name:'事件个人笔记'})).toHaveValue('验收笔记：学生与工人运动');await expect(evidence.getByRole('button',{name:'已收藏'})).toBeVisible();check('bookmark/note/deep-link survive reload');
 await page.getByRole('button',{name:'年',exact:true}).click();expect(Number(new URL(page.url()).hash.split('start=')[1].split('&')[0])).toBeLessThan(1920);await expect(evidence).toContainText('五四运动');
 await page.getByRole('button',{name:'总览',exact:true}).click();await page.getByRole('searchbox',{name:'搜索事件'}).fill('中华人民共和国成立');await page.locator('.ha-node').click();await expect(evidence).toContainText('1949年10月1日');await evidence.getByRole('button',{name:'加入比较'}).click();
 await page.getByRole('searchbox',{name:'搜索事件'}).fill('南京解放');await page.locator('.ha-node').click();await evidence.getByRole('button',{name:'加入比较'}).click();
 await page.getByRole('searchbox',{name:'搜索事件'}).fill('澳门回归');await page.locator('.ha-node').click();await evidence.getByRole('button',{name:'加入比较'}).click();await expect(page.getByRole('status').filter({hasText:'最多比较 3 项'})).toBeVisible();
 await page.goBack();await expect(evidence.getByRole('heading',{name:'南京解放',exact:true})).toBeVisible();await page.goForward();await expect(evidence.getByRole('heading',{name:'澳门回归',exact:true})).toBeVisible();check('three-event limit and browser back/forward restoration');
 await page.getByRole('button',{name:/^事件对照/}).click();await expect(page.locator('.ha-comparison-grid article')).toHaveCount(3);await page.getByRole('button',{name:/待审核日期对照/}).click();await expect(page.locator('.ha-pending-comparisons article')).toHaveCount(34);await expect(page.locator('.ha-pending-comparisons')).toContainText('不进入正式时间轴');check('event comparison and isolated 34 review proposals');
 await page.getByRole('button',{name:/^主动回忆/}).click();await expect(page.locator('.ha-practice-tabs')).toContainText('35');await page.getByRole('button',{name:'显示日期'}).click();await page.getByRole('button',{name:'我想起来了'}).click();await expect(page.locator('.ha-inline-success')).toBeVisible();
 await page.getByRole('button',{name:'先后顺序练习'}).click();
 const sortKey=t=>data.events.find(e=>e.title===t && !e.isGroup).dates.textbook.start;
 for(let n=0;n<16;n++){const titles=await page.locator('.ha-order-list li strong').allTextContents();let idx=titles.findIndex((t,i)=>i>0 && sortKey(t)<sortKey(titles[i-1]));if(idx<0)break;await page.getByRole('button',{name:`将${titles[idx]}上移`,exact:true}).click();}
 await page.getByRole('button',{name:'检查顺序'}).click();await expect(page.getByRole('status').filter({hasText:'顺序成立'})).toBeVisible();check('recall and ordering practice');
 await page.getByRole('button',{name:/^我的学习/}).click();await expect(page.locator('.ha-note-entry')).toContainText('验收笔记');await expect(page.locator('.ha-study-summary')).toContainText('2');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出备份'}).click();const download=await downloadPromise;const backupPath='artifacts/acceptance-backup.json';await download.saveAs(backupPath);const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));expect(JSON.stringify(backup)).toContain('验收笔记');expect(JSON.stringify(backup)).not.toMatch(/[FD]:[\\/]/);
 await page.getByLabel('选择学习备份').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":999}')});await expect(page.getByRole('status').filter({hasText:'导入失败'})).toBeVisible();await expect(page.locator('.ha-note-entry')).toContainText('验收笔记');
 await page.getByLabel('选择学习备份').setInputFiles(backupPath);await expect(page.getByRole('status').filter({hasText:'有效备份已合并'})).toBeVisible();check('export and strict import preserves records');
 await page.goto(firstUrl);await expect(evidence).toContainText('五四运动');await page.getByRole('button',{name:'总览',exact:true}).click();await page.getByRole('searchbox',{name:'搜索事件'}).fill('');await page.getByRole('checkbox',{name:'原表合并组'}).check();await expect(page.locator('.ha-explore-intro')).toContainText('124');await expect(page.locator('.ha-unknown')).toBeVisible();check('all 124 original groups reachable');
 await page.getByRole('checkbox',{name:'原表合并组'}).uncheck();await page.getByRole('searchbox',{name:'搜索事件'}).fill('五四运动');await page.locator('.ha-node').click();await page.screenshot({path:'artifacts/desktop-evidence.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await expect(evidence).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'artifacts/mobile-evidence.png',fullPage:true});await page.getByRole('button',{name:'关闭事件详情'}).click();await page.screenshot({path:'artifacts/mobile-overview.png',fullPage:true});check('mobile 390px no horizontal overflow');
 await page.setViewportSize({width:1440,height:960});
 await page.addInitScript(()=>{const original=IDBDatabase.prototype.transaction;window.__historyWrites=0;IDBDatabase.prototype.transaction=function(names,mode,...rest){if(this.name==='history-study-v1'){if(mode==='readonly' && sessionStorage.getItem('failHistoryRead')==='1')throw new Error('injected read failure');if(mode==='readwrite')window.__historyWrites++;}return original.call(this,names,mode,...rest);};});
 await page.evaluate(()=>sessionStorage.setItem('failHistoryRead','1'));await page.reload();await expect(page.getByRole('button',{name:'重试恢复学习记录'})).toBeVisible();await page.getByRole('button',{name:/^我的学习/}).click();await page.waitForTimeout(400);expect(await page.evaluate(()=>window.__historyWrites)).toBe(0);
 await page.evaluate(()=>sessionStorage.removeItem('failHistoryRead'));await page.getByRole('button',{name:'重试恢复学习记录'}).click();await page.getByRole('button',{name:/^我的学习/}).click();await expect(page.locator('.ha-note-entry')).toContainText('验收笔记');check('temporary storage read failure cannot overwrite existing notes');
 await page.goto(firstUrl);await expect(evidence).toBeVisible();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await expect(page.getByRole('heading',{name:'在时间中，读懂历史'})).toBeVisible();
 await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'在时间中，读懂历史'})).toBeVisible();await expect(page.getByRole('searchbox',{name:'搜索事件'})).toHaveValue('五四运动');check('preheated production shell and data reload offline');await context.setOffline(false);
 expect(errors).toEqual([]);check('no browser runtime errors');
 fs.writeFileSync('artifacts/acceptance-report.json',JSON.stringify({at:new Date().toISOString(),checks,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});





