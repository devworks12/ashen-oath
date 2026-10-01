// batch difficulty probe: N fights per bot, reports win rate, boss hp left, player deaths' time
import { open } from './test.mjs';
const modes = (process.argv[2] || 'perfect,human,parry,mash').split(',');
const N = +(process.argv[3] || 5);
const BOSS = process.argv[4] || 'knight';
const { browser, page } = await open();
await page.waitForFunction(() => window.__ashen, null, { timeout: 120000 });
await page.click('#btnBegin');
const all = {};
for (const mode of modes) {
  all[mode] = await page.evaluate(async ({ mode, N, BOSS }) => {
    window.__manual = true;
    const A = window.__ashen, I = A.INPUT, P = A.player; A.selectBoss(BOSS); const B = A.boss;
    const res = []; const hitBy = {};
    if (!P.__wrapped) { P.__wrapped = true; const o = P.takeHit.bind(P); P.takeHit = (h, pt, fr) => { const r = o(h, pt, fr); if (r !== 'parry') { const k = h.name + (A.boss.warp ? '*' : ''); window.__hb[k] = (window.__hb[k] || 0) + 1; } return r; }; }
    window.__hb = hitBy;
    for (let f = 0; f < N; f++) {
      A.startIntro(true); A.CAM.t = 5; for (let i = 0; i < 30; i++) A.step(1 / 60);
      const release = {}; const press = (t) => { I.held[t] = true; I.press(t); release[t] = 4; };
      let lastMv = null, punN = 0, sideHold = 0, sideDir = 1, thr = 0.18, knows = true, lastMoveKey = '', lastHitIdx = -1, hits = 0, fr;
      for (fr = 0; fr < 60 * 60 * 5; fr++) {
        const d = Math.hypot(B.pos.x - P.pos.x, B.pos.z - P.pos.z);
        for (const k in release) { if (--release[k] <= 0) { I.held[k] = false; delete release[k]; } }
        I.sx = 0; I.sy = d > 2.3 ? 1 : 0;
        if (sideHold > 0) { sideHold--; I.sx = sideDir; I.sy = 0; }
        let incoming = null;
        if (B.state === 'move' && B.move) {
          const key = B.move.name + ':' + B.t.toFixed(0);
          const tt = mode === 'human' && !knows ? B.t : (B.tm ?? B.t);
          for (let i = 0; i < B.move.hits.length; i++) { const h = B.move.hits[i]; const dt = h[0] - tt; if (dt > -0.02 && dt < 0.4) { incoming = { dt, i }; break; } }
        }
        // new incoming blow: a human picks a slightly random timing, and only half the time sees through a held wind-up
        if (incoming && incoming.i !== lastHitIdx) { lastHitIdx = incoming.i; thr = mode === 'human' ? 0.06 + Math.random() * 0.28 : 0.18; knows = Math.random() < 0.5; }
        if (!incoming) lastHitIdx = -1;
        if ((mode === 'perfect' || mode === 'human' || mode === 'side') && incoming && incoming.dt < thr && d < 7.5 && P.state !== 'dodge') { if (mode === 'side') { sideDir = Math.random() < 0.5 ? -1 : 1; sideHold = 12; I.sx = sideDir; I.sy = 0; } press('dodge'); }
        else if (mode === 'parry' && incoming && incoming.dt < 0.06 && d < 4.5 && P.state !== 'parry') press('guard');
        // expert: picks the answer the attack asks for (parry sweeps, side-step thrusts/slams, back out of the stamp, limit punishes)
        if (mode === 'expert') {
          const tt = B.tm ?? B.t;
          if (B.state === 'move' && B.move && B.move.name === 'stomp' && tt > B.move.ringHit - 0.06 && tt < B.move.ringHit + 0.1 && P.state !== 'dodge') { sideHold = 12; sideDir = 0; I.sx = 0; I.sy = -1; press('dodge'); }
          else if (incoming) {
            const h = B.move.hits[incoming.i];
            if (h[3] === 1 && Math.random() < 0.02 * 60 / 60 && false) {}
            const parryable = h[3] === 1;
            if (parryable && (f % 2 === 0) && incoming.dt < 0.06 && d < 4.5 && P.state !== 'parry') press('guard');
            else if ((!parryable || f % 2 === 1) && incoming.dt < 0.18 && d < 7.5 && P.state !== 'dodge') { sideDir = Math.random() < 0.5 ? -1 : 1; sideHold = 12; I.sx = sideDir; I.sy = 0; press('dodge'); }
          }
          if (sideHold > 0 && sideDir === 0) { I.sx = 0; I.sy = -1; }
          if (B.closeT > 1.6 && B.state === 'observe') I.sy = -1;
        }
        // conjured daggers and blade rain (Boss II): side-roll a dagger about to land, roll out of a mark about to fall
        if (mode !== 'mash' && mode !== 'parry' && P.state !== 'dodge') {
          for (const dg of A.H_PROJ) {
            if (dg.state !== 'fly' || dg.seen) continue;
            const rx = P.pos.x - dg.pos.x, rz = P.pos.z - dg.pos.z, sp = Math.hypot(dg.vel.x, dg.vel.z) || 1;
            const eta = (rx * dg.vel.x + rz * dg.vel.z) / (sp * sp);
            const t2 = mode === 'human' ? (dg.thr ??= (Math.random() < 0.5 ? 0.06 + Math.random() * 0.3 : -1)) : 0.16;
            if (eta > 0 && eta < t2) { dg.seen = true; sideDir = Math.random() < 0.5 ? -1 : 1; sideHold = 12; I.sx = sideDir; I.sy = 0; press('dodge'); break; }
          }
          for (const r of A.H_RAIN) {
            if (r.t < 0 || r.seen) continue;
            const near = Math.hypot(P.pos.x - r.pos.x, P.pos.z - r.pos.z) < 1.4;
            const when = mode === 'human' ? (r.thr ??= (Math.random() < 0.5 ? 0.25 + Math.random() * 0.5 : 2)) : 0.4;
            if (near && r.t > 0.95 - when) { r.seen = true; sideDir = Math.random() < 0.5 ? -1 : 1; sideHold = 14; I.sx = sideDir; I.sy = 0; press('dodge'); break; }
          }
        }
        const lastEnd = B.move ? (B.move.lastEnd ?? Math.max(...B.move.hits.map((h) => h[1]), 0)) : 0;
        const open = B.state === 'stagger' || B.state === 'parried' || (B.state === 'move' && B.move && (B.tm ?? B.t) > lastEnd + 0.05) || (B.state === 'observe' && B.gap > 0.4);
        if (B.move !== lastMv) { lastMv = B.move; punN = 0; }
        const allow = mode === 'expert' && B.move && B.move.tier ? B.move.tier.allow : 9;
        if ((mode === 'mash' || (open && punN < allow)) && d < 2.9 && P.st > 20 && ['idle', 'move', 'attack'].includes(P.state) && fr % 8 === 0) { if (P.state !== 'attack' || P.t > 0.5) punN++; press('atk'); }
        if (P.hp < 450 && P.flasks > 0 && (P.state === 'idle' || P.state === 'move') && d > 4) press('heal');
        A.step(1 / 60);
        if (A.GAME.mode !== 'fight') break;
      }
      res.push({ win: A.GAME.mode === 'victory', t: Math.round(A.GAME.fightTime), bhp: Math.max(0, B.hp | 0), php: Math.max(0, P.hp | 0), ph2: B.phase === 2 });
      for (let i = 0; i < 60 * 2; i++) A.step(1 / 60);
    }
    return { res, hitBy };
  }, { mode, N, BOSS });
  const r = all[mode].res;
  console.log(mode.padEnd(8), 'wins', r.filter((x) => x.win).length + '/' + r.length, 'bossHPleft avg', Math.round(r.reduce((a, x) => a + x.bhp, 0) / r.length), JSON.stringify(r.map((x) => [x.win ? 'W' : 'L', x.t, x.win ? x.php : x.bhp])), '\n   hits', JSON.stringify(all[mode].hitBy));
}
await browser.close();
