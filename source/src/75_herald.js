// ------------------------------------------------------------------ Boss II: THE PALE HERALD — moves, conjured weapons, definition
// Design intent (the combat guideline, tuned for a relentless duelist):
//  · short gaps and fast openers, but every blow has a readable wind-up; many delays (held backhand, held overhead)
//  · distance is never safe: conjured dagger volleys with uneven timing, a leaping slam, a gliding advance
//  · healing in the open is punished (volleys and the advance score far higher)
//  · phase 2 bends what the player learned: the held backhand gains a thrust finisher more often, a giant conjured
//    crescent adds double slams with ground waves, and conjured blades rain where the player stands
const HR = { ...BR, spit: 6, syaw: -18, sy: -0.4, cYaw: 12 };
const HAND_UP = { lhw: 0, lhx: 0.28, lhy: 0.3, lhz: 0.1, cYaw: 22, hP: -4 };
const HAND_THROW = { lhw: 0, lhx: -0.02, lhy: 0.02, lhz: 0.66, cYaw: -16, hP: 2 };

const HMOVES = {
  hslash: { ph: [1, 2], range: [0, 3.6], w: 1.0, basic: true, dur: 1.15,
    keys: [[0, HR], [0.3, H_WIND, 'out3'], [0.42, H_SIDE, 'in'], [0.48, H_MID, 'lin'], [0.55, H_END, 'lin'], [0.85, H_REC, 'out'], [1.15, HR, 'io']],
    hits: [[0.42, 0.56, 170, 1, 30]], track: [[0, 0.28, 240]], motion: [[0.33, 0.55, 0.7]], ev: [[0.36, 'whoosh']] },
  thrust: { ph: [1, 2], range: [2.0, 6.8], w: 0.9, dur: 1.4,
    keys: [[0, HR], [0.42, T_WIND, 'out3'], [0.58, { sz: -0.22, cYaw: -40 }, 'lin'], [0.7, T_END, 'snap'], [1.05, { pY: -0.12, cP: 8 }, 'out'], [1.4, HR, 'io']],
    hits: [[0.58, 0.82, 230, 0, 40]], track: [[0, 0.42, 220]], motion: [[0.56, 0.8, 3.0]], ev: [[0.52, 'whoosh']] },
  advance: { ph: [1, 2], range: [4.2, 14], w: 1.0, dur: 1.6,
    keys: [[0, HR], [0.28, { ...H_WIND, pP: 16 }, 'out'], [0.6, { ...H_WIND, syaw: -150, pP: 18 }, 'lin'], [0.68, H_SIDE, 'in'], [0.75, H_MID, 'lin'], [0.83, H_END, 'lin'], [1.2, H_REC, 'out'], [1.6, HR, 'io']],
    hits: [[0.68, 0.84, 240, 1, 38]], track: [[0, 0.5, 170]], motion: [[0.1, 0.8, 'adv']], ev: [[0.06, 'glide'], [0.6, 'whoosh']] },
  // the signature: raise, hold (trembling, a glint), then slam — and a ground wave runs out along the line
  delayed: { ph: [1, 2], range: [0, 3.6], w: 0.85, dur: 2.3,
    keys: [[0, HR], [0.45, O_WIND, 'out3'], [1.25, { spit: 158, sy: 0.44, cP: -17 }, 'lin'], [1.32, O_SIDE, 'in'], [1.39, O_MID, 'lin'], [1.46, O_END, 'lin'], [1.9, { cP: 28, pY: -0.2, spit: -58 }, 'out'], [2.3, HR, 'io']],
    hits: [[1.32, 1.46, 290, 'hard', 55]], track: [[0, 0.95, 170]], motion: [[1.24, 1.44, 0.8]], tremble: [0.5, 1.25], ev: [[0.5, 'delayTell'], [1.28, 'whoosh'], [1.46, 'impact']] },
  // conjured daggers: three hang over the shoulder, then fly — the third one late
  volley: { ph: [1, 2], range: [3.2, 16], w: 0.85, dur: 2.05, ranged: true, cd: 5.5,
    keys: [[0, HR], [0.35, { ...HR, ...HAND_UP }, 'out3'], [0.72, { ...HR, ...HAND_THROW }, 'in3'], [0.86, { ...HR, ...HAND_UP }, 'io'], [0.98, { ...HR, ...HAND_THROW }, 'in3'], [1.3, { ...HR, ...HAND_UP, lhy: 0.36 }, 'io'], [1.6, { ...HR, ...HAND_THROW }, 'in3'], [2.05, HR, 'io']],
    hits: [], track: [[0, 1.65, 220]], motion: [], ev: [[0.2, 'conjure3'], [0.74, 'throw'], [1.0, 'throw'], [1.62, 'throw']], ringHit: 1.62 },
  backstep: { ph: [1, 2], range: [0, 2.6], w: 0, cd: 4, dur: 1.55, special: true,
    keys: [[0, HR], [0.28, H_WIND, 'out3'], [0.42, H_SIDE, 'in'], [0.49, H_MID, 'lin'], [0.56, H_END, 'lin'], [0.8, { ...HR, ...HAND_UP }, 'out'], [1.12, { ...HR, ...HAND_THROW }, 'in3'], [1.55, HR, 'io']],
    hits: [[0.42, 0.57, 180, 1, 30]], track: [[0, 1.2, 220]], motion: [[0.05, 0.6, -3.4]], ev: [[0.36, 'whoosh'], [0.62, 'conjure2'], [0.98, 'throw'], [1.14, 'throw']] },
  leap: { ph: [1, 2], range: [5.0, 14], w: 0.7, cd: 6, dur: 2.45, heavy: true,
    keys: [[0, HR], [0.5, { pY: -0.32, pP: 14, cP: 24, hP: -6, sx: -0.04, sy: 0.2, sz: -0.1, syaw: -6, spit: 120, srol: 90 }, 'io'], [0.62, { pY: 0.02, cP: -14, pP: 0, sy: 0.45, spit: 158 }, 'out'], [1.1, { spit: 160, cP: -18 }, 'lin'],
      [1.2, O_SIDE, 'in'], [1.26, O_MID, 'lin'], [1.32, SW_SLAM, 'lin'], [2.0, { cP: 30, pY: -0.26 }, 'out'], [2.45, HR, 'io']],
    hits: [[1.2, 1.34, 300, 0, 60]], track: [[0, 0.58, 220]], motion: [], ev: [[0.56, 'leapTakeoff'], [1.32, 'leapLand']], leap: { t0: 0.6, t1: 1.24, h: 2.8 } },
  stomp: { ph: [1, 2], range: [0, 2.4], w: 0, cd: 5, dur: 1.05, special: true,
    keys: [[0, HR], [0.36, { pY: 0.05, cP: -8, hP: -6, pP: -4, sy: -0.22, spit: 32, cYaw: -10 }, 'io'], [0.54, { pY: -0.24, cP: 18, pP: 12, sy: -0.46, spit: -8, cYaw: 0 }, 'in3'], [1.05, HR, 'io']],
    hits: [], track: [[0, 0.3, 120]], motion: [], ev: [[0.05, 'armor'], [0.54, 'stomp']], ringHit: 0.54 },
  turn: { ph: [1, 2], range: [0, 3.4], w: 0, cd: 3.5, dur: 1.15, special: true,
    keys: [[0, HR], [0.3, HB_WIND, 'out3'], [0.42, HB_SIDE, 'in'], [0.49, HB_MID, 'lin'], [0.56, HB_END, 'lin'], [0.86, { cYaw: -48, syaw: -116, spit: -26, sy: -0.42 }, 'out'], [1.15, HR, 'io']],
    hits: [[0.42, 0.58, 180, 'hard', 34]], track: [[0, 0.54, 560]], motion: [[0.38, 0.56, 0.4]], ev: [[0.04, 'armor'], [0.34, 'whoosh']] },
  counter: { ph: [], hidden: true, dur: 1.0,
    keys: [[0, HR], [0.18, H_WIND, 'out3'], [0.3, H_SIDE, 'in'], [0.37, H_MID, 'lin'], [0.44, H_END, 'lin'], [0.72, H_REC, 'out'], [1.0, HR, 'io']],
    hits: [[0.3, 0.45, 210, 1, 36]], track: [[0, 0.18, 260]], motion: [[0.22, 0.42, 0.6]], ev: [[0.22, 'whoosh']] },
  // ---- phase 2
  greatConjure: { ph: [2], range: [0, 4.6], w: 0.9, cd: 7, dur: 4.1, heavy: true, reach: 3.3,
    keys: [[0, HR], [0.5, SW_RAISE, 'out3'], [1.3, { spit: 152, cP: -20, sy: 0.5 }, 'lin'], [1.4, { spit: 112, cP: -6 }, 'in'], [1.46, O_MID, 'lin'], [1.52, SW_SLAM, 'lin'], [1.95, { cP: 28, pY: -0.24 }, 'out'],
      [2.25, SW_RAISE, 'io'], [2.75, { spit: 154, cP: -20, sy: 0.5 }, 'lin'], [2.83, { spit: 112, cP: -6 }, 'in'], [2.89, O_MID, 'lin'], [2.95, SW_SLAM, 'lin'], [3.6, { cP: 30, pY: -0.26 }, 'out'], [4.1, HR, 'io']],
    hits: [[1.4, 1.53, 330, 0, 60], [2.83, 2.96, 330, 0, 60]], track: [[0, 1.0, 160], [1.95, 2.45, 200]], motion: [[1.36, 1.5, 0.6], [2.79, 2.93, 0.6]], tremble: [2.3, 2.75],
    ev: [[0.08, 'slamTell'], [0.3, 'greatOn'], [1.53, 'impact'], [2.96, 'impact'], [3.05, 'greatOff']] },
  crescent: { ph: [2], range: [0, 4.2], w: 0.8, cd: 5, dur: 2.1, combo: true, reach: 2.9,
    keys: [[0, HR], [0.36, H_WIND, 'out3'], [0.5, H_SIDE, 'in'], [0.58, H_MID, 'lin'], [0.65, H_END, 'lin'], [0.93, HB_WIND, 'out'], [1.07, HB_SIDE, 'in'], [1.15, HB_MID, 'lin'], [1.22, HB_END, 'lin'], [1.6, { cYaw: -48, syaw: -116, spit: -26, sy: -0.42 }, 'out'], [2.1, HR, 'io']],
    hits: [[0.5, 0.66, 200, 1, 34], [1.07, 1.23, 220, 1, 38]], track: [[0, 0.3, 200], [0.65, 0.9, 170]], motion: [[0.42, 0.62, 0.6], [1.0, 1.2, 0.7]], ev: [[0.08, 'greatOn'], [0.42, 'whoosh'], [1.0, 'whoosh'], [1.3, 'greatOff']] },
  rain: { ph: [2], range: [0, 16], w: 0.6, cd: 9, dur: 2.0, ranged: true,
    keys: [[0, HR], [0.5, { ...HR, lhw: 0, lhx: 0.12, lhy: 0.62, lhz: 0.12, hP: -18, cP: -8 }, 'out3'], [1.2, { ...HR, lhw: 0, lhx: 0.14, lhy: 0.66, lhz: 0.16, hP: -20, cP: -10 }, 'lin'], [1.45, { ...HR, ...HAND_THROW, cP: 10 }, 'in3'], [2.0, HR, 'io']],
    hits: [], track: [[0, 1.4, 200]], motion: [], ev: [[0.3, 'conjureSky'], [1.45, 'rain']], ringHit: 2.6 },
};
// the held backhand and its finisher (built on the opener so the branch is seamless)
{
  const H = HMOVES.hslash;
  const hold = [[0.8, HB_WIND, 'out'], [1.45, { ...HB_WIND, syaw: 150, cYaw: 54, cP: -4 }, 'lin'], [1.52, HB_SIDE, 'in'], [1.58, HB_MID, 'lin'], [1.65, HB_END, 'lin']];
  HMOVES.hslashD = { ph: [], hidden: true, range: [0, 3.6], w: 0, dur: 2.25, combo: true,
    keys: [...H.keys.slice(0, 5), ...hold, [1.95, { cYaw: -48, syaw: -116, spit: -26, sy: -0.42 }, 'out'], [2.25, HR, 'io']],
    hits: [H.hits[0], [1.52, 1.66, 200, 1, 34]], track: [...H.track, [0.56, 1.3, 170]], motion: [...H.motion, [1.45, 1.64, 0.6]], tremble: [0.86, 1.45], ev: [...H.ev, [1.47, 'whoosh']] };
  HMOVES.hslashD3 = { ph: [], hidden: true, range: [0, 3.6], w: 0, dur: 2.95, combo: true,
    keys: [...H.keys.slice(0, 5), ...hold, [2.0, T_WIND, 'out3'], [2.12, { sz: -0.22, cYaw: -40 }, 'lin'], [2.24, T_END, 'snap'], [2.6, { pY: -0.12, cP: 8 }, 'out'], [2.95, HR, 'io']],
    hits: [...HMOVES.hslashD.hits, [2.12, 2.36, 220, 0, 40]], track: [...HMOVES.hslashD.track, [1.66, 1.8, 220]], motion: [...HMOVES.hslashD.motion, [2.1, 2.34, 2.6]], tremble: [0.86, 1.45], ev: [...HMOVES.hslashD.ev, [2.06, 'whoosh']] };
  H.branch = { at: 0.57, pick: (b, dist) => (dist < 4.2 && Math.random() < (b.phase === 2 ? 0.65 : 0.45)) ? 'hslashD' : null };
  HMOVES.hslashD.branch = { at: 1.67, pick: (b, dist) => (dist < 5.0 && Math.random() < (b.phase === 2 ? 0.6 : 0.3)) ? 'hslashD3' : null };
}
const HPREP = { hslash: 0.08, hslashD: 0.08, hslashD3: 0.08, thrust: 0.16, advance: 0.1, delayed: 0.12, volley: 0.1, leap: 0.1, stomp: 0.08, turn: 0.06, greatConjure: 0.14, crescent: 0.1, rain: 0.1 };
const HGLINT = { thrust: 1, advance: 1, turn: 1, leap: 1 };
const HTIER = { hslash: 'weak', counter: 'weak', turn: 'weak', stomp: 'weak', backstep: 'weak',
  hslashD: 'combo', crescent: 'combo', volley: 'strong', thrust: 'strong', advance: 'strong', delayed: 'strong', hslashD3: 'strong', rain: 'strong',
  leap: 'big', greatConjure: 'big' };
const HWEAK = { thrust: 1, delayed: 1, leap: 1, greatConjure: 1, hslashD3: 1 };
processMoves(HMOVES, { prep: HPREP, glint: HGLINT, tier: HTIER, weak: HWEAK, extraGlint: { delayed: 0.95, greatConjure: 2.5, hslashD: 1.15, hslashD3: 1.15 } });
const HHOLD = { hslash: [0.25, 0.3], thrust: [0.35, 0.45], advance: [0.3, 0.35], delayed: [0.35, 0.4] };

// ---- conjured daggers (projectiles) and blade rain
const H_PROJ = [], H_RAIN = [];
let _dagGeo = null, _dagMat = null, _markGeo = null, _markMat = null;
function dagMesh() {
  if (!_dagGeo) {
    _dagGeo = new THREE.OctahedronGeometry(0.1, 0); _dagGeo.scale(0.8, 0.8, 5.5);
    _dagMat = spectralMat(1.8);
    _markGeo = new THREE.RingGeometry(0.9, 1.15, 40); _markGeo.rotateX(-Math.PI / 2);
    _markMat = spectralMat(0.9);
  }
  const m = new THREE.Mesh(_dagGeo, _dagMat); m.renderOrder = 9; m.frustumCulled = false; scene.add(m); return m;
}
function heraldConjure(b, n) {
  for (let i = 0; i < n; i++) {
    const m = dagMesh();
    H_PROJ.push({ mesh: m, state: 'hover', slot: i - (n - 1) / 2, b, t: 0, pos: V3(), vel: V3(), done: false });
  }
  b.conjuring = true; AUDIO.play('glint');
}
function heraldThrow(b) {
  const d = H_PROJ.find((p) => p.state === 'hover' && p.b === b);
  if (!d) return;
  d.state = 'fly'; d.t = 0;
  const target = V3(player.pos.x, 1.0 + player.pos.y, player.pos.z);
  d.vel.subVectors(target, d.pos).normalize().multiplyScalar(14);
  AUDIO.play('whoosh', { heavy: 0.3 });
  if (!H_PROJ.some((p) => p.state === 'hover' && p.b === b)) b.conjuring = false;
}
function heraldRain(b) {
  // three marks: on the player now, then two that follow where they move
  for (let i = 0; i < 3; i++) H_RAIN.push({ t: -i * 0.38, follow: i > 0, pos: V3(player.pos.x, 0.03, player.pos.z), mesh: null, blade: null, done: false });
  AUDIO.play('grabTell');
}
const _hp2 = V3();
function updateHeraldFx(dt) {
  for (let i = H_PROJ.length - 1; i >= 0; i--) {
    const d = H_PROJ[i]; d.t += dt;
    if (d.state === 'hover') {
      // hang in a fan over the Herald's shoulder, pointing at the player
      const r = d.b.rig; r.chest.localToWorld(_hp2.set(0.32 + d.slot * 0.28, 0.42 + Math.abs(d.slot) * -0.06, -0.15));
      d.pos.lerp(_hp2, d.t < 0.05 ? 1 : 1 - Math.exp(-18 * dt));
      if (d.t > 3 || d.b.state !== 'move') { d.state = 'fade'; }
    } else if (d.state === 'fly') {
      d.pos.addScaledVector(d.vel, dt);
      if (Math.random() < dt * 60) VFX.motes(d.pos, 1, 0.02, 0.1);
      if (!d.done && !player.dead) {
        closestPtSeg(d.pos, player.a, player.b, _hc);
        if (d.pos.distanceTo(_hc) < 0.42) {
          if (player.invuln) { if (!d.pd && player.state === 'dodge' && player.t <= PL.dodge.i0 + 0.16) { d.pd = true; perfectDodge(d.pos.clone()); } }
          else { d.done = true; player.takeHit({ dmg: 85, parry: 0, gst: 22, name: 'dagger' }, d.pos.clone(), d.b.pos); VFX.motes(d.pos, 10, 0.1, 1); d.state = 'fade'; }
        }
      }
      if (d.pos.y < 0.05 || d.t > 1.6 || Math.hypot(d.pos.x, d.pos.z) > WALL_R) { if (d.pos.y < 0.3) { VFX.motes(d.pos.setY(0.05), 6, 0.1, 0.8); } d.state = 'fade'; }
    }
    if (d.state === 'fade') { d.mesh.scale.multiplyScalar(Math.exp(-14 * dt)); if (d.mesh.scale.x < 0.05) { scene.remove(d.mesh); H_PROJ.splice(i, 1); continue; } }
    d.mesh.position.copy(d.pos);
    const aim = d.state === 'fly' ? _hp2.copy(d.pos).add(d.vel) : _hp2.set(player.pos.x, 1.0, player.pos.z);
    d.mesh.lookAt(aim);
  }
  for (let i = H_RAIN.length - 1; i >= 0; i--) {
    const r = H_RAIN[i]; r.t += dt;
    if (r.t < 0) { if (r.follow) r.pos.set(player.pos.x, 0.03, player.pos.z); continue; }
    if (!r.mesh) { r.mesh = new THREE.Mesh(_markGeo || (dagMesh() && _markGeo), _markMat.clone()); r.mesh.renderOrder = 3; scene.add(r.mesh); r.mesh.position.copy(r.pos); }
    const F = 0.95; // time from mark to impact
    r.mesh.scale.setScalar(0.4 + 0.6 * Math.min(1, r.t / F)); r.mesh.material.opacity = 0.5 + 0.5 * Math.sin(r.t * 18);
    if (r.t > F - 0.16 && !r.blade) { r.blade = dagMesh(); r.blade.scale.set(2.2, 2.2, 1.6); }
    if (r.blade) { const k = clamp((r.t - (F - 0.16)) / 0.16, 0, 1); r.blade.position.set(r.pos.x, lerp(7, 0.4, k), r.pos.z); r.blade.lookAt(r.pos.x, -5, r.pos.z); }
    if (r.t >= F && !r.done) {
      r.done = true; AUDIO.play('slam'); shake(0.35); VFX.motes(V3(r.pos.x, 0.2, r.pos.z), 22, 0.6, 1.8); VFX.dust(r.pos, 8, 0.5, 1); VFX.flash(V3(r.pos.x, 0.6, r.pos.z), 1.6, 0xa070ff, 0.14);
      if (!player.dead && player.pos.y < 0.6 && Math.hypot(player.pos.x - r.pos.x, player.pos.z - r.pos.z) < 1.25) {
        if (!player.invuln) player.takeHit({ dmg: 150, parry: 0, gst: 40, name: 'rain' }, V3(player.pos.x, 0.6, player.pos.z), r.pos);
        else if (player.state === 'dodge' && player.t <= PL.dodge.i0 + 0.16) perfectDodge(player.pos.clone().setY(0.6));
      }
    }
    if (r.t > F + 0.35) { scene.remove(r.mesh); if (r.blade) scene.remove(r.blade); H_RAIN.splice(i, 1); }
  }
}
function clearHeraldFx() {
  for (const d of H_PROJ) scene.remove(d.mesh); H_PROJ.length = 0;
  for (const r of H_RAIN) { if (r.mesh) scene.remove(r.mesh); if (r.blade) scene.remove(r.blade); } H_RAIN.length = 0;
}
extraHazards.push(updateHeraldFx); extraClears.push(clearHeraldFx);

function heraldEvent(b, name) {
  switch (name) {
    case 'conjure3': heraldConjure(b, 3); break;
    case 'conjure2': heraldConjure(b, 2); break;
    case 'throw': heraldThrow(b); break;
    case 'conjureSky': b.conjuring = true; AUDIO.play('slamTell'); VFX.flash(b.rig.handFreeL.localToWorld(V3(0, 0.1, 0)), 1.2, 0xa070ff, 0.5); break;
    case 'rain': b.conjuring = false; heraldRain(b); break;
    case 'greatOn': b.greatOn = true; AUDIO.play('slamTell'); VFX.flash(b.rig.sword.localToWorld(V3(0, 0, 1.6)), 2.4, 0xa070ff, 0.3); break;
    case 'greatOff': b.greatOn = false; break;
    case 'glide': VFX.motes(b.pos.clone().setY(0.3), 12, 0.4, 0.6); AUDIO.play('dodge'); break;
  }
}
function heraldLook(b, k) {
  const r = b.rig;
  r.M.blade.emissive.copy(VIOLET); r.M.blade.emissiveIntensity = 0.25 + k * 2.2;
  if (r.helmGlow) r.helmGlow.material.color.copy(VIOLET).multiplyScalar(1.6 + k * 2.4);
  r.U.uRim.value.setRGB(lerp(0.09, 0.22, k), lerp(0.06, 0.1, k), lerp(0.14, 0.4, k));
  bossLight.color.setRGB(0.62, 0.36, 1.0); bossLight.intensity = 2 + k * 9;
}
const HERALD_DEF = { id: 'herald', name: 'The Pale Herald', sub: 'Voice of the Eclipsed Choir', hp: 5000, poise: 120, moves: HMOVES, hold: HHOLD,
  clips: { ...KNIGHT_DEF.clips, ready: P(HR) },
  leapRing: [2.6, 0.32, 120],
  light: 0xa070ff, tint: 'violet', ringCol: [0.62, 0.32, 1.1],
  fx: { motes: true, converge: [0.8, 0.45, 1.6], flash: 0xa070ff },
  trail: (h, c) => c.setRGB(lerp(0.7, 1.1, h), lerp(0.55, 0.45, h), lerp(1.0, 1.9, h)),
  look: heraldLook, update: heraldAnimate, event: heraldEvent,
  victory: { title: 'The Herald Falls Silent', art: 'Choir’s Edge', desc: 'The conjured crescent answers your blade now. The eclipsed choir sings no more; the cathedral is yours.' } };
BOSS_DEFS.herald = HERALD_DEF;
