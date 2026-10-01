import { open } from './test.mjs';
const { browser, page, logs } = await open({ vp: { width: 844, height: 390 } });
await page.waitForFunction(() => window.__ashen, null, { timeout: 120000 });
await page.click('#btnBegin');
const r = await page.evaluate(() => { window.__manual = true; const A = window.__ashen; A.CAM.t = 5; for (let i=0;i<20;i++) A.step(1/60);
  const out = { audio: A.AUDIO.ready };
  // touch stick
  const zone = document.getElementById('stickZone'); const rz = zone.getBoundingClientRect();
  const ev = (el, type, x, y, id) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true }));
  ev(zone, 'pointerdown', rz.left + 100, rz.top + 150, 5); ev(zone, 'pointermove', rz.left + 100, rz.top + 90, 5);
  out.stick = [A.INPUT.sx.toFixed(2), A.INPUT.sy.toFixed(2)];
  const z0 = A.player.pos.z; for (let i=0;i<30;i++) A.step(1/60); out.moved = (A.player.pos.z - z0).toFixed(2);
  ev(zone, 'pointerup', rz.left + 100, rz.top + 90, 5); out.stickRel = [A.INPUT.sx, A.INPUT.sy];
  const b = document.getElementById('btnAtk'); const rb = b.getBoundingClientRect();
  ev(b, 'pointerdown', rb.left+10, rb.top+10, 7); A.step(1/60); out.atkState = A.player.state; ev(b, 'pointerup', rb.left+10, rb.top+10, 7);
  for (let i=0;i<60;i++) A.step(1/60);
  // hold attack -> heavy
  ev(b, 'pointerdown', rb.left+10, rb.top+10, 8); for (let i=0;i<20;i++) A.step(1/60); out.hold = A.player.state; for (let i=0;i<40;i++) A.step(1/60); ev(b, 'pointerup', rb.left+10, rb.top+10, 8); for (let i=0;i<8;i++) A.step(1/60); out.heavy = A.player.state;
  for (let i=0;i<90;i++) A.step(1/60);
  const g = document.getElementById('btnGuard'); const rg = g.getBoundingClientRect();
  ev(g, 'pointerdown', rg.left+10, rg.top+10, 9); for (let i=0;i<30;i++) A.step(1/60); out.guard = A.player.state; ev(g, 'pointerup', rg.left+10, rg.top+10, 9); A.step(1/60); out.guardRel = A.player.state;
  // memory across retries
  const mem0 = JSON.stringify(A.renderer.info.memory);
  for (let k=0;k<6;k++) { A.player.hp = 1; A.player.takeHit({dmg:300,parry:0,gst:0,name:'t'}, A.player.pos.clone().setY(1), A.boss.pos); for (let i=0;i<60*3;i++) A.step(1/60); document.getElementById('btnRetry').click(); for (let i=0;i<60*2.5;i++) A.step(1/60); }
  out.mem = [mem0, JSON.stringify(A.renderer.info.memory)]; out.modeAfter = A.GAME.mode; out.particles = A.VFX.add.n + A.VFX.norm.n;
  return out; });
console.log(JSON.stringify(r));
console.log(logs.filter(l=>!l.includes('non-indexed')).slice(0,20).join('\n'));
await browser.close();
