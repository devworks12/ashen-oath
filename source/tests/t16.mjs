import { open } from './test.mjs';
const { browser, page, logs } = await open({vp:{width:900,height:420}});
await page.waitForFunction(() => window.__ashen, null, { timeout: 120000 });
console.log(await page.evaluate(() => JSON.stringify(window.__ashen.ASSETS ? window.__ashen.ASSETS.have : 'n/a')));
const reqs = [];
page.on('request', r => reqs.push(r.url()));
await browser.close();
