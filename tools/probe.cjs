const {chromium}=require('@playwright/test');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:4173');await page.waitForTimeout(1500);console.log((await page.locator('body').innerText()).slice(0,7000));console.log('errors',errors);await page.screenshot({path:'artifacts/first-desktop.png',fullPage:true});await browser.close();})();

