import { open } from './test.mjs';
const { browser, page } = await open({ vp: { width: 667, height: 307 } });
await page.waitForFunction(() => window.__ashen, null, { timeout: 120000 });
await page.click('#btnContinue');
const r = await page.evaluate(() => {
  window.__manual = true; const A = window.__ashen; A.CAM.t = 5; for (let i = 0; i < 40; i++) A.step(1 / 60);
  const out = {};
  for (const id of ['btnAtk', 'btnDodge', 'btnGuard', 'btnSkill', 'btnHeal', 'btnJump', 'btnPause']) {
    const b = document.getElementById(id).getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const hit = (x, y) => { const e = document.elementFromPoint(x, y); return e && (e.closest('button') || {}).id; };
    // visible size in CSS px, centre hit, and a tap 3px outside the drawn ring
    out[id] = { size: Math.round(b.width), centre: hit(cx, cy) === id, outside: hit(b.right + 3, cy) };
  }
  // stick: drag 60px up from a point in the zone
  const zone = document.getElementById('stickZone'), rz = zone.getBoundingClientRect();
  const ev = (type, x, y) => zone.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'touch', clientX: x, clientY: y, bubbles: true }));
  ev('pointerdown', rz.left + 90, rz.top + 120); ev('pointermove', rz.left + 90, rz.top + 60); out.stick = A.INPUT.sy.toFixed(2); ev('pointerup', rz.left + 90, rz.top + 60);
  return out;
});
console.log(JSON.stringify(r));
await browser.close();
