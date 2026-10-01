import { open } from './test.mjs';
const { browser, page, logs } = await open({ vp: { width: 844, height: 390 } });
await page.waitForFunction(() => window.__ashen, null, { timeout: 120000 });
await page.click('#btnBegin');
const r = await page.evaluate(() => { window.__manual = true; const A = window.__ashen, B=A.boss, P=A.player; A.CAM.t = 5; for (let i=0;i<20;i++) A.step(1/60);
  const out = {};
  // grab
  P.pos.set(0,0,-4.8); B.pos.set(0,0,-6.5); B.rig.yaw=0; B.state='observe'; B.startMove(A.MOVES.grab);
  let seen = {}; for (let i=0;i<60*4;i++){ A.step(1/60); seen[P.state]=1; seen['b:'+(B.move?B.move.name:B.state)]=1; }
  out.grab = [Object.keys(seen), P.hp];
  // guard counter
  P.hp=1000; for (let i=0;i<60;i++) A.step(1/60);
  P.pos.set(0,0,-4.6); B.pos.set(0,0,-6.5); B.rig.yaw=0; P.rig.yaw=Math.PI; B.state='observe'; B.startMove(A.MOVES.guard);
  for (let i=0;i<20;i++) A.step(1/60);
  P.state='idle'; A.INPUT.press('atk'); seen={};
  for (let i=0;i<60*2;i++){ A.step(1/60); seen[P.state]=1; seen['b:'+(B.move?B.move.name:B.state)]=1; }
  out.counter = [Object.keys(seen), P.hp, B.hp];
  // shockwave damage at distance 4 while idle
  P.hp=1000; B.phase=2; P.pos.set(0,0,-2.5); B.pos.set(0,0,-6.5); B.rig.yaw=0; B.state='observe'; B.startMove(A.MOVES.shockwave);
  for (let i=0;i<60*2.2;i++){ A.step(1/60); }
  out.shock = [P.hp, P.state];
  // hitbox fairness: player behind the boss during hslash should not be hit
  P.hp=1000; for (let i=0;i<60;i++) A.step(1/60); P.state='idle';
  B.phase=1; A.VFX.clear(); B.pos.set(0,0,0); P.pos.set(0,0,-2.0); B.rig.yaw=0; B.state='observe'; B.startMove(A.MOVES.hslash); B.move.track=[];
  for (let i=0;i<60*1.4;i++){ A.step(1/60); P.pos.set(0,0,-2.0); }
  out.behind = [P.hp, P.lastHitBy, B.phase];
  P.hp=1000; P.state='idle'; B.pos.set(0,0,0); P.pos.set(0,0,5.5); B.rig.yaw=0; B.state='observe'; B.startMove(A.MOVES.hslash); B.move.track=[];
  for (let i=0;i<60*1.4;i++){ A.step(1/60); P.pos.set(0,0,5.5);}
  out.far = P.hp;
  P.hp=1000; P.state='idle'; B.pos.set(0,0,0); P.pos.set(0,0,2.4); B.rig.yaw=0; B.state='observe'; B.startMove(A.MOVES.hslash);
  for (let i=0;i<60*1.4;i++){ A.step(1/60); }
  out.front = P.hp;
  return out; });
console.log(JSON.stringify(r));
console.log(logs.filter(l=>!l.includes('non-indexed')).slice(0,20).join('\n'));
await browser.close();
