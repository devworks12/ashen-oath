import { open } from './test.mjs';
const mode = process.argv[2] || 'dodge';
const { browser, page, logs } = await open();
await page.waitForFunction(() => window.__ashen, null, { timeout: 120000 });
await page.click('#btnBegin');
const res = await page.evaluate(async (mode) => {
  window.__manual = true;
  const A = window.__ashen, I = A.INPUT, P = A.player, B = A.boss;
  A.CAM.t = 5; for (let i=0;i<20;i++) A.step(1/60);
  const out = { events: [], hpLog: [] };
  let lastPh = 1, frames = 0, lastState = '';
  const release = {};
  const press = (t) => { I.held[t] = true; I.press(t); release[t] = 4; };
  const maxT = 60*60*6;
  for (frames = 0; frames < maxT; frames++) {
    const dx = B.pos.x - P.pos.x, dz = B.pos.z - P.pos.z, d = Math.hypot(dx, dz);
    for (const k in release) { if (--release[k] <= 0) { if (!(k==='guard' && mode==='guard')) I.held[k] = false; delete release[k]; } }
    // move stick toward boss (camera-relative: camera looks toward boss roughly, so sy=1 is forward)
    I.sx = 0; I.sy = d > 2.3 ? 1 : 0;
    let incoming = null;
    if (B.state === 'move' && B.move) {
      for (let i = 0; i < B.move.hits.length; i++) { const h = B.move.hits[i]; const dt = h[0] - (B.tm ?? B.t); if (dt > 0 && dt < 0.2) incoming = { dt, h }; }
    }
    if (mode === 'dodge' && incoming && incoming.dt < 0.1 && d < 5 && P.state !== 'dodge') press('dodge');
    else if (mode === 'parry' && incoming && incoming.dt < 0.06 && d < 4.5) { if (P.state!=='parry') press('guard'); }
    else if (mode === 'guard') { I.held.guard = true; if (P.state==='idle'||P.state==='move') I.press('guard'); }
    const bossOpen = B.state === 'stagger' || B.state === 'parried' || B.state === 'transition' || (B.state === 'move' && B.move && (B.tm ?? B.t) > Math.max(...B.move.hits.map(h=>h[1]), 0) + 0.05) || (B.state==='observe' && B.gap > 0.4);
    if ((mode === 'mash' || bossOpen) && d < 2.9 && P.st > 20 && ['idle','move','attack'].includes(P.state) && frames % 8 === 0) press('atk');
    if (P.hp < 450 && P.flasks > 0 && (P.state==='idle'||P.state==='move') && d > 4) press('heal');
    A.step(1/60);
    if (B.phase !== lastPh) { out.events.push(['phase2', A.GAME.fightTime.toFixed(1), B.hp|0]); lastPh = B.phase; }
    const st = B.state + (B.move ? ':' + B.move.name : '');
    if (A.GAME.mode !== 'fight') { out.events.push(['end', A.GAME.mode, A.GAME.fightTime.toFixed(1)]); break; }
    if (frames % 600 === 0) out.hpLog.push([Math.round(A.GAME.fightTime), P.hp|0, B.hp|0, P.flasks]);
  }
  out.tele = JSON.parse(JSON.stringify(A.TELE));
  out.final = { php: P.hp|0, bhp: B.hp|0, mode: A.GAME.mode, t: A.GAME.fightTime.toFixed(1) };
  // continue a few secs of end sequence
  for (let i=0;i<60*7;i++) A.step(1/60);
  out.after = { mode: A.GAME.mode, fallen: !document.getElementById('fallen').hidden, victory: !document.getElementById('victory').hidden, dis: B.rig.U.uDissolve.value };
  return out;
}, mode);
console.log(JSON.stringify(res, null, 0));
console.log(logs.filter(l=>!l.includes('non-indexed')).slice(0,20).join('\n'));
await browser.close();
