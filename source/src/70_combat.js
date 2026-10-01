// ------------------------------------------------------------------ tuning (spec numbers)
const PL = {
  hp: 1000, st: 100, move: 4.2, strafe: 3.6, back: 3.2, dash: 6.2, guardMove: 1.9, healMove: 1.1,
  regenDelay: 0.65, regen: 35, regenGuard: 12, zeroDelay: 0.8,
  atk: [
    { S: 0.28, A: 0.12, R: 0.38, dmg: 110, poise: 22, st: 18, lunge: 0.35 },
    { S: 0.30, A: 0.13, R: 0.42, dmg: 125, poise: 26, st: 20, lunge: 0.35 },
    { S: 0.38, A: 0.15, R: 0.62, dmg: 165, poise: 38, st: 24, lunge: 0.55 },
  ],
  heavy: { min: 0.75, max: 1.15, rel: 0.12, A: 0.14, R: 0.72, dmg: [210, 290], poise: [45, 70], st: 32 },
  dodge: { dur: 0.72, dist: 3.2, i0: 0.10, i1: 0.38, st: 26 },
  dashCost: 12, parrySt: 12, parryT0: 0.05, parryLen: 0.16, guardRed: 0.75,
  flasks: 3, healAmt: 0.35, healDur: 1.6, healAt: 1.0, buffer: 0.22,
  fp: 100, skillFp: 30, fpGain: 15, fpStart: 30,   // FP bar: weapon skill costs FP; only parries / perfect dodges refill it (not plain hits)
  pdCounter: { win: 1.0, dmg: 1.6, poise: 35 },     // perfect dodge → the next blow within `win` s is an Ashen riposte
  jump: { v: 4.3, g: 13, st: 14, air: 3.0 },
  crit: { stagger: 450, parried: 380 },            // critical blow damage after a posture break / parry
  gc: { win: 0.6, dmg: 190, poise: 62, st: 22 },   // guard counter
  skill: { dmg: 210, poise: 60, st: 18 },
};
let BOSS_HP = 4600, BOSS_POISE = 130; // set per boss by applyBossDef()
const TUNE = { playerDmg: 1, bossDmg: 1, aggression: 1, iframe: 1, parry: 1, hitstop: 1, phaseAt: 0.5 };
const TELE = { start: 0, deaths: [], dmgTaken: 0, heals: 0, parries: 0, perfect: 0, moves: {}, fights: 0 };

const GAME = { mode: 'loading', time: 0, fightTime: 0, hitStop: 0, slowT: 0, shake: 0, over: false, introDone: false };
function rdtHit(dt) { return Math.max(dt, 1 / 60); }
function hitStop(s) { GAME.hitStop = Math.max(GAME.hitStop, s * TUNE.hitstop); }

// ------------------------------------------------------------------ input (touch + keyboard), buffered
const INPUT = {
  sx: 0, sy: 0, held: { atk: false, dodge: false, guard: false, heal: false, jump: false, skill: false }, buf: null, atkDownT: -9, kb: { w: 0, a: 0, s: 0, d: 0 },
  press(type) {
    this.buf = { type, t: GAME.time };
    if (type === 'atk') this.atkDownT = GAME.time;
    if (type === 'guard') this.guardDownT = GAME.time;
  },
  take(type) { if (this.buf && this.buf.type === type && GAME.time - this.buf.t <= PL.buffer) { this.buf = null; return true; } return false; },
  peek() { if (this.buf && GAME.time - this.buf.t > PL.buffer) this.buf = null; return this.buf && this.buf.type; },
  clear() { this.buf = null; for (const k in this.held) this.held[k] = false; this.sx = this.sy = 0; },
};

// ------------------------------------------------------------------ hit sweep helpers
const _hp = V3(), _hc = V3();
function sweepCapsule(prev, cur, n, a, b, r, out) {
  for (let s = 1; s <= 3; s++) {
    const f = s / 3;
    for (let i = 0; i < n; i++) {
      _hp.lerpVectors(prev[i], cur[i], f);
      closestPtSeg(_hp, a, b, _hc);
      if (_hp.distanceToSquared(_hc) < r * r) { out.copy(_hp); return true; }
    }
  }
  return false;
}
function capsuleOf(pos, y0, y1, a, b) { a.set(pos.x, y0, pos.z); b.set(pos.x, y1, pos.z); }

// ------------------------------------------------------------------ PLAYER poses
const PR = { pYaw: -18, cYaw: 14, pP: 4, cP: 4, hYaw: 4, sx: -0.02, sy: -0.34, sz: 0.34, syaw: -8, spit: 38, srol: 90, pY: -0.03, lhw: 1 };
const P_READY = P(PR);
const P_GUARD = P({ ...PR, pYaw: -8, cYaw: 6, cP: 6, pY: -0.08, sx: 0.0, sy: -0.02, sz: 0.36, syaw: 2, spit: 82, srol: 0, hP: 6 });
const P_ATK = [
  clip([[0, PR], [0.2, { cYaw: -40, pYaw: -28, cP: 2, pY: -0.06, sx: -0.28, sy: -0.08, sz: 0.02, syaw: -135, spit: 26, srol: 15 }, 'out3'], [0.28, { syaw: -100, sx: -0.24, sz: 0.2, cYaw: -28 }, 'in'],
    [0.34, { cYaw: 0, pYaw: -12, sx: 0.0, sy: -0.2, sz: 0.52, syaw: -10, spit: 6, srol: 10 }, 'lin'], [0.4, { cYaw: 36, pYaw: -2, sx: 0.28, sy: -0.3, sz: 0.3, syaw: 95, spit: -8 }, 'lin'],
    [0.58, { cYaw: 42, syaw: 112, spit: -20, sx: 0.3, sy: -0.38, sz: 0.2 }, 'out'], [0.78, PR, 'io']]),
  clip([[0, { cYaw: 42, pYaw: -2, syaw: 112, spit: -20, sx: 0.3, sy: -0.38, sz: 0.2, srol: 12 }], [0.22, { cYaw: 48, cP: 2, sx: 0.3, sy: -0.05, sz: 0.05, syaw: 140, spit: 24, srol: 10 }, 'out3'], [0.3, { syaw: 100, sz: 0.2, cYaw: 34 }, 'in'],
    [0.365, { cYaw: 0, pYaw: -10, sx: 0.0, sy: -0.2, sz: 0.52, syaw: 8, spit: 6 }, 'lin'], [0.43, { cYaw: -38, pYaw: -24, sx: -0.3, sy: -0.3, sz: 0.28, syaw: -98, spit: -10 }, 'lin'],
    [0.62, { cYaw: -42, syaw: -112, spit: -22, sx: -0.3, sy: -0.4, sz: 0.2 }, 'out'], [0.85, PR, 'io']]),
  clip([[0, PR], [0.3, { cYaw: -10, cP: -12, pYaw: -14, pY: 0.02, sx: -0.04, sy: 0.36, sz: -0.02, syaw: -8, spit: 150, srol: 90 }, 'out3'], [0.38, { spit: 122, cP: -6 }, 'in'],
    [0.45, { cP: 10, sy: 0.18, sz: 0.52, spit: 34 }, 'lin'], [0.53, { cP: 28, pP: 14, pY: -0.18, sy: -0.48, sz: 0.52, spit: -48, cYaw: 2 }, 'lin'],
    [0.85, { cP: 22, pP: 10, pY: -0.14, spit: -52 }, 'out'], [1.15, PR, 'io']]),
];
const P_HEAVY_CHARGE = clip([[0, PR], [0.3, { cYaw: -22, cP: -14, pYaw: -20, pY: -0.08, sx: -0.06, sy: 0.4, sz: -0.04, syaw: -12, spit: 155, srol: 90 }, 'out3'], [1.2, { spit: 162, cP: -17, pY: -0.11 }, 'lin']]);
const P_HEAVY_REL = clip([[0, { cYaw: -22, cP: -14, pYaw: -20, pY: -0.11, sx: -0.06, sy: 0.4, sz: -0.04, syaw: -12, spit: 162, srol: 90 }], [0.12, { spit: 118, cP: -4 }, 'in'],
  [0.19, { cP: 12, sy: 0.16, sz: 0.52, spit: 34, cYaw: -4 }, 'lin'], [0.26, { cP: 32, pP: 18, pY: -0.24, sy: -0.52, sz: 0.52, spit: -52, cYaw: 2 }, 'lin'], [0.7, { cP: 26, pY: -0.2 }, 'out'], [0.98, PR, 'io']]);
const P_PARRY = clip([[0, PR], [0.05, { pYaw: -24, cYaw: -12, sx: -0.16, sy: 0.02, sz: 0.34, syaw: -34, spit: 70, srol: 20, cP: 2 }, 'out3'], [0.21, { syaw: -48, spit: 76, sx: -0.22 }, 'lin'], [0.45, PR, 'io']]);
const P_HEAL = clip([[0, PR], [0.35, { lhw: 0, lhx: 0.02, lhy: 0.12, lhz: 0.22, sx: -0.24, sy: -0.46, sz: 0.2, syaw: -24, spit: -32, srol: 90, hP: 26, pY: -0.12, cP: 14 }, 'out3'], [1.0, { hP: 32, lhy: 0.2, cP: 8 }, 'io'], [1.25, { hP: 6, pY: -0.06, lhy: 0.0 }, 'io'], [1.6, PR, 'io']]);
const P_HIT = clip([[0, PR], [0.08, { cP: -16, hP: -14, pY: -0.08, pP: -6, sy: -0.28, spit: 55, syaw: 20 }, 'out3'], [0.45, PR, 'io']]);
const P_KNOCK = clip([[0, PR], [0.12, { cP: -28, pP: -12, hP: -20, pY: -0.15, spit: 70, syaw: 40, lhw: 0.2 }, 'out3'], [0.5, { pY: -0.5, cP: 18, pP: 8, hP: 10, sy: -0.45, spit: -30, syaw: -40, lhw: 0.3 }, 'io'], [0.8, { pY: -0.46 }, 'lin'], [1.1, PR, 'io']]);
const P_DOWN = clip([[0, { pY: -0.3, cP: -20, pP: -10, hP: -30, lhw: 0 }], [0.3, { pY: -0.58, cP: 26, pP: 10, hP: 16, sy: -0.46, spit: -40, syaw: -30, lhw: 0.2 }, 'out3'], [1.1, { pY: -0.55 }, 'lin'], [1.5, PR, 'io']]);
const P_GBREAK = clip([[0, P_GUARD], [0.1, { cP: -24, pY: -0.1, sx: 0.1, sy: 0.12, sz: 0.2, syaw: 55, spit: 115, srol: 30, lhw: 0.1, hP: -18 }, 'out3'], [0.9, { cP: -10 }, 'lin'], [1.25, PR, 'io']]);
const P_DEFLECT = clip([[0, PR], [0.08, { cP: -18, cYaw: 20, sx: 0.12, sy: 0.05, sz: 0.2, syaw: 60, spit: 70, lhw: 0.4 }, 'out3'], [0.55, PR, 'io']]);
const P_GRABBED = clip([[0, { pP: -24, cP: -26, hP: -32, pY: -0.05, sx: -0.3, sy: -0.4, sz: 0.1, spit: -60, syaw: -40, lhw: 0, lhx: 0.25, lhy: 0.15, lhz: 0.2 }]]);
const ROLL_POSE = { pY: -0.46, pP: 18, cP: 48, hP: 42, cYaw: 0, pYaw: 0, sx: -0.14, sy: -0.26, sz: 0.14, syaw: -40, spit: -25, srol: 90, lhw: 0.6, lhx: 0.1, lhy: -0.1, lhz: 0.2 };
const P_ROLL = clip([[0, PR], [0.08, { ...ROLL_POSE, pY: -0.3, cP: 30 }, 'out'], [0.2, ROLL_POSE, 'io'], [0.48, ROLL_POSE, 'lin'], [0.6, { ...PR, pY: -0.16, cP: 16 }, 'out'], [0.72, PR, 'io']]);
const P_JUMP = clip([[0, { ...PR, pY: -0.18, cP: 12 }], [0.12, { pY: 0.02, cP: 4, hP: -4, sy: -0.2, spit: 50 }, 'out'], [0.45, { pY: -0.04, cP: 8, sy: -0.25, spit: 40 }, 'io']]);
const P_JUMPATK = clip([[0, { pY: 0.0, cP: -10, sx: -0.04, sy: 0.42, sz: -0.04, syaw: -8, spit: 158, srol: 90 }], [0.25, { cP: -16, spit: 165 }, 'out'], [0.4, { cP: 10, sy: 0.14, sz: 0.52, spit: 34 }, 'in3'], [0.5, { cP: 32, pP: 16, pY: -0.3, sy: -0.52, sz: 0.52, spit: -52 }, 'lin'], [0.95, { cP: 24, pY: -0.24 }, 'out'], [1.25, PR, 'io']]);
const P_CRIT = clip([[0, PR], [0.3, { cYaw: -20, pYaw: -24, pY: -0.08, cP: -2, sx: -0.2, sy: -0.12, sz: -0.12, syaw: -6, spit: 6, srol: 0 }, 'io'], [0.42, { cYaw: 8, pYaw: -4, pP: 14, cP: 10, pY: -0.16, sx: 0.0, sy: -0.02, sz: 0.66, syaw: 0, spit: 4 }, 'snap'],
  [1.05, { cYaw: 14, cP: 16, pY: -0.2, sz: 0.62, srol: 50 }, 'lin'], [1.22, { cYaw: -10, cP: -8, pY: -0.06, sx: -0.1, sy: 0.3, sz: 0.3, spit: 80, srol: 90 }, 'snap'], [1.8, PR, 'io']]);
const P_SKILL = clip([[0, PR], [0.28, { cYaw: -34, pYaw: -32, pY: -0.18, cP: 14, sx: -0.26, sy: -0.14, sz: -0.2, syaw: -4, spit: 4, srol: 0 }, 'io'], [0.36, { sz: -0.24, cYaw: -38 }, 'lin'],
  [0.48, { cYaw: 10, pYaw: -4, pP: 18, cP: 12, pY: -0.2, sx: 0.02, sy: -0.06, sz: 0.74, syaw: 0, spit: 2 }, 'snap'], [0.9, { pY: -0.16 }, 'out'], [1.2, PR, 'io']]);
const P_DEAD = clip([[0, PR], [0.15, { cP: -20, hP: -24, pY: -0.1 }, 'out3'], [0.9, { pY: -0.55, cP: 28, pP: 12, hP: 30, sy: -0.46, spit: -50, syaw: -40, lhw: 0 }, 'io'], [2.0, { cP: 40, pY: -0.62 }, 'io']]);

// ------------------------------------------------------------------ PLAYER controller
// scratch vectors (avoid per-frame allocations → fewer GC pauses on mobile)
const _pu = { toB: V3(), bDir: V3(), cf: V3(), cr: V3(), tv: V3(), w: V3() };
const _bu = { toP: V3(), v: V3(), fwd: V3(), side: V3(), tip: V3() };
class Player {
  constructor(rig) {
    this.rig = rig; this.pts = []; this.prev = [];
    this.a = V3(); this.b = V3();
    this.reset();
    rig.onStep = (f, speed) => { if (speed > 0.5 && AUDIO.ready) AUDIO.play('stepPlayer', { pan: 0 }); if (speed > 5) VFX.dust(f.pos, 1, 0.1, 0.4); };
  }
  reset() {
    this.hp = PL.hp; this.st = PL.st; this.flasks = PL.flasks; this.fp = PL.fpStart; this.pdCounterUntil = -9; this.vy = 0; this.gcUntil = -9; this.rig.tumble = 0; this.rig.tuck = 0; this.lastUse = -9; this.stDelay = 0;
    this.state = 'idle'; this.t = 0; this.step = 0; this.facing = Math.PI; this.vel = V3();
    this.rig.pos.set(0, 0, 6.2); this.rig.yaw = Math.PI; this.rig.resetFeet();
    this.rig.anim.play(this.locoFn(), 0); this.hitDone = false; this.invuln = false; this.pdDone = false;
    this.recentAtk = []; this.recentDodge = []; this.healT = -9; this.dead = false; this.hurtFx = 0;
    this.chipHp = PL.hp; this.lastHitBy = '';
    this.rig.lookYaw = 0;
  }
  locoFn() {
    const self = this;
    return (t, out) => {
      const base = self.state === 'guard' ? P_GUARD : P_READY;
      Object.assign(out, base);
      out.cP += Math.sin(t * 1.7) * 1.2; out.sy += Math.sin(t * 1.7) * 0.005;
      const lv = self.localVel || { x: 0, z: 0 };
      const sp = Math.hypot(lv.x, lv.z);
      out.pP += clamp(lv.z, -3, 5) * 1.6; out.pR += clamp(-lv.x, -4, 4) * 1.2;
      if (self.state === 'dash') {
        out.pP = 14; out.cP = 10; out.pYaw = 0; out.cYaw = 0; out.hYaw = 0; out.pY = -0.06;
        out.sx = -0.22; out.sy = -0.5; out.sz = -0.05; out.syaw = -170; out.spit = -30; out.srol = 90; out.lhw = 0; out.lhx = 0.22; out.lhy = -0.3; out.lhz = 0.05;
      }
      out.st = 1 + Math.min(sp, 4) * 0.08;
    };
  }
  get pos() { return this.rig.pos; }
  useSt(x) { this.st -= x; this.lastUse = GAME.time; if (this.st <= 0) { this.st = 0; this.stDelay = PL.zeroDelay; } }
  setState(s, clipOrFn, blend = 0.08) { this.state = s; this.t = 0; if (clipOrFn) this.rig.anim.play(clipOrFn, blend); }
  canAct() { return ['idle', 'move', 'dash'].includes(this.state); }
  startAttack(step) {
    const A = PL.atk[step];
    this.step = step; this.useSt(A.st); this.hitDone = false; this.atkPressT = INPUT.atkDownT; this.heavyTried = false;
    this.setState('attack', P_ATK[step], step === 0 ? 0.06 : 0.04);
    this.recentAtk.push(GAME.time);
    AUDIO.play('armor');
  }
  startDodge() {
    // rolling again right after a roll costs more: roll-spam drains stamina fast
    const d = PL.dodge, chained = GAME.time - (this.lastDodgeT ?? -9) < 1.0; this.lastDodgeT = GAME.time; this.useSt(d.st * (chained ? 1.5 : 1));
    const w = this.wish;
    let dir;
    if (w.lengthSq() > 0.04) dir = w.clone().normalize();
    else { dir = V3(this.pos.x - boss.pos.x, 0, this.pos.z - boss.pos.z); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize(); }
    // rolling dodge: the body turns into the roll direction and tumbles forward, then snaps back to the lock-on
    this.dodgeDir = dir; this.pdDone = false; this.dodgeDust = false; this.rollYaw = Math.atan2(dir.x, dir.z);
    this.setState('dodge', P_ROLL, 0.04);
    this.recentDodge.push(GAME.time);
    AUDIO.play('dodge'); haptic(4);
    VFX.dust(this.pos, 3, 0.25, 0.4);
  }
  startJump() {
    this.useSt(PL.jump.st); this.vy = PL.jump.v; this.jumpAtk = false; this.jumpHitDone = false;
    this.jumpVel = (this.jumpVel || V3()).copy(this.vel).multiplyScalar(0.8);
    if (this.wish.lengthSq() > 0.04) this.jumpVel.addScaledVector(_pu.w.copy(this.wish).normalize(), 1.2);
    this.setState('jump', P_JUMP, 0.06); AUDIO.play('dodge'); VFX.dust(this.pos, 3, 0.25, 0.5);
  }
  canCrit() {
    if (!(boss.state === 'stagger' && boss.t < 1.45) && !(boss.state === 'parried' && boss.t < 1.0)) return false;
    const d = Math.hypot(boss.pos.x - this.pos.x, boss.pos.z - this.pos.z);
    return d < 2.6;
  }
  startCritical() {
    this.critKind = boss.state === 'parried' ? 'parried' : 'stagger';
    this.setState('critical', P_CRIT, 0.05); this.critHits = 0; this.activeHit = null; playerTrail.on = false;
    boss.onCritted(this);
    AUDIO.play('armor');
  }
  startGuardCounter() {
    this.useSt(PL.gc.st); this.gcUntil = -9;
    this.heavyDmg = PL.gc.dmg; this.heavyPoise = PL.gc.poise; this.hitDone = false; this.whooshed = false;
    this.setState('heavy', P_HEAVY_REL, 0.05); this.rig.anim.t = 0.02;
    VFX.flash(this.rig.sword.localToWorld(V3(0, 0, 0.8)), 0.6, 0xcfe0ff, 0.12);
  }
  startSkill() {
    if (this.fp < PL.skillFp) { AUDIO.play('deny'); return; }
    this.fp -= PL.skillFp; this.useSt(PL.skill.st); this.hitDone = false; this.whooshed = false;
    this.setState('skill', P_SKILL, 0.05); AUDIO.play('slamTell');
  }
  startGuard() { this.useSt(PL.parrySt); this.setState('parry', P_PARRY, 0.04); AUDIO.play('armor'); }
  startHeal() {
    if (this.flasks <= 0) { AUDIO.play('deny'); return; }
    this.flasks--; this.healApplied = false; this.healT = GAME.time; TELE.heals++;
    this.setState('heal', P_HEAL, 0.1);
    boss.onPlayerHeal();
  }
  update(dt) {
    if (dt <= 0) { this.rig.update(0); this.afterRig(); return; }
    this.t += dt;
    const S = this.state;
    const toB = _pu.toB.set(boss.pos.x - this.pos.x, 0, boss.pos.z - this.pos.z);
    const dist = toB.length(); const bDir = dist > 1e-4 ? _pu.bDir.copy(toB).divideScalar(dist) : _pu.bDir.set(0, 0, -1);
    const bossYaw = Math.atan2(bDir.x, bDir.z);
    // wish direction relative to camera
    const cf = _pu.cf; camera.getWorldDirection(cf); cf.y = 0; cf.normalize();
    const cr = _pu.cr.set(-cf.z, 0, cf.x);
    let sx = INPUT.sx + (INPUT.kb.d - INPUT.kb.a), sy = INPUT.sy + (INPUT.kb.w - INPUT.kb.s);
    const m = Math.hypot(sx, sy); if (m > 1) { sx /= m; sy /= m; }
    this.wish = (this.wish || V3()).set(0, 0, 0).addScaledVector(cr, sx).addScaledVector(cf, sy);
    const wm = Math.min(1, this.wish.length());
    // stamina
    if (this.stDelay > 0) this.stDelay -= dt;
    else if (GAME.time - this.lastUse > PL.regenDelay && S !== 'dash') this.st = Math.min(PL.st, this.st + dt * (S === 'guard' ? PL.regenGuard : PL.regen));
    let targetV = _pu.tv.set(0, 0, 0), faceTarget = bossYaw, turnK = 12;
    this.invuln = false;
    const act = INPUT.peek();

    switch (S) {
      case 'idle': case 'move': case 'dash': {
        if (S === 'dash') {
          if (!INPUT.held.dodge || wm < 0.2 || this.st <= 0) { this.setState('move', this.locoFn(), 0.15); break; }
          this.st = Math.max(0, this.st - PL.dashCost * dt); this.lastUse = GAME.time;
          targetV.copy(this.wish).normalize().multiplyScalar(PL.dash);
          faceTarget = Math.atan2(this.wish.x, this.wish.z); turnK = 10;
        } else {
          if (wm > 0.05) {
            const w = _pu.w.copy(this.wish).normalize();
            const f = w.dot(bDir);
            const sp = f >= 0 ? lerp(PL.strafe, PL.move, f) : lerp(PL.strafe, PL.back, -f);
            targetV.copy(w).multiplyScalar(sp * wm);
            if (this.state !== 'move') this.state = 'move';
          } else if (this.state !== 'idle') this.state = 'idle';
        }
        if (act === 'atk' && this.canCrit()) { INPUT.take('atk'); this.startCritical(); break; }
        if (act === 'atk' && this.st > 0) { INPUT.take('atk'); this.startAttack(0); break; }
        if (act === 'dodge' && this.st > 0) { INPUT.take('dodge'); this.startDodge(); break; }
        if (act === 'guard' && this.st > 0) { INPUT.take('guard'); this.startGuard(); break; }
        if (act === 'heal') { INPUT.take('heal'); this.startHeal(); break; }
        if (act === 'jump' && this.st > 0) { INPUT.take('jump'); this.startJump(); break; }
        if (act === 'skill') { INPUT.take('skill'); this.startSkill(); break; }
        if (act && this.st <= 0 && act !== 'heal') { /* keep buffered */ }
        break;
      }
      case 'attack': {
        const A = PL.atk[this.step], tt = this.t;
        const act0 = A.S, act1 = A.S + A.A, end = A.S + A.A + A.R;
        if (tt < A.S * 0.7) turnK = 9; else turnK = 0;
        if (tt > A.S * 0.6 && tt < act1 && dist > 1.5) targetV.copy(bDir).multiplyScalar(A.lunge / (act1 - A.S * 0.6));
        this.activeHit = tt >= act0 && tt <= act1 ? { dmg: A.dmg, poise: A.poise, heavy: this.step === 2 } : null;
        if (tt >= act0 - 0.06 && !this.whooshed) { this.whooshed = true; AUDIO.play('whoosh', { heavy: this.step === 2 ? 0.6 : 0 }); }
        if (tt < 0.02) this.whooshed = false;
        playerTrail.on = tt > act0 - 0.05 && tt < act1 + 0.05; playerTrail.U.uI.value = this.step === 2 ? 0.42 : 0.28; playerTrail.life = this.step === 2 ? 0.19 : 0.15;
        // hold → heavy
        if (INPUT.held.atk && this.atkPressT === INPUT.atkDownT && GAME.time - INPUT.atkDownT >= 0.2 && tt < A.S * 0.9 && !this.heavyTried) {
          this.heavyTried = true;
          this.useSt(Math.max(0, PL.heavy.st - A.st));
          this.chargeStart = INPUT.atkDownT;
          this.setState('charge', P_HEAVY_CHARGE, 0.12); this.rig.tremble = 0; playerTrail.on = false; this.activeHit = null;
          break;
        }
        // cancels
        if (act === 'dodge' && tt >= act1 + A.R * 0.3 && this.st > 0) { INPUT.take('dodge'); this.activeHit = null; playerTrail.on = false; this.startDodge(); break; }
        if (act === 'atk' && tt >= act1 && this.canCrit()) { INPUT.take('atk'); this.startCritical(); break; }
        if (act === 'atk' && this.step < 2 && tt >= act1 + A.R * 0.3 && this.st > 0) { INPUT.take('atk'); this.startAttack(this.step + 1); break; }
        if (act === 'atk' && this.step === 2 && tt >= end * 0.92 && this.st > 0) { INPUT.take('atk'); this.startAttack(0); break; }
        if (act === 'guard' && tt >= act1 + A.R * 0.45 && this.st > 0) { INPUT.take('guard'); this.activeHit = null; this.startGuard(); break; }
        if (tt >= end) { this.activeHit = null; this.setState('idle', this.locoFn(), 0.18); }
        break;
      }
      case 'charge': {
        turnK = 6;
        const ct = GAME.time - this.chargeStart;
        this.rig.tremble = clamp((ct - 0.6) * 2, 0, 1) * 1.2;
        if (ct > 0.5 && Math.random() < dt * 20) VFX.ashBurst(this.rig.sword.localToWorld(V3(0, 0, 0.9)), 1, 0.4);
        if (!INPUT.held.atk) this.releasePending = true;
        if ((this.releasePending && ct >= PL.heavy.min) || ct >= PL.heavy.max) {
          this.releasePending = false; this.rig.tremble = 0;
          const k = inv(PL.heavy.min, PL.heavy.max, ct);
          this.heavyDmg = lerp(PL.heavy.dmg[0], PL.heavy.dmg[1], k); this.heavyPoise = lerp(PL.heavy.poise[0], PL.heavy.poise[1], k);
          this.hitDone = false; this.whooshed = false;
          this.setState('heavy', P_HEAVY_REL, 0.03);
          break;
        }
        if (act === 'dodge' && ct > 0.3 && this.st > 0) { INPUT.take('dodge'); this.rig.tremble = 0; this.releasePending = false; this.startDodge(); }
        break;
      }
      case 'heavy': {
        const H = PL.heavy, tt = this.t, a0 = H.rel, a1 = H.rel + H.A;
        turnK = tt < 0.06 ? 8 : 0;
        if (tt > 0.05 && tt < a1 && dist > 1.5) targetV.copy(bDir).multiplyScalar(0.55 / (a1 - 0.05));
        this.activeHit = tt >= a0 && tt <= a1 ? { dmg: this.heavyDmg, poise: this.heavyPoise, heavy: true, big: true } : null;
        if (!this.whooshed && tt > a0 - 0.05) { this.whooshed = true; AUDIO.play('whoosh', { heavy: 1 }); }
        if (!this.slammed && tt > a1) { this.slammed = true; const tip = this.rig.sword.localToWorld(V3(0, 0, 1.1)); if (tip.y < 0.6) { VFX.dust(tip, 6, 0.3, 1); AUDIO.play('block'); shake(0.25); } }
        if (tt < 0.02) this.slammed = false;
        playerTrail.on = tt > a0 - 0.04 && tt < a1 + 0.05; playerTrail.U.uI.value = 0.62; playerTrail.life = 0.22;
        if (!this.relShake && tt > a0) { this.relShake = true; shake(0.1); }
        if (tt < 0.02) this.relShake = false;
        if (act === 'dodge' && tt >= a1 + 0.2 && this.st > 0) { INPUT.take('dodge'); this.activeHit = null; this.startDodge(); break; }
        if (tt >= a1 + H.R) { this.activeHit = null; this.setState('idle', this.locoFn(), 0.2); }
        break;
      }
      case 'dodge': {
        const D = PL.dodge, tt = this.t;
        // preparation (30 ms crouch) → hard acceleration → glide → deceleration → recovery
        const curve = (x) => { x = clamp((x - 0.03) / 0.5, 0, 1); return smooth(x) * 0.3 + EASE.out3(x) * 0.7; };
        const disp = D.dist * (curve(tt) - curve(tt - dt));
        if (!this.dodgeDust && tt > 0.46) { this.dodgeDust = true; VFX.dust(this.pos, 3, 0.2, 0.3); AUDIO.play('stepPlayer'); }
        if (this.invuln && Math.random() < dt * 40) { const c = this.rig.chest.getWorldPosition(_pu.w); VFX.norm.emit(c.x + rand(-0.15, 0.15), c.y + rand(-0.5, 0.3), c.z + rand(-0.15, 0.15), 0, 0.2, 0, 0.35, 0.16, 0.3, [0.42, 0.48, 0.58], [0.2, 0.22, 0.26], 0.35, 0, 1, 0); }
        targetV.copy(this.dodgeDir).multiplyScalar(disp / dt);
        this.vel.copy(targetV);
        faceTarget = this.rollYaw; turnK = tt < 0.5 ? 28 : 6;
        this.rig.tumble = TAU * EASE.io(clamp((tt - 0.09) / 0.4, 0, 1));
        this.rig.tuck = clamp(Math.min((tt - 0.05) / 0.08, (0.6 - tt) / 0.1), 0, 1);
        this.invuln = tt >= D.i0 && tt <= D.i0 + (D.i1 - D.i0) * TUNE.iframe;
        if (tt >= 0.52) {
          if (act === 'atk' && this.canCrit()) { INPUT.take('atk'); this.rig.tumble = 0; this.rig.tuck = 0; this.startCritical(); break; }
          if (act === 'atk' && this.st > 0) { INPUT.take('atk'); this.rig.tumble = 0; this.rig.tuck = 0; this.startAttack(0); break; }
          if (act === 'dodge' && this.st > 0) { INPUT.take('dodge'); this.rig.tumble = 0; this.startDodge(); break; }
          if (act === 'guard' && this.st > 0) { INPUT.take('guard'); this.rig.tumble = 0; this.rig.tuck = 0; this.startGuard(); break; }
        }
        if (tt >= D.dur) {
          this.rig.tumble = 0; this.rig.tuck = 0;
          if (INPUT.held.dodge && wm > 0.3 && this.st > 0) this.setState('dash', this.locoFn(), 0.15);
          else this.setState('idle', this.locoFn(), 0.15);
        }
        break;
      }
      case 'parry': {
        turnK = 10;
        if (act === 'atk' && this.canCrit()) { INPUT.take('atk'); this.startCritical(); break; }
        if (this.t >= PL.parryT0 + PL.parryLen) {
          if (INPUT.held.guard) this.setState('guard', this.locoFn(), 0.1);
          else if (this.t >= 0.45) this.setState('idle', this.locoFn(), 0.12);
        }
        break;
      }
      case 'guard': {
        if (!INPUT.held.guard) { this.setState('idle', this.locoFn(), 0.12); break; }
        if (wm > 0.05) targetV.copy(this.wish).normalize().multiplyScalar(PL.guardMove * wm);
        if (act === 'dodge' && this.st > 0) { INPUT.take('dodge'); this.startDodge(); break; }
        if (act === 'atk' && GAME.time < this.gcUntil && this.st > 0) { INPUT.take('atk'); this.startGuardCounter(); break; }
        if (act === 'atk' && this.canCrit()) { INPUT.take('atk'); this.startCritical(); break; }
        if (act === 'atk' && this.st > 0) { INPUT.take('atk'); this.startAttack(0); break; }
        if (act === 'skill') { INPUT.take('skill'); this.startSkill(); break; }
        break;
      }
      case 'guardHit': {
        turnK = 6; targetV.copy(bDir).multiplyScalar(-this.pushV * Math.max(0, 1 - this.t / 0.25));
        if (act === 'atk' && this.t > 0.08 && this.st > 0) { INPUT.take('atk'); this.startGuardCounter(); break; }
        if (this.t > 0.28) this.setState(INPUT.held.guard ? 'guard' : 'idle', this.locoFn(), 0.12); break;
      }
      case 'jump': {
        const J = PL.jump; turnK = 4;
        this.vy -= J.g * dt; this.pos.y += this.vy * dt;
        targetV.copy(this.jumpVel);
        this.rig.tuck = clamp(Math.min(this.t / 0.12, 1), 0, 1) * 0.8;
        if (act === 'atk' && !this.jumpAtk && this.vy > -2.5) { INPUT.take('atk'); this.jumpAtk = true; this.jumpAtkT = 0; this.rig.anim.play(P_JUMPATK, 0.05); this.useSt(18); AUDIO.play('whoosh', { heavy: 1 }); }
        if (this.jumpAtk) {
          this.jumpAtkT += dt; turnK = 8;
          this.activeHit = (this.vy < 0 && this.pos.y < 1.0) ? { dmg: 225, poise: 58, heavy: true, big: true } : null;
          playerTrail.on = this.vy < 0.5; playerTrail.U.uI.value = 0.6; playerTrail.life = 0.2;
        }
        if (this.pos.y <= 0 && this.vy < 0) {
          this.pos.y = 0; this.vy = 0; this.rig.tuck = 0; this.activeHit = null; playerTrail.on = false;
          VFX.dust(this.pos, this.jumpAtk ? 10 : 4, 0.4, 0.8); AUDIO.play(this.jumpAtk ? 'block' : 'stepPlayer'); if (this.jumpAtk) shake(0.3);
          this.landLag = this.jumpAtk ? 0.5 : 0.18;
          this.setState('land', this.jumpAtk ? null : clip([[0, { ...PR, pY: -0.2, cP: 14 }], [0.18, PR, 'io']]), 0.04);
        }
        break;
      }
      case 'land': { turnK = 6; if (this.t > this.landLag) this.setState('idle', this.locoFn(), 0.15); break; }
      case 'critical': {
        // lock both fighters together for the critical blow
        turnK = 20; this.invuln = true;
        const f = _bu.fwd.set(Math.sin(boss.rig.yaw), 0, Math.cos(boss.rig.yaw));
        const want = _pu.w.set(boss.pos.x + f.x * 1.45, 0, boss.pos.z + f.z * 1.45);
        this.pos.x = damp(this.pos.x, want.x, 14, dt); this.pos.z = damp(this.pos.z, want.z, 14, dt); this.vel.set(0, 0, 0);
        if (this.critHits === 0 && this.t > 0.42) { this.critHits = 1; boss.critDamage(this, 0.35); }
        if (this.critHits === 1 && this.t > 1.22) { this.critHits = 2; boss.critDamage(this, 0.65); }
        if (this.t > 1.8) this.setState('idle', this.locoFn(), 0.15);
        break;
      }
      case 'skill': {
        // weapon skill "Ashen Surge": a lunging ember thrust with hyper-armour through the startup
        turnK = this.t < 0.3 ? 10 : 0;
        if (this.t > 0.3 && this.t < 0.52 && dist > 1.4) targetV.copy(bDir).multiplyScalar(3.2 / 0.22);
        this.activeHit = this.t >= 0.38 && this.t <= 0.54 ? { dmg: PL.skill.dmg, poise: PL.skill.poise, heavy: true, big: true } : null;
        playerTrail.on = this.t > 0.34 && this.t < 0.6; playerTrail.U.uI.value = 0.9; playerTrail.life = 0.24;
        if (this.t > 0.1 && this.t < 0.4 && Math.random() < dt * 50) VFX.embers(this.rig.sword.localToWorld(_pu.w.set(0, 0, rand(0.3, 1.1))), 1, 0.05, 0.6);
        if (!this.whooshed && this.t > 0.36) { this.whooshed = true; AUDIO.play('whoosh', { heavy: 1 }); AUDIO.play('fire', { dur: 0.4 }); shake(0.15); }
        if (this.t > 1.2) this.setState('idle', this.locoFn(), 0.15);
        break;
      }
      case 'guardBreak': { turnK = 0; targetV.copy(bDir).multiplyScalar(-2 * Math.max(0, 1 - this.t / 0.4)); if (this.t > 1.25) this.setState('idle', this.locoFn(), 0.15); break; }
      case 'deflect': { turnK = 0; targetV.copy(bDir).multiplyScalar(-1.5 * Math.max(0, 1 - this.t / 0.3)); if (this.t > 0.55) this.setState('idle', this.locoFn(), 0.12); break; }
      case 'heal': {
        turnK = 6;
        if (wm > 0.05) targetV.copy(this.wish).normalize().multiplyScalar(PL.healMove * wm);
        if (!this.healApplied && this.t >= PL.healAt) {
          this.healApplied = true; this.hp = Math.min(PL.hp, this.hp + PL.hp * PL.healAmt);
          AUDIO.play('heal'); const c = this.rig.chest.localToWorld(V3(0, 0.1, 0.2));
          for (let i = 0; i < 18; i++) VFX.add.emit(c.x + rand(-0.3, 0.3), c.y + rand(-0.6, 0.3), c.z + rand(-0.3, 0.3), 0, rand(0.4, 1.2), 0, rand(0.6, 1.1), rand(0.04, 0.08), 0.01, [0.9, 1.1, 1.5], [0.2, 0.35, 0.6], 0.8, -0.2, 1, 1);
          VFX.flash(c, 1.4, 0x9fb8ff, 0.4);
        }
        if (this.t >= PL.healDur) this.setState('idle', this.locoFn(), 0.15);
        break;
      }
      case 'hit': { turnK = 0; targetV.copy(bDir).multiplyScalar(-this.pushV * Math.max(0, 1 - this.t / 0.3)); if (this.t > 0.45) this.setState('idle', this.locoFn(), 0.15); break; }
      case 'knock': { turnK = 0; targetV.copy(bDir).multiplyScalar(-this.pushV * Math.max(0, 1 - this.t / 0.4)); this.invuln = this.t > 0.3 && this.t < 0.95; if (this.t > 1.1) this.setState('idle', this.locoFn(), 0.15); break; }
      case 'down': { turnK = 0; this.invuln = this.t > 0.2; if (this.t > 1.5) this.setState('idle', this.locoFn(), 0.15); break; }
      case 'grabbed': { turnK = 0; this.invuln = false; break; }
      case 'dead': { turnK = 0; break; }
    }
    if (!['attack', 'heavy', 'jump', 'skill'].includes(this.state)) this.activeHit = null;
    if (!['attack', 'heavy', 'jump', 'skill'].includes(this.state)) playerTrail.on = false;
    if (this.state !== 'dodge' && this.state !== 'jump') { this.rig.tumble = 0; if (this.state !== 'land') this.rig.tuck = damp(this.rig.tuck, 0, 20, dt); }
    // integrate
    if (this.state === 'dodge' || this.state === 'jump') this.vel.copy(targetV);
    else if (this.state === 'grabbed' || this.state === 'critical') this.vel.set(0, 0, 0);
    else { const k = this.state === 'dash' ? 8 : 14; this.vel.x = damp(this.vel.x, targetV.x, k, dt); this.vel.z = damp(this.vel.z, targetV.z, k, dt); }
    if (this.state !== 'grabbed') this.pos.addScaledVector(this.vel, dt);
    if (turnK > 0) this.rig.yaw = dampAngle(this.rig.yaw, faceTarget, turnK, dt);
    // local velocity (for lean)
    const c = Math.cos(-this.rig.yaw), s = Math.sin(-this.rig.yaw);
    const lv = this.localVel || (this.localVel = { x: 0, z: 0 }); lv.x = this.vel.x * c + this.vel.z * s; lv.z = -this.vel.x * s + this.vel.z * c;
    this.rig.vel.copy(this.vel);
    // head looks toward the boss
    this.rig.lookYaw = clamp(wrapA(bossYaw - this.rig.yaw) / DEG - (this.rig.anim.pose.pYaw + this.rig.anim.pose.cYaw), -50, 50) * 0.6;
    this.rig.U.uHit.value = Math.max(0, this.rig.U.uHit.value - dt * 6);
    this.recentAtk = this.recentAtk.filter((t) => GAME.time - t < 2.5);
    this.recentDodge = this.recentDodge.filter((t) => GAME.time - t < 6);
    // riposte ready (after a perfect dodge): cold sparks run along the blade
    if (GAME.time < this.pdCounterUntil && Math.random() < dt * 45) { const p = this.rig.sword.localToWorld(_pu.w.set(0, 0, rand(0.2, 1.1))); VFX.add.emit(p.x, p.y, p.z, rand(-0.2, 0.2), rand(0.2, 0.6), rand(-0.2, 0.2), rand(0.25, 0.45), 0.05, 0.01, [0.8, 1.0, 1.7], [0.3, 0.4, 0.9], 0.9, 0, 2, 1); }
    this.rig.update(dt);
    this.afterRig();
  }
  afterRig() {
    for (let i = 0; i < 7; i++) { this.prev[i] = (this.prev[i] || V3()).copy(this.pts[i] || V3()); }
    this.rig.bladePoints(this.pts, 7, 0.12, 1.2);
    if (!this.prevInit) { for (let i = 0; i < 7; i++) this.prev[i].copy(this.pts[i]); this.prevInit = true; }
    playerTrail.push(this.pts[1], this.pts[6], GAME.time);
    capsuleOf(this.pos, 0.3 + this.pos.y, 1.5 + this.pos.y, this.a, this.b);
  }
  facingDot(p) { const f = V3(Math.sin(this.rig.yaw), 0, Math.cos(this.rig.yaw)); const d = V3(p.x - this.pos.x, 0, p.z - this.pos.z).normalize(); return f.dot(d); }
  takeHit(h, pt, from) {
    const guarding = (this.state === 'guard' || this.state === 'guardHit') && this.facingDot(from) > -0.2;
    const badParry = this.state === 'parry'; // a mistimed parry is not a guard: the blow lands clean, a little harder
    const pw = PL.parryLen * TUNE.parry * (h.parry === 'hard' ? 0.55 : 1);
    if (this.state === 'parry' && h.parry && this.t >= PL.parryT0 && this.t <= PL.parryT0 + pw) return 'parry';
    if (guarding && h.guard !== false) {
      const dmg = h.dmg * (1 - PL.guardRed) * TUNE.bossDmg;
      this.hp -= dmg; TELE.dmgTaken += dmg; this.useSt(h.gst || 35);
      VFX.sparks.emit(pt, V3(0, 0.4, 0), 10, 5, 0.8); VFX.flash(pt, 0.8, 0xffc890, 0.08);
      AUDIO.play('block'); shake(0.25); hitStop(0.035);
      this.lastHitBy = h.name;
      if (this.hp <= 0) { this.die(); return 'hit'; }
      if (this.st <= 0) { this.setState('guardBreak', P_GBREAK, 0.04); AUDIO.play('guardBreak'); shake(0.45); haptic(25); }
      else { this.gcUntil = GAME.time + PL.gc.win; this.pushV = 2.5 + (h.gst || 35) * 0.03; this.setState('guardHit', clip([[0, P_GUARD], [0.06, { cP: -10, pY: -0.12, sy: 0.02, sz: 0.28 }, 'out3'], [0.28, P_GUARD, 'io']]), 0.02); }
      return 'block';
    }
    const dmg = h.dmg * TUNE.bossDmg * (badParry ? 1.2 : 1);
    this.hp -= dmg; TELE.dmgTaken += dmg; this.lastHitBy = h.name;
    this.hurtFx = 1; this.activeHit = null; playerTrail.on = false; this.rig.tremble = 0;
    AUDIO.play('hitPlayer'); haptic(30); shake(dmg > 280 ? 0.6 : 0.4); hitStop(dmg > 280 ? 0.06 : 0.045);
    VFX.sparks.emit(pt, V3(0, 0.3, 0), 6, 4, 0.9, 0.7);
    VFX.ashBurst(pt, 14, 2.2); VFX.dust(this.pos, 3, 0.4, 0.5);
    this.rig.flinchV += 30;
    { const f = V3(Math.sin(this.rig.yaw), 0, Math.cos(this.rig.yaw)), hx = from.x - this.pos.x, hz = from.z - this.pos.z; this.rig.flinchYV += (Math.sign(f.x * hz - f.z * hx) || 1) * 18; }
    this.rig.U.uHit.value = 0.45;
    if (this.hp <= 0) { this.die(); return 'hit'; }
    if (this.state === 'skill' && this.t < 0.55 && h.kind !== 'grabSlam') { this.rig.anim.speed = 1; return 'hit'; } // hyper-armour
    if (this.state === 'jump') { this.pos.y = Math.max(0, this.pos.y); this.vy = Math.min(this.vy, 0); }
    if (h.kind === 'grabSlam') { this.setState('down', P_DOWN, 0.05); }
    else if (dmg >= 280) { this.pushV = 5; this.setState('knock', P_KNOCK, 0.03); }
    else { this.pushV = 2.4; this.setState('hit', P_HIT, 0.03); }
    return 'hit';
  }
  die() {
    this.hp = 0; this.dead = true; this.setState('dead', P_DEAD, 0.05);
    TELE.deaths.push({ by: this.lastHitBy, t: Math.round(GAME.fightTime) });
    onPlayerDeath();
  }
}

// ------------------------------------------------------------------ BOSS poses (boss-local units; rig scale 1.3 applied by the root)
const BR = { pYaw: -15, cYaw: 10, pP: 6, cP: 8, hYaw: 5, hP: 4, sx: -0.06, sy: -0.36, sz: 0.3, syaw: -12, spit: 18, srol: 90, pY: -0.04, lhw: 1 };
let B_READY = P(BR);
const H_WIND = { cYaw: -52, pYaw: -26, cP: 5, pY: -0.07, sx: -0.32, sy: -0.08, sz: -0.02, syaw: -142, spit: 22, srol: 12 };
const H_SIDE = { cYaw: -32, syaw: -98, sx: -0.26, sz: 0.22 };
const H_MID = { cYaw: 0, pYaw: -12, sx: 0.0, sy: -0.18, sz: 0.56, syaw: -5, spit: 4 };
const H_END = { cYaw: 46, pYaw: -2, sx: 0.32, sy: -0.3, sz: 0.28, syaw: 102, spit: -12 };
const H_REC = { cYaw: 48, syaw: 116, spit: -26, sx: 0.33, sy: -0.42, sz: 0.16, pY: -0.07 };
const HB_WIND = { cYaw: 48, pYaw: -4, sx: 0.32, sy: -0.06, sz: 0.0, syaw: 142, spit: 22, srol: 12, pY: -0.07 };
const HB_SIDE = { cYaw: 32, syaw: 98, sx: 0.26, sz: 0.22 };
const HB_MID = { cYaw: 0, pYaw: -14, sx: 0.0, sy: -0.18, sz: 0.56, syaw: 5, spit: 4 };
const HB_END = { cYaw: -46, pYaw: -26, sx: -0.32, sy: -0.3, sz: 0.28, syaw: -102, spit: -12 };
const O_WIND = { cYaw: -10, cP: -12, pP: 2, pY: 0.02, sx: -0.04, sy: 0.38, sz: -0.04, syaw: -8, spit: 146, srol: 90 };
const O_SIDE = { spit: 120, cP: -4 };
const O_MID = { cP: 10, sy: 0.2, sz: 0.56, spit: 36 };
const O_END = { cP: 32, pP: 16, pY: -0.22, sy: -0.5, sz: 0.56, spit: -56, cYaw: 0 };
const T_WIND = { cYaw: -36, pYaw: -32, cP: 0, pY: -0.1, sx: -0.26, sy: -0.12, sz: -0.16, syaw: -4, spit: 4, srol: 0 };
const T_END = { cYaw: 10, pYaw: -4, pP: 16, cP: 10, pY: -0.16, sx: 0.02, sy: -0.08, sz: 0.72, syaw: 0, spit: 2, srol: 0 };
const D_WIND = { cYaw: 42, pYaw: 0, cP: -6, sx: 0.3, sy: 0.26, sz: 0.0, syaw: 122, spit: 62, srol: 40 };
const D_SIDE = { cYaw: 28, syaw: 80, spit: 45, sz: 0.25 };
const D_MID = { cYaw: 0, sx: 0, sy: 0.0, sz: 0.56, syaw: 4, spit: 14, cP: 6 };
const D_END = { cYaw: -42, pYaw: -24, sx: -0.3, sy: -0.4, sz: 0.3, syaw: -100, spit: -32, cP: 14 };
const RS_WIND = { cYaw: -46, pYaw: -26, sx: -0.3, sy: -0.5, sz: 0.2, syaw: -122, spit: -40, srol: 30, pY: -0.14, cP: 16 };
const RS_SIDE = { cYaw: -28, syaw: -80, spit: -20 };
const RS_MID = { cYaw: 0, sx: 0, sy: -0.05, sz: 0.56, syaw: 0, spit: 30, cP: 0, pY: -0.06 };
const RS_END = { cYaw: 46, sx: 0.26, sy: 0.36, sz: 0.2, syaw: 92, spit: 96, cP: -10, pY: 0.02 };
const DL_WIND = { cYaw: -56, pYaw: -32, cP: -9, pY: -0.06, sx: -0.3, sy: 0.3, sz: -0.1, syaw: -150, spit: 76, srol: 40 };
const DL_SIDE = { cYaw: -30, syaw: -80, spit: 42, sx: -0.2, sy: 0.15, sz: 0.3 };
const DL_MID = { cYaw: 0, pYaw: -12, syaw: 0, spit: 6, sx: 0, sy: -0.1, sz: 0.56, cP: 10 };
const DL_END = { cYaw: 42, pYaw: 0, syaw: 92, spit: -40, sx: 0.3, sy: -0.46, sz: 0.25, cP: 18, pY: -0.14 };
const G_WIND = { cYaw: -28, pYaw: -20, cP: 10, pY: -0.1, sx: -0.3, sy: -0.42, sz: 0.1, syaw: -60, spit: -35, srol: 90, lhw: 0, lhx: 0.34, lhy: -0.08, lhz: 0.3 };
const G_REACH = { cYaw: 14, pYaw: 6, cP: 22, pP: 14, pY: -0.18, lhw: 0, lhx: 0.08, lhy: -0.06, lhz: 0.78 };
const BG = { pYaw: -8, cYaw: 4, cP: 4, pY: -0.1, sx: 0.0, sy: -0.02, sz: 0.4, syaw: 2, spit: 84, srol: 0, hP: 6 };
const SW_RAISE = { cYaw: -4, cP: -16, pP: 0, pY: 0.02, sx: 0.0, sy: 0.46, sz: 0.06, syaw: 0, spit: 100, srol: 90 };
const SW_SLAM = { cP: 36, pP: 18, pY: -0.3, sy: -0.52, sz: 0.62, spit: -62, cYaw: 0 };

// ------------------------------------------------------------------ Boss move data (data-driven)
// hits: [t0, t1, dmg, parry(1|'hard'|0), guardStamina, extra]; track: [t0,t1,deg/s]; motion: [t0,t1,dist(+fwd)]; ev: [t, name]
let MOVES = {
  hslash: { ph: [1, 2], range: [0, 3.3], w: 1.0, basic: true, dur: 1.36,
    keys: [[0, BR], [0.4, H_WIND, 'out3'], [0.5, { syaw: -148, cYaw: -55 }, 'lin'], [0.55, H_SIDE, 'in'], [0.63, H_MID, 'lin'], [0.71, H_END, 'lin'], [1.0, H_REC, 'out'], [1.36, BR, 'io']],
    hits: [[0.55, 0.71, 210, 1, 35]], track: [[0, 0.33, 220], [0.33, 0.47, 70]], motion: [[0.45, 0.7, 0.7]], ev: [[0.46, 'whoosh']] },
  overhead: { ph: [1, 2], range: [0, 3.4], w: 0.8, basic: true, dur: 1.79,
    keys: [[0, BR], [0.5, O_WIND, 'out3'], [0.74, { spit: 155, sy: 0.415, cP: -14 }, 'lin'], [0.8, O_SIDE, 'in'], [0.87, O_MID, 'lin'], [0.94, O_END, 'lin'], [1.35, { cP: 28, pY: -0.2, spit: -58 }, 'out'], [1.79, BR, 'io']],
    hits: [[0.8, 0.94, 300, 'hard', 55]], track: [[0, 0.42, 180], [0.42, 0.6, 60]], motion: [[0.7, 0.92, 0.9]], ev: [[0.72, 'whoosh'], [0.94, 'impact']], flame: 0.94 },
  thrust: { ph: [1, 2], range: [1.8, 5.2], w: 0.8, dur: 1.46,
    keys: [[0, BR], [0.45, T_WIND, 'out3'], [0.62, { sz: -0.22, cYaw: -40 }, 'lin'], [0.74, T_END, 'snap'], [1.1, { pY: -0.12, cP: 8 }, 'out'], [1.46, BR, 'io']],
    hits: [[0.62, 0.86, 260, 0, 40]], track: [[0, 0.42, 200]], motion: [[0.6, 0.84, 2.7]], ev: [[0.56, 'whoosh']] },
  double: { ph: [1, 2], range: [0, 3.2], w: 0.9, dur: 1.92, combo: true,
    keys: [[0, BR], [0.36, H_WIND, 'out3'], [0.5, H_SIDE, 'in'], [0.58, H_MID, 'lin'], [0.65, H_END, 'lin'], [0.93, HB_WIND, 'out'], [1.07, HB_SIDE, 'in'], [1.15, HB_MID, 'lin'], [1.22, HB_END, 'lin'], [1.55, { cYaw: -48, syaw: -116, spit: -26, sy: -0.42 }, 'out'], [1.92, BR, 'io']],
    hits: [[0.5, 0.65, 190, 1, 32], [1.07, 1.22, 220, 1, 36]], track: [[0, 0.3, 200], [0.3, 0.42, 60], [0.65, 0.88, 160], [0.88, 0.98, 40]], motion: [[0.42, 0.62, 0.5], [1.0, 1.2, 0.7]], ev: [[0.42, 'whoosh'], [1.0, 'whoosh']] },
  triple: { ph: [1, 2], range: [0, 3.0], w: 0.65, dur: 2.95, combo: true,
    keys: [[0, BR], [0.42, H_WIND, 'out3'], [0.55, H_SIDE, 'in'], [0.62, H_MID, 'lin'], [0.7, H_END, 'lin'], [0.92, D_WIND, 'out'], [1.05, D_SIDE, 'in'], [1.12, D_MID, 'lin'], [1.2, D_END, 'lin'], [1.55, O_WIND, 'out3'], [1.7, O_SIDE, 'in'], [1.77, O_MID, 'lin'], [1.85, O_END, 'lin'], [2.45, { cP: 28, pY: -0.2, spit: -58 }, 'out'], [2.95, BR, 'io']],
    hits: [[0.55, 0.7, 200, 1, 32], [1.05, 1.2, 200, 1, 32], [1.7, 1.85, 300, 'hard', 55]], track: [[0, 0.32, 200], [0.32, 0.45, 60], [0.7, 0.9, 150], [1.2, 1.45, 150], [1.45, 1.55, 40]],
    motion: [[0.45, 0.68, 0.5], [0.98, 1.18, 0.5], [1.6, 1.82, 0.7]], ev: [[0.45, 'whoosh'], [0.98, 'whoosh'], [1.62, 'whoosh'], [1.85, 'impact']], flame: 1.85,
    branch: { at: 1.9, p: 0.6, to: 'tripleExt', ph: 2 } },
  tripleExt: { ph: [], range: [0, 3.0], w: 0, dur: 3.5, combo: true, hidden: true,
    keys: null, // built below from triple
    hits: [[0.55, 0.7, 200, 1, 32], [1.05, 1.2, 200, 1, 32], [1.7, 1.85, 300, 'hard', 55], [2.4, 2.56, 280, 1, 45]], track: [[0, 0.32, 200], [0.32, 0.45, 60], [0.7, 0.9, 150], [1.2, 1.45, 150], [1.45, 1.55, 40], [1.9, 2.15, 200], [2.15, 2.22, 40]],
    motion: [[0.45, 0.68, 0.5], [0.98, 1.18, 0.5], [1.6, 1.82, 0.7], [2.25, 2.5, 0.9]], ev: [[0.45, 'whoosh'], [0.98, 'whoosh'], [1.62, 'whoosh'], [1.85, 'impact'], [2.3, 'whoosh'], [2.56, 'fireArc']], flame: 1.85 },
  delayed: { ph: [1, 2], range: [0, 3.4], w: 0.75, dur: 2.1,
    keys: [[0, BR], [0.45, DL_WIND, 'out3'], [0.7, { cYaw: -46, syaw: -138, spit: 58, sy: 0.2, cP: -3 }, 'io'], [0.95, { cYaw: -62, syaw: -158, spit: 84, sy: 0.35, cP: -11 }, 'io'], [1.1, { cYaw: -60, syaw: -156, spit: 80, sy: 0.33 }, 'lin'], [1.18, DL_SIDE, 'in'], [1.25, DL_MID, 'lin'], [1.32, DL_END, 'lin'], [1.7, { cP: 14, pY: -0.1 }, 'out'], [2.1, BR, 'io']],
    hits: [[1.18, 1.32, 280, 1, 45]], track: [[0, 0.8, 170], [0.8, 0.98, 45]], motion: [[1.1, 1.3, 0.8]], tremble: [0.45, 1.1], ev: [[0.5, 'delayTell'], [1.12, 'whoosh']],
    branch: { at: 1.33, p: 0.65, to: 'delayedFollow', ph: 2 } },
  delayedFollow: { ph: [], range: [0, 3.4], w: 0, dur: 3.05, hidden: true,
    keys: null,
    hits: [[1.18, 1.32, 280, 1, 45], [2.18, 2.4, 260, 0, 40]], track: [[0, 0.8, 170], [0.8, 0.98, 45], [1.5, 1.85, 160]], motion: [[1.1, 1.3, 0.8], [2.12, 2.38, 2.4]], tremble: [0.45, 1.1], tremble2: [1.55, 2.05],
    ev: [[0.5, 'delayTell'], [1.12, 'whoosh'], [1.6, 'delayTell'], [2.12, 'whoosh']] },
  advance: { ph: [1, 2], range: [3.8, 13], w: 1.0, dur: 1.75,
    keys: [[0, BR], [0.3, { ...H_WIND, pP: 14 }, 'out'], [0.64, { ...H_WIND, syaw: -150, pP: 16 }, 'lin'], [0.72, H_SIDE, 'in'], [0.8, H_MID, 'lin'], [0.88, H_END, 'lin'], [1.3, H_REC, 'out'], [1.75, BR, 'io']],
    hits: [[0.72, 0.88, 250, 1, 38]], track: [[0, 0.45, 150], [0.45, 0.55, 50]], motion: [[0.12, 0.84, 'adv']], ev: [[0.62, 'whoosh']] },
  grab: { ph: [1, 2], range: [0, 2.1], w: 0.4, cd: 7, dur: 2.0,
    keys: [[0, BR], [0.35, G_WIND, 'out3'], [0.8, { ...G_WIND, lhz: 0.24, cP: 12 }, 'lin'], [0.92, G_REACH, 'snap'], [1.3, { ...G_REACH, cP: 26, pY: -0.2 }, 'out'], [2.0, BR, 'io']],
    hits: [[0.85, 1.05, 0, 0, 0, 'grab']], track: [[0, 0.5, 170], [0.5, 0.65, 40]], motion: [[0.8, 1.02, 0.9]], ev: [[0.08, 'grabTell']] },
  grabHold: { ph: [], hidden: true, dur: 2.1,
    keys: [[0, G_REACH], [0.45, { cP: -6, pP: 0, pY: -0.02, lhx: 0.08, lhy: 0.32, lhz: 0.52 }, 'io'], [0.9, { cP: 30, pP: 16, pY: -0.26, lhy: -0.5, lhz: 0.72 }, 'in3'], [1.4, { cP: 24, pY: -0.2 }, 'out'], [2.1, BR, 'io']],
    hits: [], track: [], motion: [], ev: [[0.9, 'grabSlam']] },
  guard: { ph: [1, 2], range: [0, 3.2], w: 0, cd: 5, dur: 1.4, special: true,
    keys: [[0, BR], [0.22, BG, 'out3'], [1.4, BG, 'lin']], hits: [], track: [[0, 1.4, 160]], motion: [], ev: [[0.05, 'armor']], guardWin: [0.15, 1.4] },
  counter: { ph: [], hidden: true, dur: 1.05,
    keys: [[0, BG], [0.2, H_WIND, 'out3'], [0.32, H_SIDE, 'in'], [0.4, H_MID, 'lin'], [0.47, H_END, 'lin'], [0.75, H_REC, 'out'], [1.05, BR, 'io']],
    hits: [[0.32, 0.47, 230, 1, 38]], track: [[0, 0.18, 260]], motion: [[0.25, 0.45, 0.6]], ev: [[0.24, 'whoosh']] },
  backstep: { ph: [1, 2], range: [0, 2.6], w: 0, cd: 4, dur: 1.25, special: true,
    keys: [[0, BR], [0.3, H_WIND, 'out3'], [0.45, H_SIDE, 'in'], [0.52, H_MID, 'lin'], [0.6, H_END, 'lin'], [0.95, H_REC, 'out'], [1.25, BR, 'io']],
    hits: [[0.45, 0.6, 200, 1, 32]], track: [[0, 0.3, 200]], motion: [[0.05, 0.62, -3.0]], ev: [[0.4, 'whoosh']] },
  shockwave: { ph: [2], range: [0, 4.6], w: 0.8, cd: 8, dur: 2.6, heavy: true,
    keys: [[0, BR], [0.5, SW_RAISE, 'out3'], [1.15, { spit: 150, cP: -21, sy: 0.5 }, 'lin'], [1.25, { spit: 112, cP: -6 }, 'in'], [1.31, O_MID, 'lin'], [1.37, SW_SLAM, 'lin'], [2.2, { cP: 30, pY: -0.26 }, 'out'], [2.6, BR, 'io']],
    hits: [[1.25, 1.37, 350, 0, 65]], track: [[0, 0.8, 150], [0.8, 1.05, 40]], motion: [[1.2, 1.36, 0.6]], ev: [[0.08, 'slamTell'], [1.37, 'slam']], flame: 1.37, gather: [0.3, 1.25] },
};
// shared prefixes for branches
MOVES.tripleExt.keys = [...MOVES.triple.keys.slice(0, 13), [2.2, RS_WIND, 'out'], [2.4, RS_SIDE, 'in'], [2.48, RS_MID, 'lin'], [2.56, RS_END, 'lin'], [3.0, { cP: 4, spit: 80 }, 'out'], [3.5, BR, 'io']];
MOVES.delayedFollow.keys = [...MOVES.delayed.keys.slice(0, 8), [1.55, { cYaw: 30, cP: 18, pY: -0.16, syaw: 60, spit: -30, sx: 0.2, sy: -0.4, sz: 0.3 }, 'out'], [2.05, { ...T_WIND, pY: -0.14 }, 'io'], [2.18, { sz: -0.2, cYaw: -40 }, 'lin'], [2.3, T_END, 'snap'], [2.65, { pY: -0.12 }, 'out'], [3.05, BR, 'io']];
// ---- readability pass: every attack gets a "prepare" beat (weight shift) before the wind-up,
// wind-ups start slow (ease-in-out), releases accelerate hard (ease-in cubic), follow-throughs decelerate.
// Delays differ per move: short (hslash/double), long (overhead/thrust), two-stage (delayed).
// phase 2: a five-beat flurry with a held final slam, and a leaping plunge from range
MOVES.flurry = { ph: [2], range: [0, 3.0], w: 0.7, dur: 3.3, combo: true, cd: 6,
  keys: [[0, BR], [0.36, H_WIND, 'out3'], [0.5, H_SIDE, 'in'], [0.56, H_MID, 'lin'], [0.62, H_END, 'lin'],
    [0.84, HB_WIND, 'out'], [0.95, HB_SIDE, 'in'], [1.01, HB_MID, 'lin'], [1.07, HB_END, 'lin'],
    [1.25, H_WIND, 'out'], [1.35, H_SIDE, 'in'], [1.41, H_MID, 'lin'], [1.47, H_END, 'lin'],
    [1.75, O_WIND, 'out3'], [2.05, { spit: 156, sy: 0.42, cP: -15 }, 'lin'], [2.2, O_SIDE, 'in'], [2.27, O_MID, 'lin'], [2.34, O_END, 'lin'], [2.8, { cP: 28, pY: -0.2, spit: -58 }, 'out'], [3.3, BR, 'io']],
  hits: [[0.5, 0.62, 180, 1, 30], [0.95, 1.07, 180, 1, 30], [1.35, 1.47, 190, 1, 32], [2.2, 2.34, 320, 'hard', 60]],
  track: [[0, 0.3, 200], [0.62, 0.85, 150], [1.07, 1.25, 150], [1.47, 1.9, 160], [1.9, 2.05, 40]],
  motion: [[0.42, 0.6, 0.5], [0.88, 1.05, 0.5], [1.28, 1.45, 0.6], [2.1, 2.3, 0.8]], tremble: [1.75, 2.08],
  ev: [[0.44, 'whoosh'], [0.9, 'whoosh'], [1.3, 'whoosh'], [1.95, 'glint'], [2.12, 'whoosh'], [2.34, 'impact']], flame: 2.34 };
MOVES.leap = { ph: [2], range: [4.2, 12], w: 0.9, cd: 7, dur: 2.5, heavy: true,
  keys: [[0, BR], [0.5, { pY: -0.32, pP: 14, cP: 24, hP: -6, sx: -0.04, sy: 0.2, sz: -0.1, syaw: -6, spit: 120, srol: 90 }, 'io'], [0.62, { pY: 0.02, cP: -14, pP: 0, sy: 0.45, spit: 158 }, 'out'], [1.1, { spit: 160, cP: -18 }, 'lin'],
    [1.2, O_SIDE, 'in'], [1.26, O_MID, 'lin'], [1.32, SW_SLAM, 'lin'], [2.0, { cP: 30, pY: -0.26 }, 'out'], [2.5, BR, 'io']],
  hits: [[1.2, 1.34, 320, 0, 60]], track: [[0, 0.58, 200]], motion: [], ev: [[0.56, 'leapTakeoff'], [1.32, 'leapLand']], flame: 1.32, leap: { t0: 0.6, t1: 1.24, h: 2.4 } };

// ---- guideline pass: context branches from the basic slash, phase-2 delayed continuations, positional answers
// hslash → 2nd (backhand) → 3rd (overhead). Phase 1: end 55% / +B 29% / +B+C 16%. Phase 2: end 30% / +B 28% / +B+C 42% with a held C.
// A player standing to the side/behind after the first slash draws the backhand more often; a player out of reach ends it.
{
  const H = MOVES.hslash, D = MOVES.double, sh = 0.06;
  const tailB = D.keys.slice(5).map((k) => [k[0] + sh, k[1], k[2]]);
  MOVES.hslash2 = { ph: [], hidden: true, range: [0, 3.3], w: 0, dur: 1.92 + sh, combo: true,
    keys: [...H.keys.slice(0, 6), ...tailB],
    hits: [H.hits[0], [1.07 + sh, 1.22 + sh, 220, 1, 36]], track: [...H.track, [0.71, 0.94 + sh, 180]], motion: [...H.motion, [1.0 + sh, 1.2 + sh, 0.7]], ev: [...H.ev, [1.0 + sh, 'whoosh']] };
  const preC = MOVES.hslash2.keys.slice(0, 10); // up to the backhand's follow-through
  const C = (hold) => [[1.6, O_WIND, 'out3'], [1.78 + hold, { spit: 155 + hold * 6, sy: 0.415, cP: -14 - hold * 4 }, 'lin'], [1.84 + hold, O_SIDE, 'in'], [1.91 + hold, O_MID, 'lin'], [1.98 + hold, O_END, 'lin'], [2.45 + hold, { cP: 28, pY: -0.2, spit: -58 }, 'out'], [2.85 + hold, BR, 'io']];
  const mk3 = (hold) => ({ ph: [], hidden: true, range: [0, 3.3], w: 0, dur: 2.85 + hold, combo: true, keys: [...preC, ...C(hold)],
    hits: [...MOVES.hslash2.hits, [1.84 + hold, 1.98 + hold, 280, 'hard', 50]], track: [...MOVES.hslash2.track, [1.28, 1.5, 180]],
    motion: [...MOVES.hslash2.motion, [1.75 + hold, 1.96 + hold, 0.8]], ev: [...MOVES.hslash2.ev, [1.74 + hold, 'whoosh'], [1.98 + hold, 'impact'], ...(hold ? [[1.6 + hold * 0.6, 'glint']] : [])],
    flame: 1.98 + hold, ...(hold ? { tremble: [1.62, 1.78 + hold] } : {}) });
  MOVES.hslash3 = mk3(0); MOVES.hslash3d = mk3(0.5);
  H.branch = { at: 0.72, pick: (b, dist, ang) => (dist < 4.0 && Math.random() < (b.phase === 2 ? 0.7 : 0.45) + (ang > 0.9 ? 0.2 : 0)) ? 'hslash2' : null };
  MOVES.hslash2.branch = { at: 1.29, pick: (b, dist) => (dist < 3.8 && Math.random() < (b.phase === 2 ? 0.6 : 0.35)) ? (b.phase === 2 ? 'hslash3d' : 'hslash3') : null };
  // phase 2: the double slash may hold, then lunge (A → B → delay → C)
  MOVES.doubleD = { ph: [], hidden: true, range: [0, 3.2], w: 0, dur: 2.9, combo: true,
    keys: [...D.keys.slice(0, 9), [1.55, { ...T_WIND, cP: 4 }, 'io'], [1.96, { ...T_WIND, sz: -0.22, cYaw: -40 }, 'lin'], [2.08, T_END, 'snap'], [2.48, { pY: -0.12, cP: 8 }, 'out'], [2.9, BR, 'io']],
    hits: [...D.hits, [1.96, 2.2, 240, 0, 40]], track: [...D.track, [1.22, 1.6, 200]], motion: [...D.motion, [1.94, 2.18, 2.2]], tremble: [1.58, 1.95],
    ev: [...D.ev, [1.7, 'glint'], [1.9, 'whoosh']] };
  D.branch = { at: 1.23, p: 0.5, to: 'doubleD', ph: 2 };
}
// close quarters: a player who hugs the Warden gets a stamp (short ring, roll out or time the roll)
MOVES.stomp = { ph: [1, 2], range: [0, 2.4], w: 0, cd: 5, dur: 1.1, special: true,
  keys: [[0, BR], [0.38, { pY: 0.05, cP: -8, hP: -6, pP: -4, sy: -0.22, spit: 32, cYaw: -10 }, 'io'], [0.56, { pY: -0.24, cP: 18, pP: 12, sy: -0.46, spit: -8, cYaw: 0 }, 'in3'], [1.1, BR, 'io']],
  hits: [], track: [[0, 0.3, 120]], motion: [], ev: [[0.05, 'armor'], [0.56, 'stomp']], ringHit: 0.56 };
// standing behind the Warden: a spinning backhand that turns him around mid-swing
MOVES.turn = { ph: [1, 2], range: [0, 3.2], w: 0, cd: 4, dur: 1.2, special: true,
  keys: [[0, BR], [0.32, HB_WIND, 'out3'], [0.44, HB_SIDE, 'in'], [0.51, HB_MID, 'lin'], [0.58, HB_END, 'lin'], [0.9, { cYaw: -48, syaw: -116, spit: -26, sy: -0.42 }, 'out'], [1.2, BR, 'io']],
  hits: [[0.44, 0.6, 190, 'hard', 34]], track: [[0, 0.56, 520]], motion: [[0.4, 0.58, 0.4]], ev: [[0.04, 'armor'], [0.36, 'whoosh']] };
// learnable delay variants: sometimes the Warden holds the wind-up a beat longer before releasing
let HOLD_VAR = { hslash: [0.3, 0.35], overhead: [0.35, 0.5], thrust: [0.3, 0.4], advance: [0.25, 0.3], delayed: [0.4, 0.45], shockwave: [0.3, 0.35], double: [0.25, 0.3] };
const PREP = { hslash2: 0.14, hslash3: 0.14, hslash3d: 0.14, doubleD: 0.12, stomp: 0.1, turn: 0.1, flurry: 0.14, leap: 0.12, hslash: 0.14, overhead: 0.26, thrust: 0.3, double: 0.12, triple: 0.18, tripleExt: 0.18, delayed: 0.2, delayedFollow: 0.2, advance: 0.16, grab: 0.24, shockwave: 0.2 };
const PREP_POSE = { pY: -0.1, cP: 14, pP: 6, hP: 10, spit: 10, sy: -0.4, pYaw: -20 };
const GLINT = { turn: 1, overhead: 1, thrust: 1, delayed: 1, delayedFollow: 1, shockwave: 1, advance: 1, triple: 0 };
const EASE_MAP = { out3: 'io', in: 'in3', out: 'out3' };
// weak ≈0.4 s window (one light hit) · combo ≈0.8 s (two) · strong ≈1.25 s (two or three / one heavy) · big ≈1.8 s
const TIER = { hslash: 'weak', backstep: 'weak', counter: 'weak', turn: 'weak', stomp: 'weak',
  double: 'combo', hslash2: 'combo', tripleExt: 'combo',
  overhead: 'strong', thrust: 'strong', delayed: 'strong', delayedFollow: 'strong', advance: 'strong', triple: 'strong', hslash3: 'strong', hslash3d: 'strong', doubleD: 'strong', flurry: 'strong',
  shockwave: 'big', leap: 'big', grab: 'big' };
const TIERS = { weak: { rec: 0.28, gap: 0.14, allow: 1 }, combo: { rec: 0.55, gap: 0.24, allow: 2 }, strong: { rec: 0.95, gap: 0.3, allow: 3 }, big: { rec: 1.4, gap: 0.4, allow: 4 } };
// tracking: strong trackers turn until just before the blade lands (dodge late); weak ones lock early (side-steps work)
const WEAK_TRACK = { overhead: 1, thrust: 1, delayed: 1, delayedFollow: 1, shockwave: 1, leap: 1, hslash3: 1, hslash3d: 1, doubleD: 1, triple: 1, tripleExt: 1, flurry: 1 };
function processMoves(MV, cfg) {
 for (const k in MV) {
  const m = MV[k], p = cfg.prep[k] || 0;
  m.keys = m.keys.map((kk, i) => i === 0 ? kk : [kk[0] + p, kk[1], EASE_MAP[kk[2]] || kk[2] || 'io']);
  if (p > 0) m.keys.splice(1, 0, [p * 0.75, PREP_POSE, 'io']);
  const sh = (a) => a && a.map((x) => [x[0] + p, x[1] + p, ...x.slice(2)]);
  m.hits = (m.hits || []).map((h) => [h[0] + p, h[1] + p, ...h.slice(2)]);
  m.track = sh(m.track) || []; if (p > 0) m.track.unshift([0, p, 220]);
  m.motion = sh(m.motion) || [];
  m.ev = (m.ev || []).map((e) => [e[0] + p, e[1]]);
  for (const f of ['tremble', 'tremble2', 'gather', 'guardWin']) if (m[f]) m[f] = [m[f][0] + p, m[f][1] + p];
  if (m.flame) m.flame += p;
  if (m.leap) { m.leap.t0 += p; m.leap.t1 += p; }
  if (m.branch) m.branch.at += p;
  if (m.ringHit) m.ringHit += p;
  m.dur += p;
  // counter window: rescale the follow-through after the last blow to the move's tier
  const tier = TIERS[cfg.tier[k]];
  m.tier = tier || TIERS.strong;
  const lastEnd = m.hits.length ? Math.max(...m.hits.map((h) => h[1])) : (m.ringHit || 0);
  m.lastEnd = lastEnd;
  if (tier && lastEnd > 0) {
    const start = Math.max(lastEnd, m.branch ? m.branch.at : 0), want = lastEnd + tier.rec;
    if (want > start + 0.1) {
      const f = (want - start) / (m.dur - start), sc = (x) => (x > start ? start + (x - start) * f : x);
      m.keys = m.keys.map((kk) => [sc(kk[0]), kk[1], kk[2]]);
      m.ev = m.ev.map((e) => [sc(e[0]), e[1]]);
      m.track = m.track.map((x) => [sc(x[0]), sc(x[1]), x[2]]);
      m.motion = m.motion.map((x) => [sc(x[0]), sc(x[1]), x[2]]);
      m.dur = want;
    }
  }
  // tracking profile
  if (cfg.weak[k]) {
    // no turning in the last 0.35 s before each blow and while it is live
    for (const h of m.hits) m.track = m.track.flatMap((tr) => {
      const a = h[0] - 0.35, b = h[1];
      if (tr[1] <= a || tr[0] >= b) return [tr];
      const out = []; if (tr[0] < a) out.push([tr[0], a, tr[2]]); if (tr[1] > b) out.push([b, tr[1], tr[2]]); return out;
    });
  } else if (m.hits.length) {
    for (const h of m.hits) m.track.push([h[0] - 0.24, h[0] - 0.03, 150]); // keep turning into the swing
  }
  if (cfg.glint[k] && m.hits.length) m.ev.push([Math.max(p, m.hits[0][0] - 0.3), 'glint']);
  if (cfg.extraGlint && cfg.extraGlint[k] !== undefined) m.ev.push([cfg.extraGlint[k] + p, 'glint']);
  m.ev.sort((a, b) => a[0] - b[0]);
  m.clip = clip(m.keys); m.name = k;
 }
}
processMoves(MOVES, { prep: PREP, glint: GLINT, tier: TIER, weak: WEAK_TRACK, extraGlint: { delayed: 0.47, delayedFollow: 0.47 } });
let B_STAGGER = clip([[0, BR], [0.15, { cP: -18, pP: -8, pY: -0.08, hP: -16, sx: 0.1, sy: -0.2, sz: 0.2, syaw: 40, spit: 40, lhw: 0.3 }, 'out3'], [0.55, { pY: -0.42, cP: 30, pP: 10, hP: 26, sx: -0.1, sy: -0.46, sz: 0.34, syaw: -10, spit: -70, lhw: 1 }, 'io'], [1.25, { pY: -0.4, cP: 28 }, 'lin'], [1.6, BR, 'io']]);
let B_PARRIED = clip([[0, BR], [0.1, { cP: -22, pP: -8, hP: -18, pY: -0.06, sx: 0.12, sy: 0.18, sz: 0.1, syaw: 50, spit: 100, lhw: 0.2, lhx: 0.3, lhy: -0.1, lhz: 0.3 }, 'out3'], [0.7, { cP: -14, pY: -0.1 }, 'lin'], [1.15, BR, 'io']]);
let B_TRANS = clip([[0, BR], [0.55, { pY: -0.02, cP: -6, sx: 0.0, sy: 0.3, sz: 0.46, syaw: 0, spit: -86, srol: 0 }, 'out3'], [0.85, { pY: -0.34, cP: 26, pP: 10, hP: 22, sy: -0.2, sz: 0.5, spit: -88 }, 'in3'],
  [2.7, { pY: -0.36, cP: 22, hP: 10 }, 'lin'], [2.85, { pY: -0.18, cP: 2, hP: -12, sy: -0.1 }, 'out3'], [3.5, BR, 'io']]);
let B_DEATH = clip([[0, BR], [0.2, { cP: -22, pP: -10, hP: -24, pY: -0.08, sx: 0.12, sy: -0.2, sz: 0.2, syaw: 30, spit: 30, lhw: 0.5 }, 'out3'], [1.0, { pY: -0.48, cP: 22, pP: 8, hP: 34, sx: 0.0, sy: -0.2, sz: 0.44, syaw: 0, spit: -86, srol: 0, lhw: 1 }, 'io'], [4.5, { cP: 30, hP: 42, pY: -0.5 }, 'lin']]);
let B_INTRO = clip([[0, { ...BR, sx: 0.0, sy: -0.25, sz: 0.44, syaw: 0, spit: -86, srol: 0, pY: -0.05, cP: 10, hP: 18 }], [2.5, { hP: 14 }, 'lin'], [3.3, { sx: -0.02, sy: 0.2, sz: 0.3, spit: 40, srol: 90, syaw: -10, cP: -4, hP: -4 }, 'io'], [4.3, BR, 'io']]);
let B_CRITTED = clip([[0, { ...BR, pY: -0.4, cP: 28, pP: 10, hP: 24, sx: -0.1, sy: -0.46, sz: 0.34, syaw: -10, spit: -70 }], [0.45, { cP: -16, pP: -6, hP: -28, pY: -0.3, lhw: 0.2, lhx: 0.2, lhy: 0.0, lhz: 0.35 }, 'snap'],
  [1.1, { cP: -10, hP: -22 }, 'lin'], [1.25, { pY: -0.52, cP: 42, pP: 14, hP: 34, lhw: 1, sy: -0.5, spit: -80 }, 'snap'], [2.3, { pY: -0.5, cP: 38 }, 'lin'], [3.0, BR, 'io']]);
let B_TAUNT = clip([[0, BR], [0.8, { sx: 0.0, sy: -0.25, sz: 0.44, syaw: 0, spit: -86, srol: 0, pY: -0.05, cP: 10, hP: 12 }, 'io'], [30, { hP: 12 }, 'lin']]);

// ------------------------------------------------------------------ boss definitions (one fight at a time: the active one's data lives in the globals above)
const KNIGHT_DEF = { id: 'knight', name: 'The Ashen Knight', sub: 'Last Warden of the Fallen Crown', hp: 4600, poise: 130, moves: MOVES, hold: HOLD_VAR,
  clips: { ready: B_READY, stagger: B_STAGGER, parried: B_PARRIED, trans: B_TRANS, death: B_DEATH, intro: B_INTRO, critted: B_CRITTED, taunt: B_TAUNT },
  light: 0xff5a1c, tint: 'warm', trail: (h, c) => c.setRGB(lerp(0.55, 1.4, h), lerp(0.55, 0.45, h), lerp(0.6, 0.15, h)),
  victory: { title: 'The Warden Falls', art: 'Ashen Counter', desc: 'Parry, then strike back with the Warden’s own riposte. The Last Cathedral falls silent; the gate beyond waits.' } };
const BOSS_DEFS = { knight: KNIGHT_DEF };
function applyBossDef(d) {
  MOVES = d.moves; HOLD_VAR = d.hold; BOSS_HP = d.hp; BOSS_POISE = d.poise;
  ({ ready: B_READY, stagger: B_STAGGER, parried: B_PARRIED, trans: B_TRANS, death: B_DEATH, intro: B_INTRO, critted: B_CRITTED, taunt: B_TAUNT } = d.clips);
}

// ------------------------------------------------------------------ BOSS controller: utility AI
class Boss {
  constructor(rig, def = KNIGHT_DEF) {
    this.rig = rig; this.def = def; this.pts = []; this.prev = []; this.a = V3(); this.b = V3();
    rig.onStep = (f) => { AUDIO.play('stepBoss'); if (Math.random() < 0.5) AUDIO.play('armor'); VFX.dust(f.pos, 2, 0.2, 0.3); if (this.phase === 2 && Math.random() < 0.5) this.embers(f.pos, 2, 0.2, 0.6); };
    this.reset();
  }
  reset() {
    this.hp = BOSS_HP; this.poise = BOSS_POISE; this.lastPoiseDmg = -9; this.phase = 1; this.pendingTrans = false;
    this.state = 'idle'; this.t = 0; this.move = null; this.gap = 1.2; this.rhythm = 0; this.last = []; this.cd = {};
    this.strafeDir = 1; this.strafeT = 0; this.closeT = 0; this.punishHeal = false; this.approachT = 0; this.queued = null; this.pursue = false; this.lastHitT = -9;
    this.rig.pos.set(0, 0, -6.5); this.rig.yaw = 0; this.rig.resetFeet(); this.vel = V3();
    this.rig.anim.play(this.locoFn(), 0); this.dmgMul = 1; this.dead = false;
    this.setPhaseLook(0);
    this.rig.U.uDissolve.value = 0; this.rig.root.visible = true;
    for (const h of this.rig.heatParts) h.visible = true; if (this.rig.helmGlow) this.rig.helmGlow.visible = true; for (const c of this.rig.capes) c.cloth.mesh.visible = true;
    this.rig.root.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    this.chipHp = BOSS_HP;
    this.heat = 0; this.greatOn = false; this.greatK = 0; this.conjuring = false; this.behindT = 0;
  }
  get pos() { return this.rig.pos; }
  embers(p, n, spread, up) { if (this.def.fx && this.def.fx.motes) VFX.motes(p, n, spread, up); else VFX.embers(p, n, spread, up); }
  locoFn() {
    const self = this;
    return (t, out) => {
      Object.assign(out, B_READY);
      out.cP += Math.sin(t * 1.1) * 1.4; out.pY += Math.sin(t * 1.1) * 0.008; out.spit += Math.sin(t * 1.1 + 1) * 1.2;
      const lv = self.localVel || { x: 0, z: 0 };
      out.pP += clamp(lv.z, -2, 3) * 2; out.pR += clamp(-lv.x, -2, 2) * 2;
      out.st = 1;
    };
  }
  setPhaseLook(k) {
    if (this.def.look) { this.def.look(this, k); this.heat = k; return; }
    // k: 0 = cold iron, 1 = ember phase
    const M = this.rig.M;
    M.blade.emissiveIntensity = k * 2.4;
    const g = this.rig.helmGlow; if (g) g.material.color.setRGB(lerp(0.9, 4.0, k), lerp(0.25, 1.1, k), lerp(0.06, 0.25, k));
    for (const h of this.rig.heatParts) h.material.color.setRGB(k * 3.2, k * 0.9, k * 0.18);
    this.rig.U.uRim.value.setRGB(lerp(0.08, 0.3, k), lerp(0.1, 0.09, k), lerp(0.16, 0.04, k));
    bossLight.intensity = k * 9;
    this.heat = k;
  }
  // ---------------- AI
  score(m, dist) {
    const P2 = this.phase === 2;
    if (!m.ph.includes(this.phase) || m.hidden) return 0;
    if (this.cd[m.name] && GAME.time < this.cd[m.name]) return 0;
    let s = m.w;
    const [r0, r1] = m.range;
    const out = dist < r0 ? r0 - dist : dist > r1 ? dist - r1 : 0;
    s *= Math.exp(-out * out * 1.6);
    if (m.name === 'guard') s = player.recentAtk.length >= 3 && dist < 3.4 ? 2.4 : 0;
    if (m.name === 'stomp') s = this.closeT > 2.0 && dist < 2.3 ? 2.5 : 0;
    if (m.name === 'turn') s = this.behindT > 0.6 && dist < 3.4 ? 3.2 : 0;
    else if (this.behindT > 0.6 && m.name !== 'stomp') s *= 0.3;
    if (m.name === 'backstep') s = this.closeT > 3.0 && dist < 2.4 && Math.hypot(this.pos.x, this.pos.z) < ARENA_R - 3.5 ? 2.2 : 0;
    if (m.name === 'grab') s *= player.state === 'guard' ? 3.5 : 1;
    if (m.ranged) { if (dist > 5.5) s *= 1.8; if (this.punishHeal) s *= 3.5; if (player.state === 'heal') s *= 2; }
    if (m.name === 'delayed') s *= 1 + 0.35 * player.recentDodge.length;
    if (this.punishHeal && (m.name === 'advance' || m.name === 'thrust')) s *= 3.2;
    if (this.punishHeal && m.name === 'hslash' && dist < 3) s *= 2.5;
    if (player.st < 30 && (m.combo || m.name === 'grab')) s *= 1.4;
    if (player.hp < 300 && (m.name === 'advance' || m.name === 'thrust')) s *= 1.3;
    if (this.hp < BOSS_HP * 0.25 && (m.name === 'shockwave' || m.name === 'delayed')) s *= 1.3;
    if (GAME.fightTime < 25 && m.basic) s *= 1.5;
    if (P2 && m.name === 'shockwave') s *= 1.2;
    if (this.pursue && (m.name === 'advance' || m.name === 'thrust' || m.name === 'leap')) s *= 2.8;
    if (this.last[0] === m.name) s *= 0.22; else if (this.last.includes(m.name)) s *= 0.7;
    return s;
  }
  decide() {
    const dist = this.dist();
    const cands = Object.values(MOVES).map((m) => [m, this.score(m, dist)]).filter((c) => c[1] > 0.01).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (!cands.length) { this.gap = 0.4; return; }
    // sharpened weighted pick among close scores
    const tot = cands.reduce((a, c) => a + c[1] * c[1], 0);
    let r = Math.random() * tot, pickM = cands[0][0];
    for (const c of cands) { r -= c[1] * c[1]; if (r <= 0) { pickM = c[0]; break; } }
    this.punishHeal = false; this.pursue = false;
    if (dist > pickM.range[1] + 0.3) { this.queued = pickM; this.state = 'approach'; this.approachT = 0; return; }
    this.startMove(pickM);
  }
  startMove(m, t0 = 0) {
    this.move = m; this.state = 'move'; this.t = t0; this.tm = t0; this.hitDone = {}; this.evDone = {}; this.pdDone = {}; this.branchRolled = false;
    this.warp = null; this.leapFrom = null;
    const hv = HOLD_VAR[m.name];
    // roll-catching: a player who leans on the dodge button sees more held wind-ups
    const rollSpam = player.recentDodge.length >= 3 ? 1.6 : 1;
    if (t0 === 0 && hv && m.hits.length && Math.random() < hv[0] * 1.35 * (this.phase === 2 ? 1.3 : 1) * rollSpam) this.warp = { at: m.hits[0][0] - 0.12, len: hv[1] };
    this.rig.anim.play(m.clip, t0 > 0 ? 0 : 0.12); this.rig.anim.t = t0;
    this.advDist = clamp(this.dist() - 2.1, 0.6, 3.8);
    for (let i = 0; i < 7; i++) if (this.pts[i]) (this.prev[i] || (this.prev[i] = V3())).copy(this.pts[i]);
    if (t0 > 0) { m.ev.forEach((e, i) => { if (e[0] < t0) this.evDone[i] = true; }); if (m.flame && m.flame < t0) this.evDone.flame = true; }
    if (m.cd) this.cd[m.name] = GAME.time + m.cd;
    if (t0 === 0) { this.last.unshift(m.name); this.last.length = Math.min(this.last.length, 3); TELE.moves[m.name] = (TELE.moves[m.name] || 0) + 1; }
  }
  endMove() {
    const m = this.move; this.move = null; this.rig.tremble = 0; this.rig.anim.speed = 1; this.rig.tuck = 0; this.pos.y = 0;
    if (this.rig.grabGlow) this.rig.grabGlow.color.setRGB(0, 0, 0);
    if (this.pendingTrans) { this.startTransition(); return; }
    let g = (m && m.tier ? m.tier.gap : 0.35) + rand(-0.06, 0.12);
    if (this.phase === 2) g *= 0.82;
    this.gap = g / TUNE.aggression;
    this.state = 'observe'; this.t = 0;
    this.rig.anim.play(this.locoFn(), 0.35);
  }
  onPlayerHeal() {
    if (this.state === 'dead' || this.state === 'idle') return;
    if (Math.random() < 0.55) { this.punishHeal = true; if (this.state === 'observe') this.gap = Math.min(this.gap, rand(0.25, 0.5)); }
  }
  dist() { return Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z); }
  startTransition() {
    this.pendingTrans = false; this.state = 'transition'; this.t = 0; this.move = null;
    this.rig.anim.play(B_TRANS, 0.15); this.transFx = {};
    AUDIO.play('transition');
  }
  update(dt) {
    if (dt <= 0) { this.rig.update(0); this.afterRig(); return; }
    this.t += dt;
    const toP = _bu.toP.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z), dist = toP.length();
    const pYaw = Math.atan2(toP.x, toP.z);
    let v = _bu.v.set(0, 0, 0), turn = 0;
    if (dist < 2.6) this.closeT += dt; else this.closeT = Math.max(0, this.closeT - dt * 2);
    // how long the player has been behind the Warden (state-based, not input-based)
    const behind = dist < 3.6 && Math.abs(wrapA(Math.atan2(toP.x, toP.z) - this.rig.yaw)) > 1.9;
    this.behindT = behind ? (this.behindT || 0) + dt : Math.max(0, (this.behindT || 0) - dt * 1.5);
    // poise regen
    if (GAME.time - this.lastPoiseDmg > 2.2) this.poise = Math.min(BOSS_POISE, this.poise + 32 * dt);
    const fwd = _bu.fwd.set(Math.sin(this.rig.yaw), 0, Math.cos(this.rig.yaw));
    switch (this.state) {
      case 'idle': break;
      case 'observe': {
        if (player.dead) { this.state = 'victoryIdle'; this.rig.anim.play(B_TAUNT, 0.5); break; }
        if (this.pendingTrans) { this.startTransition(); break; }
        this.gap -= dt;
        if (this.behindT > 0.6) this.gap = Math.min(this.gap, 0.12);
        turn = 2.6;
        const want = this.phase === 2 ? 2.8 : 3.1;
        const spd = this.phase === 2 ? 2.3 : 2.0;
        // hit-and-run: struck, then the player backs out of reach → close the distance at once
        if (GAME.time - (this.lastHitT || -9) < 1.6 && dist > 3.4 && !this.pursue) { this.pursue = true; this.gap = Math.min(this.gap, 0.15); }
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = rand(1.8, 3.5); this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
        const side = _bu.side.set(toP.z, 0, -toP.x).normalize().multiplyScalar(this.strafeDir);
        if (dist > want + 0.9) v.copy(toP).normalize().multiplyScalar(spd);
        else if (dist < 1.7) v.copy(toP).normalize().multiplyScalar(-0.9);
        else v.copy(side).multiplyScalar(0.65);
        if (Math.hypot(this.pos.x + v.x, this.pos.z + v.z) > ARENA_R - 1.5) { this.strafeDir *= -1; v.copy(toP).normalize().multiplyScalar(0.8); }
        if (this.gap <= 0) this.decide();
        break;
      }
      case 'approach': {
        this.approachT += dt; turn = 3;
        v.copy(toP).normalize().multiplyScalar(this.phase === 2 ? 2.8 : 2.5);
        const m = this.queued;
        if (dist <= m.range[1]) { this.startMove(m); break; }
        if (this.approachT > 2.2) { this.queued = null; this.startMove(dist > 4 ? MOVES.advance : MOVES.thrust); }
        break;
      }
      case 'move': this.updateMove(dt, dist, pYaw, fwd, v); turn = 0; break;
      case 'stagger': if (this.t > 1.6) this.endMove(); break;
      case 'parried': if (this.t > 1.15) this.endMove(); break;
      case 'critted': if (this.t > 3.0) { this.endMove(); this.gap = 0.55; } break;
      case 'transition': this.updateTransition(dt, fwd, v); turn = this.t < 0.5 ? 2 : 0; break;
      case 'dead': this.updateDeath(dt); break;
      case 'victoryIdle': break;
    }
    if (this.state === 'move') { /* handled in updateMove */ }
    else if (turn > 0) this.rig.yaw = dampAngle(this.rig.yaw, pYaw, turn, dt);
    this.vel.x = damp(this.vel.x, v.x, this.state === 'move' ? 30 : 6, dt); this.vel.z = damp(this.vel.z, v.z, this.state === 'move' ? 30 : 6, dt);
    this.pos.addScaledVector(this.vel, dt);
    // arena bounds
    const r = Math.hypot(this.pos.x, this.pos.z); if (r > ARENA_R - 0.6) this.pos.multiplyScalar((ARENA_R - 0.6) / r);
    const c = Math.cos(-this.rig.yaw), s = Math.sin(-this.rig.yaw);
    const lv = this.localVel || (this.localVel = { x: 0, z: 0 }); lv.x = this.vel.x * c + this.vel.z * s; lv.z = -this.vel.x * s + this.vel.z * c;
    this.rig.vel.copy(this.vel);
    this.rig.lookYaw = this.state === 'dead' ? 0 : clamp(wrapA(pYaw - this.rig.yaw) / DEG - (this.rig.anim.pose.pYaw + this.rig.anim.pose.cYaw), -40, 40) * 0.7;
    this.rig.update(dt);
    this.afterRig();
    if (this.def.update) this.def.update(this, dt);
    this.rig.U.uHit.value = Math.max(0, this.rig.U.uHit.value - rdtHit(dt) * 7);
    // phase-2 ambience
    if (this.heat > 0.01 && this.state !== 'dead') {
      const z1 = this.rig.bladeZ1 || 1.05;
      if (Math.random() < dt * 14 * this.heat) { const p = this.rig.sword.localToWorld(V3(rand(-0.04, 0.04), 0, rand(0.1, z1))); this.embers(p, 1, 0.05, 0.9); }
      if (Math.random() < dt * 5 * this.heat) { const p = this.rig.chest.localToWorld(V3(rand(-0.2, 0.2), rand(-0.3, 0.3), rand(-0.1, 0.25))); this.embers(p, 1, 0.1, 0.6); }
      const tip = this.rig.sword.localToWorld(_bu.tip.set(0, 0, 0.6)); bossLight.position.copy(tip);
      bossLight.intensity = this.heat * (8 + Math.sin(GAME.time * 9) * 1.2);
    }
  }
  updateMove(dt, dist, pYaw, fwd, v) {
    const m = this.move;
    // move time (tm) vs. real time: a delay variant freezes the wind-up for a beat, sword trembling
    let t = this.t, frozen = false;
    if (this.warp) { const w = this.warp; if (this.t > w.at) { if (this.t < w.at + w.len) { t = w.at; frozen = true; } else t = this.t - w.len; } }
    this.lastDt = frozen ? 0 : dt; this.tm = t;
    this.rig.anim.speed = 0; this.rig.anim.t = t;
    if (m.leap) {
      const L = m.leap;
      if (t >= L.t0 && !this.leapFrom) {
        this.leapFrom = this.pos.clone();
        const d = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) || 1;
        const reach = Math.max(0, d - 1.7);
        this.leapTo = V3(this.pos.x + (player.pos.x - this.pos.x) / d * reach, 0, this.pos.z + (player.pos.z - this.pos.z) / d * reach);
        const r = Math.hypot(this.leapTo.x, this.leapTo.z); if (r > ARENA_R - 0.8) this.leapTo.multiplyScalar((ARENA_R - 0.8) / r);
      }
      if (this.leapFrom && t < L.t1 + 0.02) {
        const k = clamp((t - L.t0) / (L.t1 - L.t0), 0, 1);
        this.pos.x = lerp(this.leapFrom.x, this.leapTo.x, EASE.io(k)); this.pos.z = lerp(this.leapFrom.z, this.leapTo.z, EASE.io(k));
        this.pos.y = Math.sin(Math.PI * k) * L.h; this.vel.set(0, 0, 0); v.set(0, 0, 0);
        this.rig.tuck = Math.sin(Math.PI * k) * 0.9;
        if (k >= 1) { this.pos.y = 0; this.rig.tuck = 0; }
      }
    }
    if (frozen && !this.warpTold) { this.warpTold = true; }
    if (!frozen) this.warpTold = false;
    // tracking
    let rate = 0; for (const tr of m.track) if (t >= tr[0] && t < tr[1]) rate = tr[2];
    if (rate > 0) { const d = wrapA(pYaw - this.rig.yaw), mx = rate * DEG * dt; this.rig.yaw += clamp(d, -mx, mx); }
    // root motion
    for (const mo of m.motion) {
      if (t >= mo[0] && t < mo[1]) {
        let d = mo[2] === 'adv' ? this.advDist : mo[2];
        if (d > 0 && dist < 1.6) d *= 0.15;
        const k = (t - mo[0]) / (mo[1] - mo[0]);
        const sp = d / (mo[1] - mo[0]) * (1.5 - Math.abs(k - 0.5) * 2) / 1.0;
        v.copy(fwd).multiplyScalar(sp);
      }
    }
    // tremble
    this.rig.tremble = frozen || (m.tremble && t > m.tremble[0] && t < m.tremble[1]) || (m.tremble2 && t > m.tremble2[0] && t < m.tremble2[1]) ? 1.4 : 0;
    // events
    for (let i = 0; i < m.ev.length; i++) {
      const [et, name] = m.ev[i];
      if (t >= et && !this.evDone[i]) { this.evDone[i] = true; this.event(name); }
    }
    if (m.flame && this.phase === 2 && t >= m.flame && !this.evDone.flame) { this.evDone.flame = true; this.flameTrail(); }
    if (m.gather && t > m.gather[0] && t < m.gather[1]) {
      const k = (t - m.gather[0]) / (m.gather[1] - m.gather[0]);
      if (Math.random() < dt * 60) { const tip = this.rig.sword.localToWorld(V3(0, 0, rand(0.3, 1.1))); this.embers(tip, 1, 0.3 * (1 - k) + 0.05, 0.5); }
      bossLight.intensity = 9 + k * 14;
    }
    if (this.rig.grabGlow) {
      const g = m.name === 'grab' ? clamp((t - 0.25) / 0.6, 0, 1) * (t < 1.05 ? 1 : 0) : 0;
      this.rig.grabGlow.color.setRGB(g * 1.1, g * 0.4, g * 0.1);
      if (g > 0.2 && Math.random() < dt * 30) this.embers(this.rig.handFreeL.localToWorld(V3(0, 0.06, 0)), 1, 0.08, 0.4);
    }
    // hits
    for (let i = 0; i < m.hits.length; i++) {
      const h = m.hits[i];
      if (this.hitDone[i] || t < h[0] || t > h[1] + 0.001) continue;
      if (h[5] === 'grab') {
        const hand = this.rig.handFreeL.localToWorld(V3(0, 0.06, 0));
        closestPtSeg(hand, player.a, player.b, _hc);
        if (hand.distanceTo(_hc) < 0.6 && player.state !== 'dead') {
          if (player.invuln) { if (!this.pdDone[i] && player.state === 'dodge' && player.t <= PL.dodge.i0 + 0.16) { this.pdDone[i] = true; perfectDodge(hand); } continue; }
          this.hitDone[i] = true; this.grabPlayer(); return;
        }
        continue;
      }
      const fresh = (t - this.lastDt) < h[0] || frozen; // first active frame: don't sweep through pre-active positions
      // near-miss perfect dodge: the blow goes live while the player, inside its reach, is in the early i-frames
      if (fresh && !this.pdDone[i] && player.state === 'dodge' && player.invuln && player.t <= PL.dodge.i0 + 0.18 && dist < (m.range ? m.range[1] : 3.2) + 0.8) {
        this.pdDone[i] = true; perfectDodge(player.rig.chest.localToWorld(V3()));
      }
      if (sweepCapsule(fresh ? this.pts : this.prev, this.pts, 7, player.a, player.b, 0.34, _hp) && player.state !== 'dead') {
        if (player.invuln) { if (!this.pdDone[i] && player.state === 'dodge' && player.t <= PL.dodge.i0 + 0.16) { this.pdDone[i] = true; perfectDodge(_hp.clone()); } continue; }
        this.hitDone[i] = true;
        const res = player.takeHit({ dmg: h[2], parry: h[3], gst: h[4], name: m.name }, _hp.clone(), this.pos);
        if (res === 'parry') { this.onParried(_hp.clone()); return; }
      }
    }
    // branch (phase 2 derivations)
    if (m.branch && !this.branchRolled && t >= m.branch.at) {
      this.branchRolled = true;
      // phase-2 derivations also appear in phase 1, at half the rate
      const ang = Math.abs(wrapA(pYaw - this.rig.yaw));
      const to = m.branch.pick ? m.branch.pick(this, dist, ang) : (Math.random() < m.branch.p * (this.phase >= m.branch.ph ? 1 : 0.2) && dist < 4.2 ? m.branch.to : null);
      if (to && !player.dead) { const tt = t; this.startMove(MOVES[to], tt); this.rig.anim.play(MOVES[to].clip, 0.06); this.rig.anim.t = tt; return; }
    }
    // guard-counter window
    if (m.guardWin && t > m.guardWin[1]) { this.startMove(dist < 3.3 ? MOVES.hslash : MOVES.thrust); return; }
    bossTrail.on = m.hits.some((h) => t > h[0] - 0.06 && t < h[1] + 0.05 && h[5] !== 'grab');
    if (t >= m.dur) { bossTrail.on = false; this.endMove(); }
  }
  event(name) {
    switch (name) {
      case 'whoosh': AUDIO.play('bossWhoosh'); break;
      case 'armor': AUDIO.play('armor'); break;
      case 'glint': { const tip = this.rig.sword.localToWorld(V3(0, 0, 0.95)); VFX.flash(tip, 0.55, this.phase === 2 ? 0xffb070 : 0xdfe8ff, 0.24); VFX.glint(tip); AUDIO.play('glint'); break; }
      case 'delayTell': AUDIO.play('delayTell'); break;
      case 'grabTell': AUDIO.play('grabTell'); break;
      case 'slamTell': AUDIO.play('slamTell'); break;
      case 'impact': { const tip = this.rig.sword.localToWorld(V3(0, 0, this.greatK > 0.5 && this.move && this.move.reach ? this.move.reach * 0.8 : (this.rig.bladeZ1 ? Math.min(this.rig.bladeZ1 * 0.85, 1.6) : 1.0))); if (tip.y < 0.9) { tip.y = 0.05; groundWave(tip, V3(Math.sin(this.rig.yaw), 0, Math.cos(this.rig.yaw)), this.phase); VFX.dust(tip, 10, 0.4, 1.2); VFX.sparks.emit(tip, V3(0, 1, 0), 6, 3, 1); AUDIO.play('block'); shake(0.35); } break; }
      case 'slam': {
        const tip = this.rig.sword.localToWorld(V3(0, 0, 1.05)); tip.y = 0.05;
        AUDIO.play('slam'); shake(0.9); haptic(35);
        VFX.dust(tip, 24, 0.6, 1.6); this.embers(tip, 30, 0.5, 2.5); VFX.flash(V3(tip.x, 0.5, tip.z), 4, 0xff8a40, 0.25);
        let hitDone = false;
        VFX.ring(tip, 0.4, 8.5, 0.75, (rad) => {
          if (hitDone || player.dead || player.pos.y > 0.35) return;
          const d = Math.hypot(player.pos.x - tip.x, player.pos.z - tip.z);
          if (Math.abs(d - rad) < 0.55) {
            if (player.invuln) { if (!this.pdShock && player.state === 'dodge' && player.t <= PL.dodge.i0 + 0.16) { this.pdShock = true; perfectDodge(player.pos.clone().setY(0.4)); } return; }
            hitDone = true;
            player.takeHit({ dmg: 220, parry: 0, gst: 65, name: 'shockwave' }, V3(player.pos.x, 0.6, player.pos.z), tip);
          }
        });
        this.pdShock = false;
        break;
      }
      case 'stomp': {
        AUDIO.play('stepBoss'); AUDIO.play('slam'); shake(0.45); haptic(18);
        VFX.dust(this.pos, 16, 0.9, 1.0); VFX.ring(V3(this.pos.x, 0, this.pos.z), 0.3, 3.0, 0.3, null, this.def.ringCol);
        this.ringAttack(V3(this.pos.x, 0.05, this.pos.z), 3.0, 0.3, 150, 45);
        break;
      }
      case 'fireArc': if (this.phase === 2) this.flameTrail(); break;
      case 'leapTakeoff': AUDIO.play('bossWhoosh'); AUDIO.play('stepBoss'); VFX.dust(this.pos, 12, 0.6, 1.2); this.embers(this.pos.clone().setY(0.4), 10, 0.5, 1.5); shake(0.2); break;
      case 'leapLand': {
        const tip = this.rig.sword.localToWorld(V3(0, 0, 1.0)); tip.y = 0.05;
        AUDIO.play('slam'); shake(0.8); haptic(30); VFX.dust(this.pos, 22, 0.8, 1.4); this.embers(tip, 24, 0.5, 2);
        if (!this.hitDone[0]) { const L = this.def.leapRing || [3.8, 0.4, 160]; this.ringAttack(tip, L[0], L[1], L[2], 50); } // the shockwave only matters if the blade missed
        break;
      }
      case 'grabSlam': {
        if (player.state === 'grabbed') {
          player.state = 'hit';
          player.takeHit({ dmg: 400, parry: 0, gst: 0, name: 'grab', kind: 'grabSlam' }, player.rig.chest.localToWorld(V3()), this.pos);
          VFX.dust(player.pos, 16, 0.6, 1.4); AUDIO.play('slam'); shake(0.8);
        }
        break;
      }
      default: if (this.def.event) this.def.event(this, name);
    }
  }
  flameTrail() {
    const tip = this.rig.sword.localToWorld(V3(0, 0, 1.0)); tip.y = 0;
    const fwd = V3(Math.sin(this.rig.yaw), 0, Math.cos(this.rig.yaw));
    const a = tip.clone().addScaledVector(fwd, -0.6), b = tip.clone().addScaledVector(fwd, 2.4);
    VFX.fireLine(a, b, 1.5); AUDIO.play('fire', { dur: 1.5 });
    hazards.push({ a, b, t: 0, dur: 1.5, tick: 0 });
  }
  grabPlayer() {
    AUDIO.play('grab'); haptic(20);
    player.setState('grabbed', P_GRABBED, 0.06); player.activeHit = null;
    this.startMove(MOVES.grabHold);
  }
  ringAttack(c, r1, dur, dmg, gst) {
    let done = false, pd = false;
    VFX.ring(c, 0.3, r1, dur, (rad) => {
      if (done || player.dead || player.pos.y > 0.35) return; // jump over it
      const d = Math.hypot(player.pos.x - c.x, player.pos.z - c.z);
      if (Math.abs(d - rad) < 0.55) {
        if (player.invuln) { if (!pd && player.state === 'dodge' && player.t <= PL.dodge.i0 + 0.16) { pd = true; perfectDodge(player.pos.clone().setY(0.4)); } return; }
        done = true; player.takeHit({ dmg, parry: 0, gst, name: this.move ? this.move.name : 'ring' }, V3(player.pos.x, 0.6, player.pos.z), c);
      }
    }, this.def.ringCol);
  }
  onCritted(p) {
    this.state = 'critted'; this.t = 0; this.move = null; this.warp = null; this.rig.tremble = 0; this.rig.anim.speed = 1; this.rig.tuck = 0; this.pos.y = 0; bossTrail.on = false;
    this.rig.yaw = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    this.rig.anim.play(B_CRITTED, 0.06); this.poise = BOSS_POISE;
    if (this.rig.grabGlow) this.rig.grabGlow.color.setRGB(0, 0, 0);
    CAM.critT = 2.2;
  }
  critDamage(p, frac) {
    const dmg = PL.crit[p.critKind] * frac * TUNE.playerDmg;
    this.hp -= dmg; TELE.crits = (TELE.crits || 0) + (frac > 0.5 ? 1 : 0);
    const c = this.rig.chest.localToWorld(V3(0, 0.05, 0.22));
    AUDIO.play('hitBossHeavy'); if (frac > 0.5) AUDIO.play('finalBlow'); haptic(frac > 0.5 ? 40 : 20);
    hitStop(frac > 0.5 ? 0.14 : 0.09); shake(frac > 0.5 ? 0.6 : 0.35);
    VFX.sparks.emit(c, V3(0, 0.5, 0), 18, 5, 1); VFX.ashBurst(c, 40, 3); this.embers(c, 20, 0.2, 2); VFX.flash(c, 1.8, 0xffe0b0, 0.12);
    for (let i = 0; i < 16; i++) VFX.norm.emit(c.x, c.y, c.z, rand(-1.5, 1.5), rand(-0.5, 2), rand(-1.5, 1.5), rand(0.6, 1.1), rand(0.1, 0.18), rand(0.35, 0.5), [0.16, 0.08, 0.07], [0.1, 0.07, 0.07], 0.75, 3, 2, 0);
    this.rig.U.uHit.value = 0.9; this.rig.flinchV += 18;
    UI_DMG(dmg);
    if (this.hp <= 0) { this.hp = 0; this.die(c); return; }
    if (this.phase === 1 && this.hp <= BOSS_HP * TUNE.phaseAt) this.pendingTrans = true;
  }
  onParried(pt) {
    TELE.parries++; player.fp = Math.min(PL.fp, player.fp + PL.fpGain);
    AUDIO.play('parry'); haptic(28); hitStop(0.07); shake(0.5);
    VFX.sparks.emit(pt, V3(0, 0.6, 0), 26, 7, 1.0, 1.2); VFX.flash(pt, 2.2, 0xfff4e0, 0.16);
    GRADE.uFlash.value = 0.6;
    bossTrail.on = false;
    this.poiseDamage(45);
    if (this.state !== 'stagger') { this.state = 'parried'; this.t = 0; this.move = null; this.rig.tremble = 0; this.rig.anim.play(B_PARRIED, 0.04); }
    player.state = 'parry'; player.t = 0.3;
  }
  poiseDamage(p) {
    if (this.state === 'transition' || this.state === 'dead') return;
    this.poise -= p; this.lastPoiseDmg = GAME.time;
    if (this.poise <= 0) {
      this.poise = BOSS_POISE; this.state = 'stagger'; this.t = 0; this.move = null; this.rig.tremble = 0; bossTrail.on = false;
      this.rig.anim.play(B_STAGGER, 0.05); hitStop(0.08); AUDIO.play('stagger'); haptic(25); shake(0.5);
      VFX.ashBurst(this.rig.chest.localToWorld(V3(0, 0, 0.2)), 30, 2.5);
      if (this.rig.grabGlow) this.rig.grabGlow.color.setRGB(0, 0, 0);
    }
  }
  // player blade → boss
  receiveHit(h, pt) {
    if (this.state === 'dead' || this.state === 'critted') return;
    const m = this.move;
    if (m && m.guardWin && this.t > m.guardWin[0] && this.t < m.guardWin[1]) {
      const f = V3(Math.sin(this.rig.yaw), 0, Math.cos(this.rig.yaw)), d = V3(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z).normalize();
      if (f.dot(d) > 0.25) {
        AUDIO.play('block'); VFX.sparks.emit(pt, V3(0, 0.5, 0), 14, 5, 0.8); VFX.flash(pt, 1.0, 0xffd0a0, 0.1); hitStop(0.05); shake(0.3);
        player.activeHit = null; player.setState('deflect', P_DEFLECT, 0.03); playerTrail.on = false;
        this.startMove(MOVES.counter);
        return;
      }
    }
    // Ashen riposte: the first blow after a perfect dodge bites much deeper
    const riposte = GAME.time < player.pdCounterUntil;
    if (riposte) { player.pdCounterUntil = -9; VFX.flash(pt, 2.0, 0x9fc4ff, 0.14); this.embers(pt, 14, 0.2, 1.6); AUDIO.play('finalBlow'); GRADE.uFlash.value = 0.35; }
    let dmg = h.dmg * TUNE.playerDmg * (this.state === 'transition' ? 0.2 : 1) * (riposte ? PL.pdCounter.dmg : 1);
    this.hp -= dmg; UI_DMG(dmg);
    const heavy = h.heavy || h.big || riposte;
    AUDIO.play(heavy ? 'hitBossHeavy' : 'hitBoss'); haptic(heavy ? 14 : 8);
    VFX.sparks.emit(pt, V3(0, 0.3, 0), heavy ? 14 : 8, 4.5, 0.9);
    VFX.ashBurst(pt, heavy ? 18 : 10, 1.6); VFX.flash(pt, heavy ? 1.2 : 0.7, 0xffd6a0, 0.07);
    hitStop(heavy ? 0.05 : 0.032); shake(heavy ? 0.28 : 0.14);
    this.rig.flinchV += heavy ? 16 : 8;
    // twist away from the blow, a small shove, a brief white flare on the armour, metal shards
    const f = _bu.fwd.set(Math.sin(this.rig.yaw), 0, Math.cos(this.rig.yaw)), hx = pt.x - this.pos.x, hz = pt.z - this.pos.z;
    const side = Math.sign(f.x * hz - f.z * hx) || 1;
    this.rig.flinchYV += side * (heavy ? 22 : 12);
    const push = heavy ? 0.12 : 0.05, pl = Math.hypot(hx, hz) || 1; this.pos.x -= hx / pl * push; this.pos.z -= hz / pl * push;
    this.rig.U.uHit.value = heavy ? 0.85 : 0.5;
    for (let i = 0; i < (heavy ? 10 : 6); i++) VFX.norm.emit(pt.x, pt.y, pt.z, rand(-3, 3), rand(0.5, 3.5), rand(-3, 3), rand(0.35, 0.7), 0.035, 0.02, [0.24, 0.23, 0.22], [0.12, 0.12, 0.12], 1, 9, 0.4, 2);
    for (let i = 0; i < (heavy ? 12 : 6); i++) VFX.norm.emit(pt.x, pt.y, pt.z, rand(-1.4, 1.4), rand(-0.3, 1.4), rand(-1.4, 1.4), rand(0.5, 0.9), rand(0.08, 0.14), rand(0.25, 0.4), [0.16, 0.09, 0.08], [0.1, 0.08, 0.08], 0.7, 2.5, 2.5, 0);
    if (this.hp <= 0) { this.hp = 0; this.die(pt); return; }
    if (this.phase === 1 && this.hp <= BOSS_HP * TUNE.phaseAt && !this.pendingTrans && this.state !== 'transition') this.pendingTrans = true;
    if (this.pendingTrans && (this.state === 'observe' || this.state === 'approach' || this.state === 'stagger')) { if (this.state !== 'stagger') this.startTransition(); }
    this.lastHitT = GAME.time;
    const inRecovery = this.state === 'move' && m && m.lastEnd > 0 && m.name !== 'counter' && (this.tm ?? this.t) > m.lastEnd;
    if (inRecovery) { if (this.recMove !== m) { this.recMove = m; this.recHits = 0; } this.recHits++; }
    this.poiseDamage(h.poise + (riposte ? PL.pdCounter.poise : 0));
    if (inRecovery && this.state === 'move' && this.recHits > m.tier.allow && Math.random() < 0.75) {
      this.recHits = 0; this.startMove(MOVES.counter); this.event('glint'); return;
    }
    // a knight does not stand still while struck between attacks: sometimes answer quickly
    if ((this.state === 'observe' || this.state === 'approach') && Math.random() < 0.8) this.gap = Math.min(this.gap, rand(0.1, 0.25));
  }
  updateTransition(dt, fwd, v) {
    const t = this.t, F = this.transFx;
    if (t < 0.55) v.copy(fwd).multiplyScalar(-2.6 * (1 - t / 0.55));
    if (t > 0.84 && !F.plunge) {
      F.plunge = true; AUDIO.play('plunge'); shake(0.5); haptic(20);
      const tip = this.rig.sword.localToWorld(V3(0, 0, 1.05)); tip.y = 0.05; VFX.dust(tip, 18, 0.5, 1.2); VFX.sparks.emit(tip, V3(0, 1, 0), 12, 4, 1);
      this.plungePt = tip;
    }
    if (t > 0.9 && t < 2.8 && this.plungePt) {
      const k = (t - 0.9) / 1.9;
      const n = Math.floor(dt * 160 * Q.particles);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), r = rand(4, 11), y = rand(0.1, 5);
        const p = V3(this.plungePt.x + Math.sin(a) * r, y, this.plungePt.z + Math.cos(a) * r);
        const life = rand(0.9, 1.4);
        const vv = V3(this.plungePt.x - p.x, 1.2 - y, this.plungePt.z - p.z).divideScalar(life);
        VFX.norm.emit(p.x, p.y, p.z, vv.x, vv.y, vv.z, life, 0.06, 0.03, [0.6, 0.58, 0.56], k > 0.4 ? (this.def.fx ? this.def.fx.converge : [1.2, 0.5, 0.2]) : [0.4, 0.4, 0.4], 0.9, 0, 0, 2);
      }
    }
    if (t > 1.5) { const k = smooth(clamp((t - 1.5) / 1.3, 0, 1)); this.setPhaseLook(k); if (this.def.tint === 'violet') ARENA.violet = k; else { ARENA.warm = k; GRADE.uWarm.value = k * 0.5; } }
    if (t > 2.8 && !F.burst) {
      F.burst = true; this.phase = 2; MUSIC.setPhase(2, 1.5);
      shake(0.7); haptic(30);
      const p = this.plungePt || this.pos;
      VFX.ring(p, 0.3, 9, 0.9, null, this.def.ringCol); this.embers(V3(p.x, 0.5, p.z), 60, 1.2, 3); VFX.flash(V3(p.x, 1, p.z), 3, this.def.fx ? this.def.fx.flash : 0xff6a20, 0.3);
      AUDIO.play('fire', { dur: 1.2 });
    }
    if (t >= 3.5) { this.endMove(); this.gap = 0.5; }
  }
  die(pt) {
    this.state = 'dead'; this.t = 0; this.move = null; this.dead = true; this.rig.tremble = 0; bossTrail.on = false;
    this.rig.anim.play(B_DEATH, 0.04);
    hitStop(0.14); shake(0.9); haptic(45); AUDIO.play('finalBlow');
    VFX.sparks.emit(pt, V3(0, 0.6, 0), 30, 7, 1.1, 1.3); VFX.flash(pt, 3, 0xffffff, 0.2); GRADE.uFlash.value = 0.8;
    MUSIC.stop(0.15);
    onBossDeath();
  }
  updateDeath(dt) {
    const t = this.t;
    if (t > 1.0 && !this.kneeled) { this.kneeled = true; AUDIO.play('kneel'); VFX.dust(this.pos, 14, 0.8, 0.8); shake(0.3); }
    if (t > 1.6 && !this.crumbled) { this.crumbled = true; AUDIO.play('death'); }
    if (t > 1.7) {
      const k = clamp((t - 1.7) / 3.2, 0, 1);
      this.rig.U.uDisY.value = 0; this.rig.U.uDissolve.value = k;
      this.setPhaseLook(Math.max(0, this.heat - dt * 0.4));
      const n = Math.floor(dt * 110 * Q.particles * (1 - k * 0.5));
      for (let i = 0; i < n; i++) {
        const src = pick([this.rig.chest, this.rig.pelvis, this.rig.head, this.rig.thL, this.rig.upR, this.rig.foL]);
        const p = src.localToWorld(V3(rand(-0.15, 0.15), rand(0, 0.25), rand(-0.15, 0.15)));
        VFX.norm.emit(p.x, p.y, p.z, rand(-0.3, 0.3) + 0.4, rand(0.4, 1.4), rand(-0.3, 0.3), rand(1.2, 2.4), 0.05, 0.02, [0.62, 0.6, 0.58], [0.4, 0.4, 0.4], 0.9, -0.15, 0.4, 2);
        if (Math.random() < 0.25) this.embers(p, 1, 0.05, 0.7);
      }
      if (k > 0.6) this.rig.root.traverse((m) => { if (m.isMesh) m.castShadow = false; });
      if (k > 0.35) { for (const h of this.rig.heatParts) h.visible = false; if (this.rig.helmGlow) this.rig.helmGlow.visible = false; if (this.rig.grabGlow) this.rig.grabGlow.color.setRGB(0, 0, 0); }
      if (k >= 1) { this.rig.root.visible = false; for (const c of this.rig.capes) c.cloth.mesh.visible = false; }
      for (const c of this.rig.capes) c.cloth.mesh.castShadow = k < 0.6;
    }
  }
  afterRig() {
    for (let i = 0; i < 7; i++) { this.prev[i] = (this.prev[i] || V3()).copy(this.pts[i] || V3()); }
    this.rig.bladePoints(this.pts, 7, 0.1, this.move && this.move.reach && this.greatK > 0.5 ? this.move.reach : (this.rig.bladeZ1 || 1.12));
    if (!this.prevInit) { for (let i = 0; i < 7; i++) this.prev[i].copy(this.pts[i]); this.prevInit = true; }
    bossTrail.push(this.pts[1], this.pts[6], GAME.time);
    capsuleOf(this.pos, 0.45 + this.pos.y, 2.2 + this.pos.y, this.a, this.b);
  }
}

// fire hazards (phase 2 flame trail)
const hazards = [];
const waves = [];
function groundWave(o, dir, phase) {
  waves.push({ o: o.clone().setY(0), d: dir.clone().normalize(), t: 0, dur: 0.36, len: phase === 2 ? 4.4 : 3.6, w: 0.5, done: false, dmg: phase === 2 ? 110 : 85 });
}
function updateWaves(dt) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i]; w.t += dt;
    if (w.t > w.dur) { waves.splice(i, 1); continue; }
    const s = w.len * EASE.out(w.t / w.dur), fx = w.o.x + w.d.x * s, fz = w.o.z + w.d.z * s;
    if (Math.random() < dt * 70) VFX.dust(V3(fx, 0.05, fz), 1, 0.25, 0.9);
    if (w.done || player.dead || player.pos.y > 0.35) continue;
    const rx = player.pos.x - w.o.x, rz = player.pos.z - w.o.z, along = rx * w.d.x + rz * w.d.z, lat = Math.abs(rx * w.d.z - rz * w.d.x);
    if (along > s - 0.8 && along < s + 0.2 && lat < w.w + 0.3) {
      if (player.invuln) continue;
      w.done = true; player.takeHit({ dmg: w.dmg, parry: 0, gst: 30, name: 'groundWave' }, V3(player.pos.x, 0.4, player.pos.z), w.o);
    }
  }
}
const extraHazards = [], extraClears = [];
function updateHazards(dt) {
  for (const f of extraHazards) f(dt);
  updateWaves(dt);
  for (let i = hazards.length - 1; i >= 0; i--) {
    const h = hazards[i]; h.t += dt; h.tick -= dt;
    if (h.t > h.dur) { hazards.splice(i, 1); continue; }
    if (player.dead || player.invuln || h.tick > 0 || player.state === 'knock' || player.state === 'down' || player.pos.y > 0.3) continue;
    closestPtSeg(V3(player.pos.x, 0, player.pos.z), h.a, h.b, _hc);
    if (Math.hypot(player.pos.x - _hc.x, player.pos.z - _hc.z) < 0.75) {
      h.tick = 0.45; player.hp -= 35 * TUNE.bossDmg; TELE.dmgTaken += 35; player.hurtFx = Math.max(player.hurtFx, 0.5); player.lastHitBy = 'flame';
      AUDIO.play('hitPlayer'); VFX.embers(player.pos.clone().setY(0.5), 6, 0.3, 1);
      if (player.hp <= 0) player.die();
    }
  }
}
function perfectDodge(p) {
  TELE.perfect++; player.fp = Math.min(PL.fp, player.fp + PL.fpGain);
  player.st = Math.min(PL.st, player.st + PL.dodge.st); // the dodge was free
  player.pdCounterUntil = GAME.time + PL.pdCounter.win;
  VFX.flash(player.rig.sword.localToWorld(V3(0, 0, 0.8)), 0.7, 0x9fc4ff, 0.3); VFX.glint(player.rig.sword.localToWorld(V3(0, 0, 1.0)));
  GAME.slowT = 0.12; GRADE.uFocus.value = 1;
  AUDIO.play('perfect'); haptic(10);
  for (let i = 0; i < 22; i++) { const a = i / 22 * TAU; VFX.norm.emit(player.pos.x + Math.sin(a) * 0.4, 0.9 + rand(-0.4, 0.5), player.pos.z + Math.cos(a) * 0.4, Math.sin(a) * 2.2, rand(-0.2, 0.4), Math.cos(a) * 2.2, rand(0.4, 0.7), 0.05, 0.02, [0.75, 0.85, 1.0], [0.5, 0.6, 0.8], 0.9, 0, 3, 2); }
}
function resolveCombat() {
  // player blade vs boss
  if (player.activeHit && !player.hitDone && boss.state !== 'dead') {
    const fresh = !player.wasActive;
    if (sweepCapsule(fresh ? player.pts : player.prev, player.pts, 7, boss.a, boss.b, 0.62, _hp)) {
      player.hitDone = true;
      boss.receiveHit(player.activeHit, _hp.clone());
    }
  }
  player.wasActive = !!player.activeHit;
  // body separation
  if (player.state !== 'grabbed' && boss.state !== 'dead') {
    const dx = player.pos.x - boss.pos.x, dz = player.pos.z - boss.pos.z, d = Math.hypot(dx, dz), minD = 1.15;
    if (d < minD && d > 1e-4) {
      const push = minD - d;
      player.pos.x += dx / d * push * 0.85; player.pos.z += dz / d * push * 0.85;
      boss.pos.x -= dx / d * push * 0.15; boss.pos.z -= dz / d * push * 0.15;
    }
  }
  // player bounds (soft)
  const r = Math.hypot(player.pos.x, player.pos.z);
  if (r > ARENA_R) player.pos.multiplyScalar(ARENA_R / r);
  // grabbed: attach to boss's free hand
  if (player.state === 'grabbed') {
    const h = boss.rig.handFreeL.localToWorld(V3(0, 0.05, 0.05));
    player.pos.set(h.x, Math.max(0, h.y - 1.25), h.z);
    player.rig.yaw = boss.rig.yaw + Math.PI;
    if (!boss.move || boss.move.name !== 'grabHold') { player.pos.y = 0; player.setState('down', P_DOWN, 0.1); }
  } else if (player.state !== 'jump') player.pos.y = damp(player.pos.y, 0, 12, 1 / 60);
}
