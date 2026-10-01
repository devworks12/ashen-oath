// ------------------------------------------------------------------ camera
const CAM = { yaw: Math.PI, dist: 5.2, look: V3(0, 1.5, 0), shakeA: 0, shakeT: 0, mode: 'title', t: 0, fov: 52, pos: V3(0, 3, 10) };
function shake(a) { CAM.shakeA = Math.max(CAM.shakeA, a * SETTINGS.shake); }
const _cp = V3(), _cl = V3();
function camCollide(from, to) {
  // shorten the from→to segment against the outer wall and the pillars
  const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz);
  let t = 1;
  const R = WALL_R - 1.8;
  // circle (wall) — solve |from + d t| = R
  const a = dx * dx + dz * dz, b = 2 * (from.x * dx + from.z * dz), c = from.x * from.x + from.z * from.z - R * R;
  const disc = b * b - 4 * a * c;
  if (c < 0 && disc > 0) { const tt = (-b + Math.sqrt(disc)) / (2 * a); if (tt < t) t = Math.max(0.2, tt); }
  for (const p of PILLARS) {
    const fx = from.x - p.x, fz = from.z - p.z, r = p.r + 0.45;
    const bb = 2 * (fx * dx + fz * dz), cc = fx * fx + fz * fz - r * r, dd = bb * bb - 4 * a * cc;
    if (dd > 0) { const tt = (-bb - Math.sqrt(dd)) / (2 * a); if (tt > 0 && tt < t) t = Math.max(0.25, tt); }
  }
  return t * L;
}
function updateCamera(dt, rdt) {
  CAM.t += rdt;
  let pos = _cp, look = _cl;
  if (CAM.mode === 'title') {
    const sway = Math.sin(CAM.t * 0.18) * 0.35;
    pos.set(2.5 + sway, 1.4 + Math.sin(CAM.t * 0.23) * 0.06, 7.2);
    look.set(0.1 + sway * 0.3, 2.05, -3.5);
    camera.position.lerp(pos, 1 - Math.exp(-2 * rdt)); CAM.look.lerp(look, 1 - Math.exp(-2 * rdt));
  } else if (CAM.mode === 'intro') {
    const t = CAM.t, B = boss.pos;
    const keys = [
      [0, V3(-9.5, 5.2, 9), V3(0, 3.0, -9)],
      [1.0, V3(-7.5, 4.2, 6), V3(0, 2.6, -8)],
      [2.5, V3(-1.6, 2.2, -3.3), V3(B.x, 2.3, B.z)],
      [3.5, V3(1.2, 1.25, -4.3), V3(B.x, 2.0, B.z)],
      [5.0, V3(0.4, 2.5, 11), V3(0, 1.6, -2)],
    ];
    let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const A = keys[i], Bk = keys[i + 1], k = EASE.io(clamp((t - A[0]) / (Bk[0] - A[0]), 0, 1));
    camera.position.lerpVectors(A[1], Bk[1], k); CAM.look.lerpVectors(A[2], Bk[2], k);
    if (t > 3.5) { // blend into the gameplay rig
      const g = smooth(clamp((t - 3.5) / 1.5, 0, 1));
      fightCamTarget(pos, look); camera.position.lerp(pos, g); CAM.look.lerp(look, g);
      CAM.dist = 5.2; CAM.yaw = Math.atan2(player.pos.x - boss.pos.x, player.pos.z - boss.pos.z);
    }
  } else if (CAM.mode === 'manual') {
    const k = CAM.manual; camera.position.set(k[0], k[1], k[2]); CAM.look.set(k[3], k[4], k[5]);
  } else if (CAM.mode === 'orbit') {
    const c = CAM.orbitC, a = CAM.orbitA + CAM.t * 0.12;
    const ideal = V3(c.x + Math.sin(a) * CAM.orbitR, CAM.orbitH, c.z + Math.cos(a) * CAM.orbitR);
    const rr = camCollide(V3(c.x, CAM.orbitH, c.z), ideal);
    pos.set(c.x + Math.sin(a) * rr, CAM.orbitH, c.z + Math.cos(a) * rr);
    look.set(c.x, CAM.orbitLY, c.z);
    camera.position.lerp(pos, 1 - Math.exp(-1.5 * rdt)); CAM.look.lerp(look, 1 - Math.exp(-2 * rdt));
  } else {
    fightCamTarget(pos, look, dt || rdt);
    camera.position.lerp(pos, 1 - Math.exp(-14 * rdt));
    CAM.look.lerp(look, 1 - Math.exp(-9 * rdt));
  }
  camera.lookAt(CAM.look);
  // impulse shake (decaying, not constant)
  if (CAM.shakeA > 0.001) {
    CAM.shakeT += rdt * 38;
    const s = CAM.shakeA * 0.06;
    camera.rotateX((Math.sin(CAM.shakeT * 1.3) + Math.sin(CAM.shakeT * 2.9) * 0.5) * s * 0.35);
    camera.rotateY((Math.sin(CAM.shakeT * 1.7 + 1) + Math.sin(CAM.shakeT * 3.3) * 0.4) * s * 0.3);
    camera.rotateZ(Math.sin(CAM.shakeT * 1.1 + 2) * s * 0.18);
    CAM.shakeA *= Math.exp(-9 * rdt);
  }
}
function fightCamTarget(pos, look, dt = 0) {
  const P = player.pos, B = boss.pos;
  const dx = P.x - B.x, dz = P.z - B.z, len = Math.hypot(dx, dz);
  const want = len > 0.2 ? Math.atan2(dx, dz) : CAM.yaw;
  if (dt > 0) CAM.yaw = dampAngle(CAM.yaw, want, len < 1.5 ? 2.5 : 4.2, dt); else CAM.yaw = want;
  const close = clamp((3.4 - len) / 2.4, 0, 1);
  if (CAM.critT > 0 && dt > 0) CAM.critT -= dt;
  const crit = CAM.critT > 0 ? smooth(clamp(Math.min(CAM.critT, 2.2 - CAM.critT) / 0.35, 0, 1)) : 0; // tighter framing during critical blows
  const wantDist = lerp(5.0 + close * 1.1, 3.3, crit), h = lerp(2.3 + close * 0.6, 1.85, crit);
  const ideal = V3(P.x + Math.sin(CAM.yaw) * wantDist, h, P.z + Math.cos(CAM.yaw) * wantDist);
  const allowed = camCollide(V3(P.x, h, P.z), ideal);
  if (dt > 0) CAM.dist = damp(CAM.dist, allowed, allowed < CAM.dist ? 16 : 2.5, dt); else CAM.dist = allowed;
  const lift = (wantDist - CAM.dist) * 0.25;
  // slight over-the-shoulder offset so the player never hides the Warden's wind-up
  const side = lerp(0.55 + close * 0.35, 1.25, CAM.critT > 0 ? smooth(clamp(Math.min(CAM.critT, 2.2 - CAM.critT) / 0.35, 0, 1)) : 0);
  pos.set(P.x + Math.sin(CAM.yaw) * CAM.dist + Math.cos(CAM.yaw) * side, h + lift, P.z + Math.cos(CAM.yaw) * CAM.dist - Math.sin(CAM.yaw) * side);
  const w = len > 9 ? 0.3 : 0.42;
  const bossY = boss.state === 'dead' ? 1.3 : 1.85;
  look.set(lerp(P.x, B.x, w), lerp(1.15, bossY, w), lerp(P.z, B.z, w));
}

// ------------------------------------------------------------------ DOM / UI
const $ = (id) => document.getElementById(id);
const UI = {
  hpFill: $('hpFill'), hpChip: $('hpChip'), stFill: $('stFill'), bFill: $('bFill'), bChip: $('bChip'), flaskN: $('flaskN'),
  hud: $('hud'), bossHud: $('bossHud'), controls: $('controls'),
};
function show(el, on) { el.hidden = !on; }
function setMode(m) { document.body.dataset.mode = m; }
// boss damage counter next to the name (accumulates while hits keep landing)
let dmgAcc = 0, dmgT = 0;
function UI_DMG(d) { dmgAcc += d; dmgT = 1.6; const el = $('bDmg'); el.textContent = Math.round(dmgAcc); el.classList.add('on'); }
const _lp = V3();
function updateHUD(dt) {
  if (dmgT > 0) { dmgT -= dt; if (dmgT <= 0) { dmgAcc = 0; $('bDmg').classList.remove('on'); } }
  $('fpFill').style.transform = `scaleX(${player.fp / PL.fp})`;
  $('eqFlask').textContent = player.flasks;
  // lock-on marker on the Warden's chest
  const ld = $('lockDot');
  if (GAME.mode === 'fight' && boss.state !== 'dead') {
    boss.rig.chest.getWorldPosition(_lp); _lp.project(camera);
    const vis = _lp.z < 1 && Math.abs(_lp.x) < 1.05 && Math.abs(_lp.y) < 1.05;
    ld.hidden = !vis; if (vis) ld.style.transform = `translate(${(_lp.x * 0.5 + 0.5) * viewW}px, ${(-_lp.y * 0.5 + 0.5) * viewH}px)`;
  } else ld.hidden = true;
  player.chipHp = player.hp < player.chipHp ? damp(player.chipHp, player.hp, GAME.time - (player.lastDmgT || 0) > 0.6 ? 4 : 0, dt) : player.hp;
  if (player.hp < player.chipHp - 0.1 && player.lastHpSeen > player.hp) player.lastDmgT = GAME.time;
  player.lastHpSeen = player.hp;
  UI.hpFill.style.transform = `scaleX(${Math.max(0, player.hp) / PL.hp})`;
  UI.hpChip.style.transform = `scaleX(${Math.max(0, player.chipHp) / PL.hp})`;
  UI.stFill.style.transform = `scaleX(${player.st / PL.st})`;
  UI.stFill.parentElement.classList.toggle('empty', player.st < 1);
  boss.chipHp = boss.hp < boss.chipHp ? damp(boss.chipHp, boss.hp, GAME.time - (boss.lastDmgT || 0) > 0.7 ? 3.5 : 0, dt) : boss.hp;
  if (boss.lastHpSeen > boss.hp) boss.lastDmgT = GAME.time;
  boss.lastHpSeen = boss.hp;
  UI.bFill.style.transform = `scaleX(${boss.hp / BOSS_HP})`;
  UI.bChip.style.transform = `scaleX(${boss.chipHp / BOSS_HP})`;
  UI.bossHud.classList.toggle('p2', boss.phase === 2);
  UI.flaskN.textContent = player.flasks;
  $('btnHeal').classList.toggle('empty', player.flasks <= 0);
  $('btnSkill').classList.toggle('empty', player.fp < PL.skillFp);
}

// touch: virtual stick + buttons
(function initTouch() {
  const zone = $('stickZone'), base = $('stickBase'), knob = $('stickKnob');
  let id = null, ox = 0, oy = 0; const R0 = 56; let R = R0;
  const rest = () => { base.classList.remove('active'); base.style.transform = ''; knob.style.transform = 'translate(-50%,-50%)'; };
  zone.addEventListener('pointerdown', (e) => {
    if (id !== null) return; id = e.pointerId; try { zone.setPointerCapture(id); } catch (x) {}
    const r = zone.getBoundingClientRect(); ox = e.clientX; oy = e.clientY;
    base.classList.add('active'); R = R0 * UI_ZC; base.style.left = (ox - r.left) / UI_ZC + 'px'; base.style.top = (oy - r.top) / UI_ZC + 'px'; base.style.bottom = 'auto';
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - ox, dy = e.clientY - oy; const l = Math.hypot(dx, dy);
    const ux = l > 0 ? dx / l : 0, uy = l > 0 ? dy / l : 0; // direction from the raw drag (clamping below is visual only)
    if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(calc(-50% + ${dx / UI_ZC}px), calc(-50% + ${dy / UI_ZC}px))`;
    const m = Math.min(1, l / R); const dz = m < 0.12 ? 0 : (m - 0.12) / 0.88;
    INPUT.sx = ux * dz; INPUT.sy = -uy * dz;
  });
  const end = (e) => { if (e.pointerId !== id) return; id = null; INPUT.sx = INPUT.sy = 0; rest(); base.style.left = ''; base.style.top = ''; base.style.bottom = ''; };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  for (const [btn, type] of [['btnAtk', 'atk'], ['btnDodge', 'dodge'], ['btnGuard', 'guard'], ['btnHeal', 'heal'], ['btnJump', 'jump'], ['btnSkill', 'skill']]) {
    const el = $(btn); const ids = new Set();
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); ids.add(e.pointerId); try { el.setPointerCapture(e.pointerId); } catch (x) {} INPUT.held[type] = true; INPUT.press(type); el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pressed', 'pulse'); });
    const up = (e) => { if (!ids.has(e.pointerId)) return; ids.delete(e.pointerId); if (!ids.size) { INPUT.held[type] = false; el.classList.remove('pressed'); } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  document.addEventListener('gesturestart', (e) => e.preventDefault());
})();
// keyboard / mouse (desktop testing)
const KEYMAP = { KeyJ: 'atk', KeyK: 'dodge', Space: 'jump', ShiftLeft: 'dodge', KeyL: 'guard', KeyH: 'heal', KeyE: 'heal', KeyU: 'skill' };
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') { togglePause(); return; }
  const mv = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd' }[e.code];
  if (mv) { INPUT.kb[mv] = 1; e.preventDefault(); return; }
  const t = KEYMAP[e.code]; if (!t || e.repeat) return; e.preventDefault();
  INPUT.held[t] = true; INPUT.press(t);
});
window.addEventListener('keyup', (e) => {
  const mv = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ArrowUp: 'w', ArrowLeft: 'a', ArrowDown: 's', ArrowRight: 'd' }[e.code];
  if (mv) { INPUT.kb[mv] = 0; return; }
  const t = KEYMAP[e.code]; if (t) INPUT.held[t] = false;
});
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || GAME.mode !== 'fight') return; const t = e.button === 2 ? 'guard' : e.button === 0 ? 'atk' : null; if (t) { INPUT.held[t] = true; INPUT.press(t); } });
window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') return; if (e.button === 2) INPUT.held.guard = false; if (e.button === 0) INPUT.held.atk = false; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------------ world objects
let player, boss, playerTrail, bossTrail;
const _capeWind = V3(), _capeDown = V3(0, -1, -0.15).normalize();
function capePins(rig, c, row2, out) {
  const cols = c.cloth.cols;
  for (let i = 0; i < cols; i++) {
    const u = i / (cols - 1);
    const x = lerp(-c.w / 2, c.w / 2, u);
    const v = out[i] || (out[i] = V3());
    if (row2) v.set(x * 1.08, c.y2, c.z2 - Math.sin(u * Math.PI) * c.curve); else v.set(x, c.y, c.z - Math.sin(u * Math.PI) * c.curve);
    (c.anchor === 'pelvis' ? rig.pelvis : rig.chest).localToWorld(v);
  }
  return out;
}
function capeColliders(rig, s, out) {
  if (!out.length) for (let i = 0; i < 5; i++) out.push({ a: V3(), b: V3(), r: 0 });
  const w = (v, o, x = 0, y = 0, z = 0) => o.localToWorld(v.set(x, y, z));
  const b = rig.o.bulk || 1;
  w(out[0].a, rig.pelvis, 0, -0.05, -0.02); w(out[0].b, rig.chest, 0, 0.18, -0.02); out[0].r = 0.2 * s * (b > 1 ? 1.2 : 1);
  w(out[1].a, rig.thR); w(out[1].b, rig.shR); out[1].r = 0.1 * s * b;
  w(out[2].a, rig.thL); w(out[2].b, rig.shL); out[2].r = 0.1 * s * b;
  w(out[3].a, rig.shR); w(out[3].b, rig.footR, 0, 0.1, 0); out[3].r = 0.075 * s * b;
  w(out[4].a, rig.shL); w(out[4].b, rig.footL, 0, 0.1, 0); out[4].r = 0.075 * s * b;
  return out;
}
function updateCapes(rig, dt, reset = false) {
  const cols = rig._capeCols || (rig._capeCols = capeColliders(rig, rig.o.scale, []));
  capeColliders(rig, rig.o.scale, cols);
  for (const c of rig.capes) {
    const pins = capePins(rig, c, false, c.p1 || (c.p1 = [])), pins2 = capePins(rig, c, true, c.p2 || (c.p2 = []));
    if (reset || !c.cloth.inited) c.cloth.reset(pins, _capeDown);
    _capeWind.set(Math.sin(GAME.time * 0.7) * 1.2, 0, Math.cos(GAME.time * 0.43) * 0.8 + 0.6);
    c.cloth.update(Math.min(dt, 1 / 30), pins, pins2, cols, _capeWind);
  }
}

function resetFight() {
  player.reset(); boss.reset();
  GAME.fightTime = 0; GAME.hitStop = 0; GAME.slowT = 0; GAME.over = false; CAM.critT = 0; dmgAcc = 0; dmgT = 0; TELE.crits = 0;
  VFX.clear(); hazards.length = 0; waves.length = 0; playerTrail.clear(); bossTrail.clear();
  for (const f of extraClears) f();
  ARENA.warm = 0; ARENA.violet = 0; GRADE.uWarm.value = 0; GRADE.uFade.value = 0; GRADE.uHurt.value = 0; GRADE.uFocus.value = 0;
  player.rig.update(0.016); boss.rig.update(0.016); player.afterRig(); boss.afterRig();
  updateCapes(player.rig, 0, true); updateCapes(boss.rig, 0, true);
  boss.kneeled = boss.crumbled = false;
  INPUT.clear();
  AUDIO.muffle(false, 0.3);
  for (const id of ['fallen', 'victory']) show($(id), false);
  $('fallen').classList.remove('in'); $('victory').classList.remove('in', 'showReward');
  TELE.start = GAME.time; TELE.dmgTaken = 0; TELE.heals = 0; TELE.parries = 0; TELE.perfect = 0; TELE.fights++;
}

// ------------------------------------------------------------------ flow
let introT = 0, endT = 0, tutorialT = -1;
function startIntro(short) {
  resetFight();
  GAME.mode = 'intro'; setMode('intro'); introT = 0; GAME.introShort = short;
  CAM.t = short ? 3.5 : 0; CAM.mode = 'intro';
  boss.rig.anim.play(B_INTRO, 0); if (short) boss.rig.anim.t = 2.4;
  show(UI.hud, false); show(UI.controls, false); show(UI.bossHud, false);
  $('introCard').classList.remove('in'); show($('introCard'), true);
  if (!short) { MUSIC.stop(0.5); }
}
function beginFight() {
  GAME.mode = 'fight'; setMode('fight'); CAM.mode = 'fight';
  boss.state = 'observe'; boss.t = 0; boss.gap = 0.9; boss.rig.anim.play(boss.locoFn(), 0.4);
  show(UI.hud, true); show(UI.controls, true); show(UI.bossHud, true); show($('introCard'), false); show($('ashes'), true); $('ashN').textContent = (SETTINGS.ashes || 0).toLocaleString();
  if (!MUSIC.on) MUSIC.start(1);
  if (!SETTINGS.seenTutorial) { tutorialT = 0; }
  SETTINGS.fights++; saveSettings();
}
function onPlayerDeath() {
  GAME.over = true; endT = 0; GAME.mode = 'dead'; setMode('dead');
  AUDIO.muffle(true, 1.0); MUSIC.stop(2.5);
  playerTrail.on = false;
}
function onBossDeath() {
  $('lockDot').hidden = true;
  GAME.over = true; endT = 0; GAME.mode = 'victory'; setMode('victory');
  ['tMove', 'tAtk', 'tDodge', 'tGuard', 'tSkill'].forEach((s) => $(s).classList.remove('in')); tutorialT = -1;
  INPUT.clear();
}
function updateFlow(rdt) {
  if (GAME.mode === 'intro') {
    introT += rdt;
    const t = CAM.t;
    if (t > 3.5 && !$('introCard').classList.contains('in')) { $('introCard').classList.add('in'); AUDIO.play('ui'); if (!MUSIC.on) MUSIC.start(1); }
    if (t > 3.5 && !GAME.introShort && !GAME.introTitleSfx) { GAME.introTitleSfx = true; AUDIO.play('kneel'); }
    if (t > 2.55 && t < 2.6 && !GAME.raiseSfx) { GAME.raiseSfx = true; AUDIO.play('armor'); AUDIO.play('stepBoss'); }
    if (t >= 5.0) { GAME.introTitleSfx = false; GAME.raiseSfx = false; beginFight(); }
  } else if (GAME.mode === 'dead') {
    endT += rdt;
    GRADE.uFade.value = Math.min(0.55, endT * 0.45);
    if (endT > 1.5 && $('fallen').hidden) { show(UI.hud, false); show(UI.bossHud, false); show($('lockDot'), false); ['tMove', 'tAtk', 'tDodge', 'tGuard', 'tSkill'].forEach((k) => $(k).classList.remove('in')); tutorialT = -1; show($('fallen'), true); requestAnimationFrame(() => $('fallen').classList.add('in')); AUDIO.play('fallen'); show(UI.controls, false); }
    if (endT > 1.3) { CAM.mode = 'orbit'; if (!CAM.orbitC) { } }
  } else if (GAME.mode === 'victory') {
    endT += rdt;
    if (endT > 0.2 && CAM.mode !== 'orbit') { CAM.mode = 'orbit'; CAM.t = 0; CAM.orbitC = boss.pos.clone(); CAM.orbitA = CAM.yaw + 0.5; CAM.orbitR = 5.2; CAM.orbitH = 2.2; CAM.orbitLY = 1.3; }
    if (endT > 0.7) show(UI.controls, false);
    if (endT > 5.0 && $('victory').hidden) {
      show($('victory'), true); requestAnimationFrame(() => $('victory').classList.add('in')); AUDIO.play('victory');
      const secs = Math.round(GAME.fightTime); $('vStats').innerHTML = `<span><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b> time</span><span><b>${TELE.parries}</b> parries</span><span><b>${TELE.crits || 0}</b> critical blows</span><span><b>${TELE.perfect}</b> perfect dodges</span><span><b>${TELE.heals}</b> flasks used</span>`;
      show(UI.bossHud, false); show(UI.hud, false);
      // ashes gained: counts up into the persistent total
      SETTINGS.beaten = { ...(SETTINGS.beaten || {}), [boss.def.id]: true };
      const gain = boss.def.id === 'herald' ? 72000 : 48000, from = SETTINGS.ashes || 0; SETTINGS.ashes = from + gain; saveSettings(); syncBossSelect();
      const t0 = performance.now(), tick = () => { const k = Math.min(1, (performance.now() - t0) / 1800); const v = Math.round(gain * EASE.out3(k)); $('vAshes').textContent = `+${v.toLocaleString()} ashes`; $('ashN').textContent = (from + v).toLocaleString(); if (k < 1) requestAnimationFrame(tick); };
      $('vAshes').textContent = ''; setTimeout(tick, 900);
    }
    if (endT > 6.6) $('victory').classList.add('showReward');
  }
  if (GAME.mode === 'dead' && CAM.mode === 'orbit' && !CAM.deadSet) { CAM.deadSet = true; CAM.t = 0; CAM.orbitC = player.pos.clone(); CAM.orbitA = CAM.yaw - 0.6; CAM.orbitR = 4.2; CAM.orbitH = 1.9; CAM.orbitLY = 0.6; }
  if (GAME.mode !== 'dead') CAM.deadSet = false;
  // tutorial chips (first fight only)
  if (tutorialT >= 0 && GAME.mode === 'fight') {
    tutorialT += rdt;
    const steps = ['tMove', 'tAtk', 'tDodge', 'tGuard', 'tSkill'];
    const idx = Math.floor(tutorialT / 3.2);
    steps.forEach((s, i) => $(s).classList.toggle('in', i === idx));
    if (idx >= steps.length) { tutorialT = -1; SETTINGS.seenTutorial = true; saveSettings(); steps.forEach((s) => $(s).classList.remove('in')); }
  }
}
function retry() { AUDIO.play('ui'); CAM.orbitC = null; startIntro(true); }

// ---- bosses: one fight at a time; the chosen one is shown on the title and remembered
const BOSSES = {};
function selectBoss(id) {
  const def = BOSS_DEFS[id] || KNIGHT_DEF;
  if (SETTINGS.boss !== def.id) { SETTINGS.boss = def.id; saveSettings(); }
  applyBossDef(def);
  for (const k in BOSSES) { const b = BOSSES[k], on = k === def.id; b.rig.root.visible = on; for (const c of b.rig.capes) c.cloth.mesh.visible = on; }
  boss = BOSSES[def.id];
  bossLight.color.set(def.light); bossLight.intensity = 0;
  document.querySelectorAll('.bossName').forEach((el) => { el.textContent = def.name; });
  document.querySelectorAll('.bossSub').forEach((el) => { el.textContent = def.sub; });
  $('vTitle').textContent = def.victory.title; $('vArt').textContent = def.victory.art; $('vDesc').textContent = def.victory.desc;
  syncBossSelect();
  if (GAME.mode === 'title' || GAME.mode === 'loading') placeTitleTableau();
}
function syncBossSelect() {
  document.querySelectorAll('.bossopt').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.boss === SETTINGS.boss));
    b.classList.toggle('beaten', !!(SETTINGS.beaten && SETTINGS.beaten[b.dataset.boss]));
  });
}
function placeTitleTableau() {
  boss.reset(); player.reset();
  player.pos.set(1.15, 0, 3.6); player.rig.yaw = Math.PI - 0.1; player.rig.resetFeet();
  boss.pos.set(0.1, 0, -1.6); boss.rig.yaw = 0.12; boss.rig.resetFeet(); boss.rig.anim.play(boss.locoFn(), 0);
  player.rig.update(0.016); boss.rig.update(0.016); player.afterRig(); boss.afterRig();
  updateCapes(player.rig, 0, true); updateCapes(boss.rig, 0, true);
}
function goHome() {
  if (paused) { paused = false; if (AUDIO.ready) AUDIO.ctx.resume(); }
  show($('pause'), false);
  for (const id of ['fallen', 'victory', 'introCard']) { show($(id), false); $(id).classList.remove('in', 'showReward'); }
  show(UI.hud, false); show(UI.controls, false); show(UI.bossHud, false); $('lockDot').hidden = true; show($('ashes'), false);
  ['tMove', 'tAtk', 'tDodge', 'tGuard', 'tSkill'].forEach((k) => $(k).classList.remove('in')); tutorialT = -1;
  MUSIC.stop(0.6); AUDIO.muffle(false, 0.3); AUDIO.play('ui');
  resetFight();
  GAME.mode = 'title'; setMode('title'); CAM.mode = 'title'; CAM.t = 0; CAM.orbitC = null;
  placeTitleTableau();
  show($('title'), true); syncBossSelect(); if (window.placeGlint) placeGlint();
}

// pause / settings
let paused = false;
function syncSound() {
  const m = !!SETTINGS.muted; $('sndWave').style.display = m ? 'none' : ''; $('sndX').style.display = m ? '' : 'none';
  $('btnSoundT').setAttribute('aria-label', m ? 'Sound off' : 'Sound on'); $('btnSoundT').setAttribute('aria-pressed', String(m));
}
function openSettings(fromTitle) {
  $('pauseTitle').textContent = fromTitle ? 'Settings' : 'Paused';
  show($('btnResume'), !fromTitle); show($('btnRestart'), !fromTitle); show($('btnHome'), !fromTitle); show($('btnCloseSettings'), fromTitle);
  show($('pause'), true);
}
function togglePause(force) {
  if (GAME.mode !== 'fight' && !paused) return;
  paused = force !== undefined ? force : !paused;
  if (paused) openSettings(false); else show($('pause'), false);
  if (paused) INPUT.clear();
  AUDIO.play('ui');
  if (AUDIO.ready) { if (paused) AUDIO.ctx.suspend(); else AUDIO.ctx.resume(); }
}
function syncSettingsUI() {
  document.querySelectorAll('[data-q]').forEach((b) => b.setAttribute('aria-pressed', String(SETTINGS.quality === b.dataset.q)));
  document.querySelectorAll('[data-shake]').forEach((b) => b.setAttribute('aria-pressed', String(String(SETTINGS.shake) === b.dataset.shake)));
  document.querySelectorAll('[data-hap]').forEach((b) => b.setAttribute('aria-pressed', String(String(SETTINGS.haptics) === b.dataset.hap)));
  $('musVol').value = SETTINGS.music; $('sfxVol').value = SETTINGS.sfx;
  $('qNow').textContent = QUALITY[qualityName].name;
}
function initMenus() {
  $('btnPause').addEventListener('click', () => togglePause(true));
  $('btnResume').addEventListener('click', () => togglePause(false));
  $('btnRestart').addEventListener('click', () => { togglePause(false); retry(); });
  $('btnRetry').addEventListener('click', retry);
  $('btnAgain').addEventListener('click', retry);
  for (const id of ['btnHome', 'btnHomeF', 'btnHomeV']) $(id).addEventListener('click', goHome);
  document.querySelectorAll('.bossopt').forEach((b) => b.addEventListener('click', () => { if (SETTINGS.boss === b.dataset.boss) return; AUDIO.init(); AUDIO.play('ui'); selectBoss(b.dataset.boss); }));
  document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { SETTINGS.quality = b.dataset.q; saveSettings(); applyQuality(b.dataset.q === 'auto' ? initialQuality() : b.dataset.q); autoQ.locked = false; syncSettingsUI(); AUDIO.play('ui'); }));
  document.querySelectorAll('[data-shake]').forEach((b) => b.addEventListener('click', () => { SETTINGS.shake = +b.dataset.shake; saveSettings(); syncSettingsUI(); AUDIO.play('ui'); }));
  document.querySelectorAll('[data-hap]').forEach((b) => b.addEventListener('click', () => { SETTINGS.haptics = b.dataset.hap === 'true'; saveSettings(); syncSettingsUI(); haptic(15); AUDIO.play('ui'); }));
  $('musVol').addEventListener('input', (e) => { SETTINGS.music = +e.target.value; AUDIO.volumes(); saveSettings(); });
  $('sfxVol').addEventListener('input', (e) => { SETTINGS.sfx = +e.target.value; AUDIO.volumes(); saveSettings(); });
  const go = (short) => {
    AUDIO.init(); AUDIO.setMuted(!!SETTINGS.muted); AUDIO.play('ui');
    try { const el = document.documentElement; if (isTouch && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); } catch (e) {}
    show($('title'), false); show($('glintLine'), false); show($('glintStar'), false);
    startIntro(short);
  };
  $('btnBegin').addEventListener('click', () => go(false));
  $('btnContinue').addEventListener('click', () => go(true)); // straight to the fight: short intro
  $('btnSettingsT').addEventListener('click', () => { AUDIO.play('ui'); openSettings(true); });
  $('btnCloseSettings').addEventListener('click', () => { AUDIO.play('ui'); show($('pause'), false); });
  $('btnSoundT').addEventListener('click', () => { SETTINGS.muted = !SETTINGS.muted; saveSettings(); AUDIO.setMuted(SETTINGS.muted); syncSound(); if (!SETTINGS.muted) { AUDIO.init(); AUDIO.play('ui'); } });
  syncSound();
  $('btnSkip').addEventListener('click', () => { if (GAME.mode === 'intro' && CAM.t < 3.5) { CAM.t = 3.5; boss.rig.anim.t = Math.max(boss.rig.anim.t, 3.4); } });
  syncSettingsUI();
}

// adaptive performance: 1) dynamic resolution first (cheap, invisible), 2) then step the quality preset down
const autoQ = { acc: 0, n: 0, t: 0, locked: false, bad: 0 };
function adaptQuality(rdt) {
  if (paused || !(GAME.mode === 'fight' || GAME.mode === 'intro' || GAME.mode === 'title')) return;
  DYN.acc += rdt; DYN.n++; DYN.t += rdt;
  if (DYN.t < 1.5) return;
  const avg = DYN.acc / DYN.n * 1000; DYN.acc = DYN.n = DYN.t = 0;
  if (avg > 19.5) {
    DYN.good = 0;
    if (DYN.scale > 0.66) { DYN.scale = Math.max(0.66, DYN.scale * (avg > 26 ? 0.8 : 0.9)); onResize(); }
    else if (SETTINGS.quality === 'auto' && qualityName !== 'low') { autoQ.bad++; if (autoQ.bad >= 2) { autoQ.bad = 0; applyQuality(qualityName === 'high' ? 'medium' : 'low'); DYN.scale = 0.85; onResize(); syncSettingsUI(); } }
  } else if (avg < 17.6) {
    autoQ.bad = 0;
    if (++DYN.good >= 3 && DYN.scale < 1) { DYN.good = 0; DYN.scale = Math.min(1, DYN.scale * 1.07); onResize(); }
  }
}

// ------------------------------------------------------------------ debug overlay (#debug only)
let dbgEl = null, fpsAcc = 0, fpsN = 0, fpsT = 0, fpsShow = 0, msShow = 0;
function initDebug() {
  if (!DEBUG) return;
  dbgEl = $('debug'); show(dbgEl, true);
  const ctl = $('debugCtl');
  const slider = (label, obj, key, min, max, step) => {
    const w = document.createElement('label'); w.innerHTML = `<span>${label}</span>`;
    const i = document.createElement('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = obj[key]; i.id = 'dbg_' + key;
    const o = document.createElement('output'); o.textContent = obj[key];
    i.oninput = () => { obj[key] = +i.value; o.textContent = i.value; };
    w.append(i, o); ctl.append(w);
  };
  slider('Player dmg', TUNE, 'playerDmg', 0.2, 10, 0.1); slider('Boss dmg', TUNE, 'bossDmg', 0, 3, 0.1); slider('Aggression', TUNE, 'aggression', 0.5, 2, 0.05);
  slider('i-frame ×', TUNE, 'iframe', 0.5, 2, 0.05); slider('Parry ×', TUNE, 'parry', 0.5, 3, 0.05); slider('Hit stop ×', TUNE, 'hitstop', 0, 3, 0.1);
  const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; ctl.append(b); };
  btn('Boss → 51%', () => { boss.hp = BOSS_HP * 0.51; }); btn('Boss → 5%', () => { boss.hp = BOSS_HP * 0.05; boss.pendingTrans = false; if (boss.phase === 1) { boss.phase = 2; boss.setPhaseLook(1); ARENA.warm = 1; MUSIC.setPhase(2); } });
  btn('Player full', () => { player.hp = PL.hp; player.st = PL.st; player.flasks = 3; });
  for (const k of Object.keys(MOVES).filter((k) => !MOVES[k].hidden)) btn(k, () => { if (boss.state === 'observe' || boss.state === 'approach') boss.startMove(MOVES[k]); });
}
function updateDebug(rdt) {
  fpsAcc += rdt; fpsN++; fpsT += rdt;
  if (fpsT > 0.5) { fpsShow = fpsN / fpsAcc; msShow = fpsAcc / fpsN * 1000; fpsAcc = fpsN = fpsT = 0; }
  if (!dbgEl) return;
  const info = renderer.info;
  $('debugStats').textContent = `${fpsShow.toFixed(0)} fps  ${msShow.toFixed(1)} ms  q:${qualityName}\ncalls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k  particles ${VFX.add.n + VFX.norm.n}+${VFX.sparks.n}\nboss ${boss.state}${boss.move ? ':' + boss.move.name : ''} hp ${boss.hp | 0} poise ${boss.poise | 0} ph ${boss.phase}\nplayer ${player.state} hp ${player.hp | 0} st ${player.st | 0}\nfight ${GAME.fightTime.toFixed(0)}s dmg ${TELE.dmgTaken | 0} heals ${TELE.heals} parry ${TELE.parries} pd ${TELE.perfect}\nmoves ${JSON.stringify(TELE.moves)}\ndeaths ${JSON.stringify(TELE.deaths.slice(-4))}`;
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
const _mid = V3();
function frame(now) {
  requestAnimationFrame(frame);
  if (window.__manual) { last = now; return; }
  // cap at ~60 fps: 90/120 Hz phones would otherwise render twice as often (heat + throttling)
  if (now - last < 15.2) return;
  const rdt = Math.min((now - last) / 1000, 0.05); last = now;
  step(rdt);
  render();
}
function step(rdt) {
  GAME.time += rdt;
  let dt = rdt;
  if (paused) dt = 0;
  if (GAME.hitStop > 0) { GAME.hitStop -= rdt; dt = 0; }
  else if (GAME.slowT > 0) { GAME.slowT -= rdt; dt *= 0.3; }
  const sim = GAME.mode === 'fight' || GAME.mode === 'intro' || GAME.mode === 'dead' || GAME.mode === 'victory' || GAME.mode === 'title';
  if (sim && !paused) {
    if (GAME.mode === 'fight') GAME.fightTime += dt;
    if (GAME.mode === 'title' || GAME.mode === 'intro') { boss.rig.update(dt); player.rig.update(dt); player.afterRig(); boss.afterRig(); if (boss.def.update) boss.def.update(boss, dt); }
    else {
      player.update(dt);
      boss.update(dt);
      if (GAME.mode === 'fight') { resolveCombat(); updateHazards(dt); }
      else if (GAME.mode === 'victory') { resolveCombat(); }
    }
    if (player.state === 'grabbed') player.rig.resetFeet();
    updateCapes(player.rig, dt); updateCapes(boss.rig, dt);
    VFX.update(paused ? 0 : rdt * (GAME.hitStop > 0 ? 0.25 : 1), GAME.time);
    playerTrail.update(GAME.time); bossTrail.update(GAME.time);
    boss.def.trail(boss.heat, bossTrail.U.uC.value);
  }
  updateFlow(rdt);
  updateCamera(dt, rdt);
  shadowFollow(_mid.set((player.pos.x + boss.pos.x) / 2, 0, (player.pos.z + boss.pos.z) / 2));
  arenaUpdate(GAME.time, rdt);
  worldUpdate(GAME.time, rdt);
  MUSIC.update();
  // screen grade
  player.hurtFx = Math.max(0, player.hurtFx - rdt * 1.6);
  const low = player.hp > 0 && player.hp < PL.hp * 0.25 && GAME.mode === 'fight' ? 0.22 + 0.08 * Math.sin(GAME.time * 4) : 0;
  GRADE.uHurt.value = Math.max(player.hurtFx * 0.7, low);
  GRADE.uFocus.value = damp(GRADE.uFocus.value, 0, 6, rdt);
  GRADE.uFlash.value = damp(GRADE.uFlash.value, 0, 14, rdt);
  GRADE.uTime.value = GAME.time;
  if (GAME.mode === 'fight' || GAME.mode === 'dead' || GAME.mode === 'victory') updateHUD(rdt);
  adaptQuality(rdt);
  updateDebug(rdt);
}
function render() {
  renderer.info.reset();
  if (usePost) composer.render(); else renderer.render(scene, camera);
}

// ------------------------------------------------------------------ boot
async function boot() {
  const bar = $('loadFill'), txt = $('loadTxt');
  const progress = (p, s) => { bar.style.transform = `scaleX(${p})`; if (s) txt.textContent = s; };
  qualityName = initialQuality(); Q = QUALITY[qualityName];
  onResize();
  await nextFrame();
  const have = await loadAssets(progress);
  await generateTextures(progress, have);
  buildArena();
  buildWorld();
  progress(0.9, 'Waking the Warden');
  await nextFrame();
  VFX.init();
  playerTrail = new Trail(0x8a98ac, 22); playerTrail.U.uI.value = 0.3;
  bossTrail = new Trail(0x8a8a90, 22); bossTrail.U.uI.value = 0.38;
  const pr = buildPlayer(); scene.add(pr.root); for (const c of pr.capes) scene.add(c.cloth.mesh);
  const br = buildBoss(); scene.add(br.root); for (const c of br.capes) scene.add(c.cloth.mesh);
  progress(0.93, 'Summoning the Herald');
  const hr = buildHerald(); scene.add(hr.root); for (const c of hr.capes) scene.add(c.cloth.mesh);
  player = new Player(pr);
  applyBossDef(KNIGHT_DEF); BOSSES.knight = new Boss(br, KNIGHT_DEF);
  applyBossDef(HERALD_DEF); BOSSES.herald = new Boss(hr, HERALD_DEF);
  selectBoss(SETTINGS.boss || 'knight');
  resetFight();
  applyQuality(qualityName);
  renderer.info.autoReset = false;
  initMenus(); initDebug();
  // warm up shaders (avoid first-hit stutter): compile everything once
  VFX.flash(V3(0, -10, 0), 0.1, 0xffffff, 0.01); VFX.ring(V3(0, -10, 0), 0.1, 0.2, 0.01);
  renderer.compile(scene, camera);
  progress(1, 'Ready');
  await nextFrame();
  show($('loading'), false); show($('title'), true);
  GAME.mode = 'title'; setMode('title'); CAM.mode = 'title';
  camera.position.set(2.5, 1.4, 7.2); CAM.look.set(0.1, 2.05, -3.5);
  // title tableau: the ash warrior faces the chosen foe down the nave
  placeTitleTableau();
  document.documentElement.style.setProperty('--crack', `url(${crackTexture()})`);
  const placeGlint = window.placeGlint = () => { const hh = $('titleH'); if (!hh || $('title').hidden) return; const tn = hh.firstChild, ix = tn.textContent.indexOf('O'); if (ix < 0) return; const rg = document.createRange(); rg.setStart(tn, ix); rg.setEnd(tn, ix + 1); const r = rg.getBoundingClientRect(); const L = $('glintLine'), S = $('glintStar'); const h = r.height * 1.9;
    L.style.left = (r.left + r.width / 2) + 'px'; L.style.top = (r.top + r.height / 2 - h / 2) + 'px'; L.style.height = h + 'px'; S.style.left = (r.left + r.width / 2) + 'px'; S.style.top = (r.top + r.height * 0.52) + 'px'; show(L, true); show(S, true); };
  requestAnimationFrame(placeGlint); setTimeout(placeGlint, 600); window.addEventListener('resize', placeGlint);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeGlint);
  requestAnimationFrame((t) => { last = t; frame(t); });
  window.__ashen = { ASSETS, updateCapes, clips: { P_ATK, P_HEAVY_CHARGE, P_HEAVY_REL, P_PARRY, P_HEAL, P_DEAD, P_KNOCK }, THREE, camera, scene, renderer, GAME, player, INPUT, TUNE, TELE, step, startIntro, beginFight, resetFight, VFX, applyQuality, CAM, render, AUDIO, selectBoss, goHome, BOSSES, H_PROJ, H_RAIN, get boss() { return boss; }, get MOVES() { return MOVES; } };
}
boot().catch((e) => { console.error(e); const t = $('loadTxt'); if (t) t.textContent = 'This device could not start WebGL: ' + e.message; });

// weathered stone crack texture for the title lettering and the primary button (generated, tiled)
function crackTexture() {
  const c = document.createElement('canvas'); c.width = 280; c.height = 140; const g = c.getContext('2d');
  const rnd = mulberry(31);
  g.clearRect(0, 0, 280, 140);
  for (let i = 0; i < 2400; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.18})`; g.fillRect(rnd() * 280, rnd() * 140, 1 + rnd() * 2, 1 + rnd() * 2); }
  g.strokeStyle = 'rgba(20,12,8,0.85)'; g.lineCap = 'round';
  for (let k = 0; k < 9; k++) {
    let x = rnd() * 280, y = rnd() * 140, a = rnd() * TAU; g.lineWidth = 0.6 + rnd() * 1.1; g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 14; j++) { a += (rnd() - 0.5) * 1.1; x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); }
    g.stroke();
  }
  return c.toDataURL('image/png');
}
