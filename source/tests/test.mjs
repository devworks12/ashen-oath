import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import fs from 'fs'; import path from 'path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'); // source/
export async function open(opts={}){
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: opts.vp || { width: 900, height: 420 }, deviceScaleFactor: 1 });
  const logs=[];
  page.on('console', m => logs.push(m.type()+': '+m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR: '+e.message+'\n'+e.stack));
  await page.route('**/*', async (route) => {
    const u = route.request().url();
    const m = u.match(/three@0\.169\.0\/(.*)$/);
    if (m) { const f = path.join(ROOT,'three-src',m[1]); return route.fulfill({ status:200, contentType:'application/javascript', body: fs.readFileSync(f) }); }
    if (u.startsWith('file://')) return route.continue();
    if (u.includes('fonts.g')) return route.fulfill({status:200, body:'', contentType:'text/css'});
    return route.continue();
  });
  await page.goto('http://127.0.0.1:8123/test.html'+(opts.hash||''));
  return { browser, page, logs };
}
