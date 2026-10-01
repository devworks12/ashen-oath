import { open } from './test.mjs';
const { browser, page, logs } = await open({ vp: { width: 844, height: 390 } });
await page.waitForFunction(() => window.__ashen, null, { timeout: 120000 });
await page.click('#btnBegin');
const r = await page.evaluate(() => { window.__manual = true; const A = window.__ashen, B=A.boss, P=A.player, I=A.INPUT; A.CAM.t = 5; for (let i=0;i<20;i++) A.step(1/60);
  const out = {}; const st = (n)=>{ for(let i=0;i<n;i++) A.step(1/60); };
  const freeze = () => { B.state='idle'; B.move=null; B.rig.anim.play(B.locoFn(),0); };
  // roll
  freeze(); P.pos.set(0,0,3); B.pos.set(0,0,-3); I.sx=1; I.sy=0; st(2); I.press('dodge'); let mt=0, maxT=0; for(let i=0;i<45;i++){ A.step(1/60); maxT=Math.max(maxT,P.rig.tumble); } I.sx=0;
  out.roll = { state:P.state, maxTumble:+maxT.toFixed(2), moved:+P.pos.x.toFixed(2) }; st(30);
  // jump + jump attack
  freeze(); I.press('jump'); let maxY=0; st(8); I.press('atk'); let atkSeen=false; for(let i=0;i<60;i++){ A.step(1/60); maxY=Math.max(maxY,P.pos.y); if(P.activeHit) atkSeen=true; }
  out.jump = { maxY:+maxY.toFixed(2), atkSeen, state:P.state, y:P.pos.y }; st(40);
  // crit after parry
  freeze(); P.hp=1000; P.pos.set(0,0,-4.6); B.pos.set(0,0,-6.5); B.rig.yaw=0; P.rig.yaw=Math.PI; B.state='observe'; B.startMove(A.MOVES.hslash); B.warp=null;
  let parried=false; for(let i=0;i<120 && !parried;i++){ const h=B.move&&B.move.hits[0]; if(B.state==='move' && h && h[0]-B.tm < 0.08 && h[0]-B.tm>0 && P.state!=='parry'){ I.held.guard=true; I.press('guard'); } A.step(1/60); I.held.guard=false; if(B.state==='parried') parried=true; }
  const hp0=B.hp; I.press('atk'); let crit=false; for(let i=0;i<150;i++){ A.step(1/60); if(P.state==='critical') crit=true; }
  out.critParry = { parried, crit, dmg: Math.round(hp0-B.hp), bossState:B.state };
  // crit after stagger
  freeze(); st(200); B.state='observe'; B.gap=99; P.pos.set(0,0,-4.8); B.pos.set(0,0,-6.5); B.poise=1; B.receiveHit({dmg:10,poise:20}, B.pos.clone().setY(1.5)); out.stag=B.state; st(20);
  const hp1=B.hp; I.press('atk'); st(130); out.critStagger = { dmg: Math.round(hp1-B.hp), state:P.state };
  // guard counter
  freeze(); st(60); P.pos.set(0,0,-4.6); B.pos.set(0,0,-6.5); B.rig.yaw=0; P.rig.yaw=Math.PI; P.st=100; I.held.guard=true; I.press('guard'); st(20); B.state='observe'; B.startMove(A.MOVES.hslash); B.warp=null;
  let gh=false, gc=false; for(let i=0;i<120;i++){ A.step(1/60); if(P.state==='guardHit'&&!gh){ gh=true; I.press('atk'); } if(gh && P.state==='heavy') gc=true; } I.held.guard=false;
  out.guardCounter = { guardHit: gh, counter: gc };
  // skill
  freeze(); st(60); P.fp=100; P.pos.set(0,0,-2); B.pos.set(0,0,-6.5); const hp2=B.hp; I.press('skill'); st(80); out.skill = { fp:P.fp, dmg: Math.round(hp2-B.hp) };
  // leap & flurry (phase 2)
  B.phase=2; B.setPhaseLook(1); freeze(); st(60); P.hp=1000; P.pos.set(0,0,4); B.pos.set(0,0,-5); B.rig.yaw=0; B.state='observe'; B.startMove(A.MOVES.leap); let maxBY=0; for(let i=0;i<180;i++){ A.step(1/60); maxBY=Math.max(maxBY,B.pos.y); }
  out.leap = { maxBY:+maxBY.toFixed(2), bz:+B.pos.z.toFixed(2), php:P.hp, by:B.pos.y };
  P.hp=1000; st(60); P.pos.set(0,0,-4.4); B.pos.set(0,0,-6.5); B.rig.yaw=0; B.state='observe'; B.startMove(A.MOVES.flurry); B.warp=null; st(220); out.flurry = { php: P.hp, last: B.last[0] };
  // delay variant freezes
  P.hp=1000; st(60); B.state='observe'; B.startMove(A.MOVES.overhead); B.warp={at:B.move.hits[0][0]-0.12, len:0.5}; let frozenFrames=0, lastTm=-1; for(let i=0;i<150;i++){ A.step(1/60); if(B.state==='move'){ if(B.tm===lastTm) frozenFrames++; lastTm=B.tm; } }
  out.warp = { frozenFrames };
  return out; });
console.log(JSON.stringify(r, null, 1));
console.log(logs.filter(l=>!l.includes('non-indexed')).slice(0,20).join('\n'));
await browser.close();
