// ------------------------------------------------------------------ poses & clips
// All angles in degrees. Sword pose is in chest space: grip position (sx,sy,sz), blade heading yaw (+ = character's left),
// pitch (+ = blade raised), roll (twist along blade). lhw = left hand weight on the grip.
const POSE0 = { pY: 0, pP: 0, pR: 0, pYaw: 0, cYaw: 0, cP: 0, cR: 0, hP: 0, hYaw: 0, sx: 0, sy: -0.33, sz: 0.36, syaw: -5, spit: 35, srol: 90, lhw: 1, lhx: 0.2, lhy: -0.3, lhz: 0.25, st: 1 };
const PKEYS = Object.keys(POSE0);
function P(o) { return { ...POSE0, ...o }; }
function clip(keys, loop = false) {
  let cur = { ...POSE0 };
  const out = [];
  for (const k of keys) { cur = { ...cur, ...k[1] }; out.push({ t: k[0], p: cur, e: k[2] || 'io' }); }
  return { keys: out, dur: out[out.length - 1].t, loop };
}
function sampleClip(c, t, out) {
  const ks = c.keys;
  if (c.loop && c.dur > 0) t = t % c.dur;
  if (t <= ks[0].t) { for (const k of PKEYS) out[k] = ks[0].p[k]; return out; }
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i].t) {
      const a = ks[i - 1], b = ks[i];
      const e = EASE[b.e]((t - a.t) / Math.max(1e-5, b.t - a.t));
      for (const k of PKEYS) out[k] = a.p[k] + (b.p[k] - a.p[k]) * e;
      return out;
    }
  }
  const l = ks[ks.length - 1].p; for (const k of PKEYS) out[k] = l[k];
  return out;
}
class Anim {
  constructor() { this.pose = { ...POSE0 }; this.from = { ...POSE0 }; this.tmp = { ...POSE0 }; this.src = null; this.t = 0; this.bt = 1; this.blend = 0.1; this.speed = 1; }
  play(src, blend = 0.1) {
    Object.assign(this.from, this.pose);
    this.src = src; this.t = 0; this.bt = 0; this.blend = blend; this.speed = 1;
  }
  update(dt) {
    this.t += dt * this.speed; this.bt += dt;
    if (typeof this.src === 'function') this.src(this.t, this.tmp); else if (this.src) sampleClip(this.src, this.t, this.tmp);
    const a = this.blend > 0 ? smooth(Math.min(this.bt / this.blend, 1)) : 1;
    for (const k of PKEYS) this.pose[k] = this.from[k] + (this.tmp[k] - this.from[k]) * a;
  }
}

// ------------------------------------------------------------------ rig (procedural skeleton with 2-bone IK and foot planting)
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v1 = V3(), _v2 = V3(), _v3 = V3(), _v4 = V3(), _v5 = V3(), _v6 = V3();
const _X = V3(), _Y = V3(), _Z = V3(), _v7 = V3();
function orientSeg(g, a, b, pole) {
  g.position.copy(a);
  _Y.subVectors(b, a); const len = _Y.length(); _Y.divideScalar(len || 1);
  _X.crossVectors(_Y, pole); if (_X.lengthSq() < 1e-6) _X.set(1, 0, 0).cross(_Y); _X.normalize();
  _Z.crossVectors(_X, _Y);
  _m4.makeBasis(_X, _Y, _Z); g.quaternion.setFromRotationMatrix(_m4);
  g.scale.y = len / g.userData.len;
}
// returns mid joint in `mid`, end in `end`
function ik2(a, target, L1, L2, pole, mid, end) {
  _v1.subVectors(target, a);
  let dist = _v1.length();
  const d = _v1.divideScalar(dist || 1);
  let s = 1;
  const L = L1 + L2;
  if (dist > L * 0.995) s = Math.min(dist / (L * 0.995), 1.07);
  const l1 = L1 * s, l2 = L2 * s;
  dist = clamp(dist, Math.abs(l1 - l2) + 0.01, (l1 + l2) * 0.9995);
  const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _v2.copy(pole).addScaledVector(d, -pole.dot(d));
  if (_v2.lengthSq() < 1e-6) _v2.set(0, -1, 0);
  _v2.normalize();
  mid.copy(a).addScaledVector(d, cosA * l1).addScaledVector(_v2, sinA * l1);
  end.copy(a).addScaledVector(d, dist);
}

class Rig {
  constructor(o) {
    this.o = o = Object.assign({ scale: 1, hipH: 0.95, hipW: 0.11, thigh: 0.45, shin: 0.44, ankle: 0.085, chestY: 0.33, shX: 0.2, shY: 0.17, upper: 0.31, fore: 0.3, headY: 0.31, grip: 0.12, stanceF: 0.13 }, o);
    this.root = new THREE.Group();
    this.root.scale.setScalar(o.scale);
    this.pelvis = new THREE.Group(); this.root.add(this.pelvis);
    this.chest = new THREE.Group(); this.chest.position.y = o.chestY; this.pelvis.add(this.chest);
    this.head = new THREE.Group(); this.head.position.y = o.headY; this.chest.add(this.head);
    this.swordSpace = new THREE.Group(); this.root.add(this.swordSpace); // body-facing frame at chest position (sword yaw is authored relative to facing)
    this.sword = new THREE.Group(); this.swordSpace.add(this.sword);
    const seg = (len) => { const g = new THREE.Group(); g.userData.len = len; this.root.add(g); return g; };
    this.upR = seg(o.upper); this.foR = seg(o.fore); this.upL = seg(o.upper); this.foL = seg(o.fore);
    this.thR = seg(o.thigh); this.shR = seg(o.shin); this.thL = seg(o.thigh); this.shL = seg(o.shin);
    this.footR = new THREE.Group(); this.footL = new THREE.Group(); this.root.add(this.footR, this.footL);
    this.handFreeL = new THREE.Group(); this.root.add(this.handFreeL);
    this.gripL = new THREE.Group(); this.gripL.position.z = -o.grip; this.sword.add(this.gripL); // left gauntlet on grip
    this.anim = new Anim();
    this.vel = V3();
    this.yaw = 0;
    this.lookYaw = 0; // head look additive
    this.feet = [
      { side: 1, pos: V3(), yaw: 0, stepping: false, t: 0, from: V3(), to: V3(), fromYaw: 0, toYaw: 0, dur: 0.3, idle: 0 },
      { side: -1, pos: V3(), yaw: 0, stepping: false, t: 0, from: V3(), to: V3(), fromYaw: 0, toYaw: 0, dur: 0.3, idle: 0 },
    ];
    this.lastStep = 0;
    this.onStep = null;
    this.bob = 0;
    this.flinch = 0; this.flinchV = 0; // additive hit reaction (pitch)
    this.flinchY = 0; this.flinchYV = 0; // additive hit reaction (twist toward the blow)
    this.tumble = 0; // forward roll angle applied at the pelvis (rolling dodge)
    this.tuck = 0;   // 0 = feet planted on the ground, 1 = legs tucked to the body (rolls, jumps, leaps)
    this.tremble = 0;
    this.meshes = [];
  }
  get pos() { return this.root.position; }
  resetFeet() {
    for (const f of this.feet) { this.idealFoot(f, f.pos, 0); f.stepping = false; f.yaw = this.yaw; }
  }
  idealFoot(f, out, predict) {
    const s = this.o.scale, st = this.anim.pose.st;
    const lx = f.side * this.o.hipW * 1.15 * s;
    const lz = (f.side > 0 ? 1 : -1) * this.o.stanceF * s * st;
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    out.set(this.root.position.x + lx * c + lz * sn, 0, this.root.position.z - lx * sn + lz * c);
    out.addScaledVector(this.vel, predict); out.y = 0;
    return out;
  }
  updateFeet(dt) {
    if (dt <= 0) return;
    const s = this.o.scale;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    let worst = null, worstE = 0;
    for (const f of this.feet) {
      if (f.stepping) {
        f.t += dt / f.dur;
        if (f.t >= 1) {
          f.t = 1; f.stepping = false; f.pos.copy(f.to); f.yaw = f.toYaw; f.idle = 0;
          if (this.onStep) this.onStep(f, speed);
        } else {
          const e = smooth(f.t);
          f.pos.lerpVectors(f.from, f.to, e);
          f.yaw = f.fromYaw + wrapA(f.toYaw - f.fromYaw) * e;
        }
        continue;
      }
      f.idle += dt;
      this.idealFoot(f, _v4, 0.1);
      const err = Math.hypot(_v4.x - f.pos.x, _v4.z - f.pos.z);
      const yerr = Math.abs(wrapA(this.yaw - f.yaw));
      const thr = (speed > 0.4 ? 0.16 : (f.idle > 0.25 ? 0.07 : 0.2)) * s;
      const score = err / thr + (yerr > 0.6 ? 1.2 : 0);
      if (score > 1 && score > worstE) { worst = f; worstE = score; }
    }
    if (worst) {
      const other = this.feet[0] === worst ? this.feet[1] : this.feet[0];
      if (!other.stepping || worstE > 2.6) {
        const f = worst;
        f.stepping = true; f.t = 0; f.from.copy(f.pos); f.fromYaw = f.yaw;
        f.dur = clamp(0.34 - speed * 0.035, 0.12, 0.34) * Math.sqrt(s);
        this.idealFoot(f, f.to, 0.1 + f.dur * 0.55);
        f.toYaw = this.yaw;
      }
    }
  }
  update(dt) {
    this.anim.update(dt);
    this.updateFeet(dt);
    const p = this.anim.pose, o = this.o;
    this.root.rotation.y = this.yaw;
    // hit flinch spring
    this.flinchV += (-this.flinch * 180 - this.flinchV * 18) * dt;
    this.flinch += this.flinchV * dt;
    this.flinchYV += (-this.flinchY * 150 - this.flinchYV * 15) * dt;
    this.flinchY += this.flinchYV * dt;
    let lift = 0;
    for (const f of this.feet) if (f.stepping) lift = Math.max(lift, Math.sin(f.t * Math.PI));
    const bob = 0.018 * lift;
    this.pelvis.position.set(0, o.hipH + p.pY + bob, 0);
    this.pelvis.rotation.set((p.pP - this.flinch * 3) * DEG + this.tumble, (p.pYaw + this.flinchY * 4) * DEG, p.pR * DEG, 'YXZ');
    const tr = this.tremble ? Math.sin(performance.now() * 0.09) * this.tremble : 0;
    this.chest.rotation.set((p.cP - this.flinch * 10) * DEG, (p.cYaw + this.flinchY * 14) * DEG, (p.cR + tr * 0.4 + this.flinchY * 5) * DEG, 'YXZ');
    this.head.rotation.set((p.hP + this.flinch * 6) * DEG, clamp(p.hYaw + this.lookYaw, -60, 60) * DEG, 0, 'YXZ');
    this.pelvis.updateMatrix(); this.chest.updateMatrix();
    _v1.set(0, 0, 0).applyMatrix4(this.chest.matrix).applyMatrix4(this.pelvis.matrix);
    this.swordSpace.position.copy(_v1);
    this.sword.position.set(p.sx, p.sy, p.sz);
    this.sword.rotation.set(-(p.spit + tr) * DEG, (p.syaw + tr * 0.6) * DEG, p.srol * DEG, 'YXZ');
    this.root.updateMatrixWorld(true);

    // ---- legs
    const hipR = _v3.set(-o.hipW, -0.04, 0), hipL = _v4.set(o.hipW, -0.04, 0);
    this.pelvis.localToWorld(hipR); this.root.worldToLocal(hipR);
    this.pelvis.localToWorld(hipL); this.root.worldToLocal(hipL);
    const fR = this._fR || (this._fR = V3()), fL = this._fL || (this._fL = V3());
    const ftR = this.feet[1], ftL = this.feet[0];
    const liftR = ftR.stepping ? Math.sin(ftR.t * Math.PI) * 0.1 : 0, liftL = ftL.stepping ? Math.sin(ftL.t * Math.PI) * 0.1 : 0;
    fR.copy(ftR.pos); fR.y = 0; this.root.worldToLocal(fR); fR.y = o.ankle + liftR;
    fL.copy(ftL.pos); fL.y = 0; this.root.worldToLocal(fL); fL.y = o.ankle + liftL;
    if (this.tuck > 0.001) {
      // tucked legs follow the pelvis (knees drawn in) instead of staying planted on the ground
      const tR = _v1.set(-o.hipW, -o.thigh * 0.95, o.thigh * 0.45); this.pelvis.localToWorld(tR); this.root.worldToLocal(tR); fR.lerp(tR, this.tuck);
      const tL = _v1.set(o.hipW, -o.thigh * 0.85, o.thigh * 0.3); this.pelvis.localToWorld(tL); this.root.worldToLocal(tL); fL.lerp(tL, this.tuck);
    }
    const Lleg = (o.thigh + o.shin) * 0.985;
    let drop = 0;
    if (this.tuck < 0.3) {
    for (const [h, f] of [[hipR, fR], [hipL, fL]]) {
      const hd = Math.hypot(h.x - f.x, h.z - f.z);
      const maxV = Math.sqrt(Math.max(0.01, Lleg * Lleg - hd * hd));
      drop = Math.max(drop, (h.y - f.y) - maxV);
    }
    }
    if (drop > 0) { drop = Math.min(drop, 0.35); this.pelvis.position.y -= drop; hipR.y -= drop; hipL.y -= drop; this.swordSpace.position.y -= drop; this.pelvis.updateMatrixWorld(true); this.swordSpace.updateMatrixWorld(true); }
    const py = this.anim.pose.pYaw * DEG, pq = this.pelvis.quaternion;
    const kR = _v5.set(-0.25 + Math.sin(py), 0, Math.cos(py)), mid = _v6, end = _v7;
    if (this.tuck > 0.001) kR.set(-0.25, 0, 1).applyQuaternion(pq);
    ik2(hipR, fR, o.thigh, o.shin, kR, mid, end);
    orientSeg(this.thR, hipR, mid, kR); orientSeg(this.shR, mid, end, kR);
    this.placeFoot(this.footR, end, ftR);
    const kL = _v5.set(0.25 + Math.sin(py), 0, Math.cos(py));
    if (this.tuck > 0.001) kL.set(0.25, 0, 1).applyQuaternion(pq);
    ik2(hipL, fL, o.thigh, o.shin, kL, mid, end);
    orientSeg(this.thL, hipL, mid, kL); orientSeg(this.shL, mid, end, kL);
    this.placeFoot(this.footL, end, ftL);

    // ---- arms
    const shR = _v3.set(-o.shX, o.shY, -0.01), shL = _v4.set(o.shX, o.shY, -0.01);
    this.chest.localToWorld(shR); this.root.worldToLocal(shR);
    this.chest.localToWorld(shL); this.root.worldToLocal(shL);
    const hR = this._hR || (this._hR = V3()), hL = this._hL || (this._hL = V3()), fr = this._fr || (this._fr = V3());
    hR.set(0, 0, 0); this.sword.localToWorld(hR); this.root.worldToLocal(hR);
    hL.set(0, 0, -o.grip); this.sword.localToWorld(hL); this.root.worldToLocal(hL);
    if (p.lhw < 0.999) {
      fr.set(p.lhx, p.lhy, p.lhz); this.swordSpace.localToWorld(fr); this.root.worldToLocal(fr);
      hL.lerp(fr, 1 - p.lhw);
    }
    // elbow poles rotate with the torso
    _q.copy(this.pelvis.quaternion).multiply(this.chest.quaternion);
    const pR = _v5.set(-0.8, -0.9, -0.45).applyQuaternion(_q);
    ik2(shR, hR, o.upper, o.fore, pR, mid, end);
    orientSeg(this.upR, shR, mid, pR); orientSeg(this.foR, mid, end, pR);
    const pL = _v5.set(0.8, -0.9, -0.45).applyQuaternion(_q);
    ik2(shL, hL, o.upper, o.fore, pL, mid, end);
    orientSeg(this.upL, shL, mid, pL); orientSeg(this.foL, mid, end, pL);
    this.handFreeL.position.copy(end); this.handFreeL.quaternion.copy(this.foL.quaternion);
    const onGrip = p.lhw > 0.5;
    this.gripL.visible = onGrip; this.handFreeL.visible = !onGrip;
    this.root.updateMatrixWorld(true);
  }
  placeFoot(g, ankle, f) {
    g.position.copy(ankle); g.position.y = Math.max(ankle.y, this.o.ankle * 0.9) - this.o.ankle;
    g.rotation.set(f.stepping ? Math.sin(f.t * Math.PI) * 0.35 * (f.t < 0.5 ? -1 : 1) : 0, wrapA(f.yaw - this.yaw) + f.side * 0.12, 0, 'YXZ');
  }
  // world-space blade sample points (for hit sweeps)
  bladePoints(out, n, z0, z1) {
    for (let i = 0; i < n; i++) {
      const v = out[i] || (out[i] = V3());
      v.set(0, 0, lerp(z0, z1, i / (n - 1)));
      this.sword.localToWorld(v);
    }
    return out;
  }
}

// ------------------------------------------------------------------ verlet cloth (world space)
class Cloth {
  constructor(cols, rows, width, length, material, pinRows = 1, flipV = true) {
    this.cols = cols; this.rows = rows; this.pinRows = pinRows;
    const n = cols * rows; this.n = n;
    this.p = new Float32Array(n * 3); this.q = new Float32Array(n * 3);
    this.geo = new THREE.PlaneGeometry(width, length, cols - 1, rows - 1);
    // DataTextures are not flipped: flip v so the torn edge of the cloth texture hangs at the bottom
    if (flipV) { const uv = this.geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    this.c = [];
    const dx = width / (cols - 1), dy = length / (rows - 1);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (c < cols - 1) this.c.push(i, i + 1, dx);
      if (r < rows - 1) this.c.push(i, i + cols, dy);
      if (r < rows - 2) this.c.push(i, i + cols * 2, dy * 2 * 0.98);
      if (c < cols - 1 && r < rows - 1) this.c.push(i, i + cols + 1, Math.hypot(dx, dy));
    }
    this.dy = dy;
    this.inited = false;
  }
  reset(pins, down) {
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const i = (r * this.cols + c) * 3, pin = pins[c];
      const x = pin.x + down.x * this.dy * r, y = pin.y + down.y * this.dy * r, z = pin.z + down.z * this.dy * r;
      this.p[i] = this.q[i] = x; this.p[i + 1] = this.q[i + 1] = y; this.p[i + 2] = this.q[i + 2] = z;
    }
    this.inited = true;
  }
  update(dt, pins, pins2, colliders, wind) {
    const p = this.p, q = this.q, cols = this.cols;
    if (dt > 0) {
      const g = -9.8 * dt * dt, damp = 0.965;
      for (let i = cols; i < this.n; i++) {
        const k = i * 3;
        const vx = (p[k] - q[k]) * damp, vy = (p[k + 1] - q[k + 1]) * damp, vz = (p[k + 2] - q[k + 2]) * damp;
        q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2];
        p[k] += vx + wind.x * dt * dt; p[k + 1] += vy + g; p[k + 2] += vz + wind.z * dt * dt;
      }
      const C = this.c;
      for (let it = 0; it < 3; it++) {
        this.pin(pins, pins2);
        for (let j = 0; j < C.length; j += 3) {
          const a = C[j] * 3, b = C[j + 1] * 3, rest = C[j + 2];
          const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const diff = (d - rest) / d * 0.5;
          const aPinned = C[j] < cols * this.pinRows, bPinned = C[j + 1] < cols * this.pinRows;
          if (aPinned && bPinned) continue;
          const wa = aPinned ? 0 : (bPinned ? 2 : 1), wb = bPinned ? 0 : (aPinned ? 2 : 1);
          p[a] += dx * diff * wa; p[a + 1] += dy * diff * wa; p[a + 2] += dz * diff * wa;
          p[b] -= dx * diff * wb; p[b + 1] -= dy * diff * wb; p[b + 2] -= dz * diff * wb;
        }
        // colliders (capsules)
        for (let i = cols * this.pinRows; i < this.n; i++) {
          const k = i * 3;
          _v1.set(p[k], p[k + 1], p[k + 2]);
          for (const cl of colliders) {
            closestPtSeg(_v1, cl.a, cl.b, _v2);
            _v3.subVectors(_v1, _v2); const d = _v3.length();
            if (d < cl.r) { _v1.copy(_v2).addScaledVector(_v3, cl.r / (d || 1e-4)); }
          }
          if (_v1.y < 0.02) _v1.y = 0.02;
          p[k] = _v1.x; p[k + 1] = _v1.y; p[k + 2] = _v1.z;
        }
      }
    }
    this.pin(pins, pins2);
    const pos = this.geo.attributes.position;
    pos.array.set(p); pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
  pin(pins, pins2) {
    const p = this.p, q = this.q;
    for (let c = 0; c < this.cols; c++) {
      const k = c * 3; p[k] = q[k] = pins[c].x; p[k + 1] = q[k + 1] = pins[c].y; p[k + 2] = q[k + 2] = pins[c].z;
      if (pins2 && this.pinRows > 1) { const k2 = (this.cols + c) * 3; p[k2] = q[k2] = pins2[c].x; p[k2 + 1] = q[k2 + 1] = pins2[c].y; p[k2 + 2] = q[k2 + 2] = pins2[c].z; }
    }
  }
}
